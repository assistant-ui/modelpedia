import {
  envOrNull,
  filterModalities,
  inferFamily,
  type ModelEntry,
  normalizeDate,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch xAI models from:
 * 1. Docs .md endpoint (specs + pricing, no key needed)
 * 2. /v1/models API (release dates, needs key)
 */

const sources = readSources("xai");
const DOCS_MD = sources.docs as string;
const API_URL = sources.api as string;

interface DocsModel {
  id: string;
  modalities: { input: string[]; output: string[] };
  capabilities: Record<string, boolean>;
  context_window?: number;
  pricing?: { input: number; output: number; cached_input?: number };
}

interface ApiModel {
  id: string;
  created: number;
}

function parseModalities(s: string): { input: string[]; output: string[] } {
  // "text, image → text" or "text, image, video → video"
  const parts = s.split("→").map((p) => p.trim());
  const input =
    parts[0]
      ?.split(",")
      .map((m) => m.trim())
      .filter(Boolean) ?? [];
  const output =
    parts[1]
      ?.split(",")
      .map((m) => m.trim())
      .filter(Boolean) ?? [];
  return filterModalities(input, output);
}

function parseCaps(s: string): Record<string, boolean> {
  const caps: Record<string, boolean> = { streaming: true };
  if (s.includes("functions")) caps.tool_call = true;
  if (s.includes("structured")) caps.structured_output = true;
  if (s.includes("reasoning")) caps.reasoning = true;
  return caps;
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
    // "Grok 3 and Grok 4" → ["grok-3", "grok-4"]
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

function parseDocsModels(md: string): {
  models: Map<string, DocsModel>;
  knowledgeCutoffs: Map<string, string>;
} {
  const models = new Map<string, DocsModel>();

  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    // Skip header/separator rows
    if (line.includes("Model") && line.includes("Modalities")) continue;
    if (/^\|\s*-+\s*\|/.test(line)) continue;

    const cells = line
      .replace(/\[x2\]/g, "")
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 5) continue;

    const id = cells[0];
    if (!id.startsWith("grok-")) continue;

    const mods = parseModalities(cells[1]);
    const caps = parseCaps(cells[2]);
    const context = cells[3] ? Number(cells[3].replace(/,/g, "")) : undefined;

    // Pricing: "$2.00 ($0.20) / $6.00"
    const pricingStr = cells[5] ?? "";
    const inputMatch = pricingStr.match(/^\$([\d.]+)/);
    const cachedMatch = pricingStr.match(/\(\$([\d.]+)\)/);
    const outputMatch = pricingStr.match(/\/\s*\$([\d.]+)/);

    const pricing =
      inputMatch && outputMatch
        ? {
            input: Number(inputMatch[1]),
            output: Number(outputMatch[1]),
            ...(cachedMatch ? { cached_input: Number(cachedMatch[1]) } : {}),
          }
        : undefined;

    // Deduplicate (some models appear twice for different tiers)
    if (models.has(id)) continue;

    models.set(id, {
      id,
      modalities: mods,
      capabilities: caps,
      context_window: context && !Number.isNaN(context) ? context : undefined,
      pricing,
    });
  }

  const knowledgeCutoffs = parseKnowledgeCutoffs(md);

  return { models, knowledgeCutoffs };
}

async function main() {
  console.log("Fetching xAI models from docs...");

  const docsMd = await fetch(DOCS_MD).then((r) => r.text());
  const { models: docsModels, knowledgeCutoffs } = parseDocsModels(docsMd);
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
      page_url: `https://docs.x.ai/docs/models#${id}`,
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

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
