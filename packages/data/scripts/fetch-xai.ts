import {
  envOrNull,
  filterModalities,
  inferFamily,
  type ModelEntry,
  normalizeDate,
  readSources,
  runGenerate,
  upsertModel,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch xAI models from:
 * 1. Docs HTML page (specs + pricing, embedded as escaped JSON registry)
 * 2. /v1/models API (release dates, needs key)
 *
 * Why HTML, not the .md endpoint: as of 2026-04, /developers/models.md no
 * longer contains the model table — pricing is rendered client-side from a
 * registry embedded in the HTML page (auth_mgmt.LanguageModel /
 * ImageGenerationModel / VideoGenerationModel). The .md page only has prose
 * (knowledge cutoffs, etc.) which we still parse from the HTML body.
 */

const sources = readSources("xai");
const DOCS_URL = sources.docs as string;
const API_URL = sources.api as string;

interface DocsModel {
  id: string;
  modalities: { input: string[]; output: string[] };
  capabilities: Record<string, boolean>;
  context_window?: number;
  pricing?: { input?: number; output?: number; cached_input?: number };
}

interface ApiModel {
  id: string;
  created: number;
}

const MODALITY_CODES: Record<number, string> = {
  1: "text",
  2: "image",
  3: "audio",
  10: "video",
};

function decodeModalities(codes: number[]): string[] {
  return codes.map((c) => MODALITY_CODES[c]).filter(Boolean);
}

/** Walk back from `hit` to the opening `{`, then forward to its matching `}`. */
function findEnclosingObject(text: string, hit: number): string | null {
  let i = hit;
  let depth = 0;
  while (i >= 0) {
    const ch = text[i];
    if (ch === "}") depth++;
    else if (ch === "{") {
      if (depth === 0) break;
      depth--;
    }
    i--;
  }
  if (i < 0) return null;
  let j = i;
  let d = 0;
  let inStr = false;
  let escaped = false;
  while (j < text.length) {
    const ch = text[j];
    if (escaped) {
      escaped = false;
    } else if (ch === "\\") {
      escaped = true;
    } else if (ch === '"') {
      inStr = !inStr;
    } else if (!inStr) {
      if (ch === "{") d++;
      else if (ch === "}") {
        d--;
        if (d === 0) return text.slice(i, j + 1);
      }
    }
    j++;
  }
  return null;
}

function parseDollarN(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
}

function parseModalityList(obj: string, key: string): number[] {
  const m = obj.match(new RegExp(`"${key}":\\[([^\\]]*)\\]`));
  if (!m) return [];
  return m[1]
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

function parseFeatures(obj: string): Record<string, boolean> {
  const caps: Record<string, boolean> = { streaming: true, batch: true };
  const features = obj.match(/"features":\{([^}]+)\}/);
  if (!features) return caps;
  const block = features[1];
  if (/"functionCalling":true/.test(block)) caps.tool_call = true;
  if (/"structuredOutputs":true/.test(block)) caps.structured_output = true;
  if (/"reasoning":true/.test(block)) caps.reasoning = true;
  return caps;
}

function parseModelEntry(obj: string): DocsModel | null {
  const nameMatch = obj.match(/"name":"([^"]+)"/);
  if (!nameMatch) return null;
  const id = nameMatch[1];

  const inputCodes = parseModalityList(obj, "inputModalities");
  const outputCodes = parseModalityList(obj, "outputModalities");
  const modalities = filterModalities(
    decodeModalities(inputCodes),
    decodeModalities(outputCodes),
  );

  const capabilities = parseFeatures(obj);
  if (modalities.input.includes("image")) capabilities.vision = true;

  const ctxMatch = obj.match(/"maxPromptLength":(\d+)/);
  const context_window = ctxMatch ? Number(ctxMatch[1]) : undefined;

  // Token prices are in 1e-4 USD per 1M tokens (e.g. 20000 → $2.00 / 1M)
  const inputN = parseDollarN(
    obj.match(/"promptTextTokenPrice":"\$n(\d+)"/)?.[1],
  );
  const outputN = parseDollarN(
    obj.match(/"completionTextTokenPrice":"\$n(\d+)"/)?.[1],
  );
  const cachedN = parseDollarN(
    obj.match(/"cachedPromptTokenPrice":"\$n(\d+)"/)?.[1],
  );

  let pricing: DocsModel["pricing"];
  if (inputN != null || outputN != null || cachedN != null) {
    pricing = {};
    if (inputN != null) pricing.input = inputN / 10000;
    if (outputN != null) pricing.output = outputN / 10000;
    if (cachedN != null) pricing.cached_input = cachedN / 10000;
  }

  return {
    id,
    modalities,
    capabilities,
    context_window: Number.isFinite(context_window)
      ? (context_window as number)
      : undefined,
    pricing,
  };
}

const MODEL_TYPE_NAMES = [
  "auth_mgmt.LanguageModel",
  "auth_mgmt.ImageGenerationModel",
  "auth_mgmt.VideoGenerationModel",
];

function parseDocsModels(html: string): {
  models: Map<string, DocsModel>;
  knowledgeCutoffs: Map<string, string>;
} {
  // Strings inside the HTML are double-escaped (`\"`). Unescape so we can
  // slice JSON object substrings cleanly.
  const text = html.replaceAll('\\"', '"');

  const models = new Map<string, DocsModel>();
  for (const typeName of MODEL_TYPE_NAMES) {
    const escaped = typeName.replace(/\./g, "\\.");
    const re = new RegExp(`"\\$typeName":"${escaped}"`, "g");
    for (const m of text.matchAll(re)) {
      const obj = findEnclosingObject(text, m.index!);
      if (!obj) continue;
      const entry = parseModelEntry(obj);
      if (!entry) continue;
      // Each model appears once per cluster (us-east-1, eu-west-1) — keep the first.
      if (models.has(entry.id)) continue;
      models.set(entry.id, entry);
    }
  }

  const knowledgeCutoffs = parseKnowledgeCutoffs(text);
  return { models, knowledgeCutoffs };
}

/**
 * Extract knowledge cutoff from prose like:
 *   "The knowledge cut-off date of Grok 3 and Grok 4 is November, 2024."
 * Returns a map of model-prefix → normalised date (e.g. "grok-3" → "2024-11").
 */
function parseKnowledgeCutoffs(md: string): Map<string, string> {
  const cutoffs = new Map<string, string>();
  const re =
    /knowledge\s+cut[- ]?off\s+(?:date\s+)?of\s+(.+?)\s+is\s+([A-Z][a-z]+,?\s+\d{4})/gi;
  for (const m of md.matchAll(re)) {
    const date = normalizeDate(m[2].replace(",", ""));
    if (!date) continue;
    const names = m[1]
      .split(/\s+and\s+|,\s*/i)
      .map((n) => n.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean);
    for (const name of names) {
      cutoffs.set(name, date);
    }
  }
  return cutoffs;
}

async function main() {
  console.log("Fetching xAI models from docs...");

  const docsHtml = await fetch(DOCS_URL).then((r) => r.text());
  const { models: docsModels, knowledgeCutoffs } = parseDocsModels(docsHtml);
  console.log(`Parsed ${docsModels.size} models from docs`);
  if (knowledgeCutoffs.size > 0) {
    console.log(
      `Found knowledge cutoffs: ${[...knowledgeCutoffs.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
  }

  // Optional: API for release dates
  const apiKey = envOrNull("XAI_API_KEY");
  const apiModels = new Map<string, ApiModel>();
  if (apiKey) {
    console.log("Fetching from API...");
    const res = await fetch(API_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { data: ApiModel[] };
      for (const m of json.data) {
        if (m.id.startsWith("grok")) apiModels.set(m.id, m);
      }
      console.log(`Found ${apiModels.size} models from API`);
    }
  }

  let written = 0;
  for (const [id, doc] of docsModels) {
    const apiModel = apiModels.get(id);
    const releaseDate = apiModel
      ? new Date(apiModel.created * 1000).toISOString().split("T")[0]
      : undefined;

    // Match knowledge cutoff by prefix (e.g. "grok-4" matches "grok-4-1-fast-reasoning")
    let knowledgeCutoff: string | undefined;
    for (const [prefix, date] of knowledgeCutoffs) {
      if (
        id === prefix ||
        id.startsWith(`${prefix}-`) ||
        id.startsWith(`${prefix}.`)
      ) {
        knowledgeCutoff = date;
        break;
      }
    }

    const entry: ModelEntry = {
      id,
      name: id,
      family: inferFamily(id),
      license: "proprietary",
      page_url: `https://docs.x.ai/developers/models/${id}`,
      context_window: doc.context_window,
      modalities: doc.modalities,
      capabilities: doc.capabilities,
      ...(doc.capabilities.reasoning ? { reasoning_tokens: true } : {}),
      release_date: releaseDate,
      knowledge_cutoff: knowledgeCutoff,
    };

    if (doc.pricing) {
      entry.pricing = doc.pricing;
    }

    written += upsertWithSnapshot("xai", entry);
  }

  // Mark models not in registry as deprecated (skips ones already deprecated).
  const activeIds = new Set(docsModels.keys());
  const modelsDir = new URL("../providers/xai/models/", import.meta.url);
  for (const file of await Array.fromAsync(
    new Bun.Glob("*.json").scan(modelsDir.pathname),
  )) {
    const id = file.replace(".json", "");
    if (activeIds.has(id)) continue;
    const existing = await Bun.file(`${modelsDir.pathname}/${file}`).json();
    if (existing.status === "deprecated") continue;
    upsertModel("xai", { id, name: id, status: "deprecated" } as ModelEntry);
    written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
