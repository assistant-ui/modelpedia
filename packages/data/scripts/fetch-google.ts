import {
  assertParsed,
  buildPricing,
  envOrNull,
  filterModalities,
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";
import { fetchMarkdown, fetchWithRetry } from "./parse.ts";

/**
 * Fetch Google Gemini models from:
 * 1. Docs models page (model list + links to detail pages)
 * 2. Individual model detail pages (specs)
 * 3. Deprecation page (deprecated models + dates)
 * 4. Generative Language API (optional, needs key — for more accurate token limits)
 */

const sources = readSources("google");
const MODELS_PAGE = sources.models as string;
const PRICING_PAGE = sources.pricing as string;
const DEPRECATIONS_PAGE = sources.deprecations as string;

// ── Markdoc helpers ──

function cleanMarkdoc(text: string): string {
  return text
    .replace(/\{%[\s\S]*?%\}/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Rows of a Markdoc `{% table %}` body: rows split on `---`, cells on `* ` bullets. */
function parseMarkdocTable(body: string): string[][] {
  return body
    .split(/^[ \t]*---[ \t]*$/m)
    .map((row) =>
      row
        .split(/^[ \t]*\*[ \t]+/m)
        .slice(1)
        .map(cleanMarkdoc),
    )
    .filter((cells) => cells.length > 0);
}

function markdocTables(md: string): string[][][] {
  return [...md.matchAll(/\{% table[^%]*%\}([\s\S]*?)\{% \/table %\}/g)].map(
    (m) => parseMarkdocTable(m[1]),
  );
}

// ── Get model slugs from docs overview page ──

async function fetchModelSlugs(): Promise<string[]> {
  const md = await fetchMarkdown(MODELS_PAGE);
  // Model links look like /docs/models/<slug> (gemini, gemma, imagen, veo, embeddings, ...)
  const slugs = [
    ...new Set(
      [...md.matchAll(/\/docs\/models\/([a-z][a-z0-9._-]+)/g)]
        .map((m) => m[1])
        .filter((s) => s !== "all" && !s.startsWith("_")),
    ),
  ];
  assertParsed(slugs.length, "google (model slugs)");
  return slugs;
}

// ── Fetch model detail page ──

interface ModelSpec {
  id: string;
  description?: string;
  page_url: string;
  input_tokens?: number;
  output_tokens?: number;
  knowledge_cutoff?: string;
  capabilities: Record<string, boolean>;
  inputModalities: string[];
  outputModalities: string[];
}

function isSupported(md: string, feature: string): boolean {
  const m = md.match(
    new RegExp(
      `\\[\\*\\*${feature}\\*\\*\\]\\([^)]*\\)\\s*\\{% badge ([^%]*?)/%\\}`,
      "i",
    ),
  );
  return !!m && /type="supported"/.test(m[1]);
}

function parseModalities(
  flat: string,
): { input: string[]; output: string[] } | null {
  const m = flat.match(
    /\*\*Inputs?\*\*\s*(.+?)\s*\*\*Outputs?\*\*\s*(.+?)\s*---/,
  );
  if (!m) return null;
  const pick = (text: string) =>
    ["text", "image", "video", "audio"].filter((k) =>
      new RegExp(`\\b${k}`, "i").test(text),
    );
  return { input: pick(m[1]), output: pick(m[2]) };
}

async function fetchModelSpec(slug: string): Promise<ModelSpec | null> {
  const md = await fetchMarkdown(`${MODELS_PAGE}/${slug}`).catch((err) => {
    console.warn(`  skip ${slug}: ${err instanceof Error ? err.message : err}`);
    return null;
  });
  if (!md) return null;
  const flat = md
    .replace(/\{%[\s\S]*?%\}/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ");

  // Model ID - the slug itself is the ID
  const id = slug;
  const page_url = `${MODELS_PAGE}/${slug}`;

  // Description: intro paragraphs between the page title and the first section,
  // minus deprecation notices and the AI Studio button label.
  const intro = (md.split(/^# .+$/m)[1] ?? "").split(/^## /m)[0];
  const paragraphs = intro
    .split(/\n\s*\n/)
    .map((p) =>
      cleanMarkdoc(p.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")).replace(
        /Try in (?:Google )?AI Studio/g,
        "",
      ),
    )
    .map((p) => p.trim())
    .filter((p) => p.length >= 20 && !/\bdeprecated\b/i.test(p));
  const description = paragraphs.length > 0 ? paragraphs.join(" ") : undefined;

  // Token limits
  const inputMatch = flat.match(
    /\*\*(?:Input token limit|Context window[^*]*)\*\*\s*([\d,]+)/i,
  );
  const inputTokens = inputMatch
    ? Number(inputMatch[1].replace(/,/g, ""))
    : undefined;
  const outputMatch = flat.match(
    /\*\*(?:Output token limit|Max output)\*\*\s*([\d,]+)/i,
  );
  const outputLimit = outputMatch
    ? Number(outputMatch[1].replace(/,/g, ""))
    : 0;
  const outputTokens = outputLimit > 0 ? outputLimit : undefined;

  // Knowledge cutoff
  const kcMatch = flat.match(/Knowledge cutoff[\s*]*([A-Z][a-z]+ \d{4})/);
  const knowledgeCutoff = kcMatch?.[1];

  // Capabilities
  const caps: Record<string, boolean> = { streaming: true };
  if (isSupported(md, "Function calling")) caps.tool_call = true;
  if (isSupported(md, "Structured outputs")) caps.structured_output = true;
  if (isSupported(md, "Thinking")) caps.reasoning = true;
  if (isSupported(md, "Batch API")) caps.batch = true;

  // Modalities come from the "Supported data types" row
  const parsedMods = parseModalities(flat);
  const mods = parsedMods
    ? filterModalities(parsedMods.input, parsedMods.output)
    : null;
  const inputMods = mods?.input.length ? mods.input : ["text"];
  const outputMods = mods?.output.length ? mods.output : ["text"];

  // Override modalities for non-text models based on ID
  // Modality overrides: [inputModalities, outputModalities, capabilities]
  const MODALITY_OVERRIDES: [string, string[], string[]][] = [
    ["imagen", ["text"], ["image"]],
    ["veo", ["text", "image"], ["video"]],
    ["lyria", ["text"], ["audio"]],
  ];

  for (const [prefix, input, output] of MODALITY_OVERRIDES) {
    if (!mods && id.startsWith(prefix)) {
      return {
        id,
        description,
        page_url,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        knowledge_cutoff: knowledgeCutoff,
        capabilities: caps,
        inputModalities: input,
        outputModalities: output,
      };
    }
  }

  if (id.includes("embedding")) {
    return {
      id,
      description,
      page_url,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      knowledge_cutoff: knowledgeCutoff,
      capabilities: {},
      inputModalities: mods ? inputMods : ["text"],
      outputModalities: ["text"],
    };
  }

  return {
    id,
    description,
    page_url,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    knowledge_cutoff: knowledgeCutoff,
    capabilities: caps,
    inputModalities: inputMods,
    outputModalities: outputMods,
  };
}

// ── Parse pricing page ──

interface PricingInfo {
  input?: number;
  output?: number;
  cached_input?: number;
  batch_input?: number;
  batch_output?: number;
  tiers?: {
    label: string;
    unit: string;
    columns: string[];
    rows: { label: string; values: (number | null)[] }[];
  }[];
}

function extractFirstPrice(text: string, pattern: RegExp): number | undefined {
  const m = text.match(pattern);
  return m ? Number(m[1]) : undefined;
}

const PRICE_LABELS = {
  input: /^input price/i,
  output: /^output price/i,
  cached: /^(?:context )?cach(?:e|ing) price/i,
};

function priceFromRows(rows: string[][], label: RegExp): number | undefined {
  const row = rows.find((r) => label.test(r[0]));
  const cell = row && row.length > 1 ? row[row.length - 1] : undefined;
  return cell ? extractFirstPrice(cell, /\$(\d+\.?\d*)/) : undefined;
}

async function fetchPricing(): Promise<Map<string, PricingInfo>> {
  const md = await fetchMarkdown(PRICING_PAGE);
  const map = new Map<string, PricingInfo>();
  const linked: [string, PricingInfo][] = [];

  // Each model is an `## Name {% id="slug" %}` section with Standard/Batch tabs
  const sections = md.split(/^(?=## )/m);
  for (const section of sections) {
    const headingId = section.match(/^## .*\{% id="([^"]+)" %\}/)?.[1];
    if (!headingId) continue;

    const tabs = [
      ...section.matchAll(
        /\{% tab title="([^"]*)" %\}([\s\S]*?)\{% \/tab %\}/g,
      ),
    ].map((m) => ({ title: m[1], body: m[2] }));
    const blocks =
      tabs.length > 0 ? tabs : [{ title: "Standard", body: section }];
    const rowsOf = (title: RegExp) => {
      const block = blocks.find((b) => title.test(b.title));
      return block ? (markdocTables(block.body)[0] ?? []) : undefined;
    };

    const stdRows = rowsOf(/^standard/i) ?? markdocTables(blocks[0].body)[0];
    if (!stdRows) continue;
    const stdIn = priceFromRows(stdRows, PRICE_LABELS.input);
    const stdOut = priceFromRows(stdRows, PRICE_LABELS.output);
    const stdCached = priceFromRows(stdRows, PRICE_LABELS.cached);

    if (stdIn == null && stdOut == null) continue;

    const info: PricingInfo = {};
    info.input = stdIn;
    info.output = stdOut;
    if (stdCached != null) info.cached_input = stdCached;

    const tierRows: { label: string; values: (number | null)[] }[] = [];
    tierRows.push({
      label: "Standard",
      values: [stdIn ?? null, stdCached ?? null, stdOut ?? null],
    });

    const batchRows = rowsOf(/^batch/i);
    if (batchRows) {
      const batchIn = priceFromRows(batchRows, PRICE_LABELS.input);
      const batchOut = priceFromRows(batchRows, PRICE_LABELS.output);
      if (batchIn != null) info.batch_input = batchIn;
      if (batchOut != null) info.batch_output = batchOut;

      if (batchIn != null || batchOut != null) {
        tierRows.push({
          label: "Batch",
          values: [batchIn ?? null, null, batchOut ?? null],
        });
      }
    }

    info.tiers = [
      {
        label: "Text tokens",
        unit: "Per 1M tokens",
        columns: ["Input", "Cached input", "Output"],
        rows: tierRows,
      },
    ];

    // Key by the heading id, then by model codes linked in the section header
    // (several models can share one section, and a heading id always wins)
    map.set(headingId, info);
    const head = section.split(/\{% (?:tabs|table)\b/)[0];
    for (const m of head.matchAll(/\/docs\/models\/([a-z][a-z0-9._-]*)/g))
      linked.push([m[1], info]);
  }
  for (const [key, info] of linked) if (!map.has(key)) map.set(key, info);

  return map;
}

// ── Parse deprecation page ──

interface DeprecationInfo {
  shutdown?: string;
  replacement?: string | string[];
}

async function fetchDeprecations(): Promise<Map<string, DeprecationInfo>> {
  const md = await fetchMarkdown(DEPRECATIONS_PAGE);
  const depMap = new Map<string, DeprecationInfo>();

  // Tables: Model | Release | Shutdown | Replacement
  for (const rows of markdocTables(md)) {
    for (const texts of rows) {
      if (texts.length < 3) continue;
      const modelId = texts[0].replace(/`/g, "");
      if (
        !modelId.startsWith("gemini") &&
        !modelId.startsWith("imagen") &&
        !modelId.startsWith("veo") &&
        !modelId.startsWith("text-embedding") &&
        !modelId.startsWith("embedding")
      )
        continue;

      // Use the shutdown column (index 2) directly — don't guess from all dates.
      // If the shutdown cell is empty or not a date, the model is not deprecated.
      const shutdown = texts[2].match(/[A-Za-z]+ \d+, \d{4}/)?.[0];
      const rawReplacement = (texts[3] ?? "").replace(/\([^)]*\)/g, "");
      const coded = [...rawReplacement.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      const replacements = (
        coded.length > 0
          ? coded
          : rawReplacement
              .split(/\s+or\s+|,/)
              .map((r) => r.trim())
              .filter((r) => /^[a-z][a-z0-9._-]*$/i.test(r) && /\d|-/.test(r))
      ).filter((r) => r && r !== modelId);

      // Only record models that actually have a shutdown date
      if (!shutdown) continue;

      depMap.set(modelId, {
        shutdown,
        replacement:
          replacements.length > 1
            ? replacements
            : replacements.length === 1
              ? replacements[0]
              : undefined,
      });
    }
  }

  return depMap;
}

// ── Optional: API fetch for enrichment ──

interface ApiModel {
  name: string;
  displayName: string;
  description: string;
  inputTokenLimit: number;
  outputTokenLimit: number;
  supportedGenerationMethods: string[];
}

async function fetchApiModels(apiKey: string): Promise<Map<string, ApiModel>> {
  const map = new Map<string, ApiModel>();
  let pageToken: string | undefined;

  while (true) {
    const url = new URL(sources.api as string);
    url.searchParams.set("key", apiKey);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);

    const res = await fetchWithRetry(url.toString());
    if (!res.ok) break;
    const json = (await res.json()) as {
      models: ApiModel[];
      nextPageToken?: string;
    };

    for (const m of json.models) {
      const id = m.name.replace("models/", "");
      map.set(id, m);
    }

    if (!json.nextPageToken) break;
    pageToken = json.nextPageToken;
  }

  return map;
}

// ── Main ──

async function main() {
  console.log("Fetching Google Gemini models from docs...");

  const [slugs, deprecations, pricing] = await Promise.all([
    fetchModelSlugs(),
    fetchDeprecations(),
    fetchPricing(),
  ]);
  assertParsed(deprecations.size, "google (deprecations)");
  assertParsed(pricing.size, "google (pricing)");
  console.log(
    `Found ${slugs.length} model slugs, ${deprecations.size} deprecated, ${pricing.size} with pricing`,
  );

  // Fetch detail pages in batches
  const specs: ModelSpec[] = [];
  for (let i = 0; i < slugs.length; i += 5) {
    const batch = slugs.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchModelSpec));
    for (const r of results) {
      if (r) specs.push(r);
    }
  }
  console.log(`Fetched ${specs.length} model details`);

  // Optional API
  const apiKey = envOrNull("GEMINI_API_KEY", "GOOGLE_API_KEY");
  let apiModels = new Map<string, ApiModel>();
  if (apiKey) {
    console.log("Fetching from API...");
    apiModels = await fetchApiModels(apiKey);
    console.log(`Found ${apiModels.size} models from API`);
  }

  let written = 0;

  // Write models from docs detail pages
  for (const spec of specs) {
    const api = apiModels.get(spec.id);
    const dep = deprecations.get(spec.id);

    // Check if shutdown date has passed
    const isShutdown = dep?.shutdown
      ? new Date(dep.shutdown) < new Date()
      : false;

    // Build tools from detected capabilities
    const tools: string[] = [];
    if (spec.capabilities.tool_call) tools.push("function_calling");

    // Build endpoints from API supportedGenerationMethods if available
    const endpoints: string[] = [];
    if (api?.supportedGenerationMethods) {
      if (api.supportedGenerationMethods.includes("generateContent"))
        endpoints.push("generateContent");
      if (api.supportedGenerationMethods.includes("streamGenerateContent"))
        endpoints.push("streamGenerateContent");
    } else {
      endpoints.push("generateContent", "streamGenerateContent");
    }

    const entry: ModelEntry = {
      id: spec.id,
      name: api?.displayName ?? spec.id,
      description: api?.description ?? spec.description,
      family: inferFamily(spec.id),
      page_url: spec.page_url,
      license: /^gemma/i.test(spec.id) ? "apache-2.0" : "proprietary",
      status: isShutdown ? "deprecated" : "active",
      context_window: api?.inputTokenLimit ?? spec.input_tokens,
      max_output_tokens: api?.outputTokenLimit ?? spec.output_tokens,
      knowledge_cutoff: spec.knowledge_cutoff,
      capabilities: {
        ...spec.capabilities,
        ...(spec.inputModalities.length > 0
          ? { vision: spec.inputModalities.includes("image") }
          : {}),
      },
      modalities: {
        input: spec.inputModalities,
        output: spec.outputModalities,
      },
      ...(tools.length > 0 ? { tools } : {}),
      ...(endpoints.length > 0 ? { endpoints } : {}),
    };

    // Add pricing from pricing page
    const price = pricing.get(spec.id);
    if (price) entry.pricing = buildPricing(price);

    if (dep?.shutdown) entry.deprecation_date = dep.shutdown;
    if (dep?.replacement) entry.successor = dep.replacement;

    written += upsertWithSnapshot("google", entry);
  }

  // Write deprecated models not in docs detail pages
  for (const [id, dep] of deprecations) {
    const api = apiModels.get(id);
    const alreadyWritten = specs.some((s) => s.id === id);
    if (alreadyWritten) continue;

    const isShutdown = dep.shutdown
      ? new Date(dep.shutdown) < new Date()
      : true;

    // Infer modalities/capabilities based on model type
    const isEmbed = id.includes("embedding");
    const isImage = id.startsWith("imagen");
    const isVideo = id.startsWith("veo");

    // Determine modalities and capabilities based on model type
    let depModalities: { input: string[]; output: string[] };
    let depCapabilities: Record<string, boolean> | undefined;
    if (isEmbed) {
      depModalities = { input: ["text"], output: ["text"] };
    } else if (isImage) {
      depModalities = { input: ["text"], output: ["image"] };
    } else if (isVideo) {
      depModalities = { input: ["text"], output: ["video"] };
    } else {
      depModalities = { input: ["text", "image"], output: ["text"] };
      depCapabilities = { streaming: true, vision: true };
    }

    const entry: ModelEntry = {
      id,
      name: api?.displayName ?? id,
      description: api?.description,
      family: inferFamily(id),
      license: /^gemma/i.test(id) ? "apache-2.0" : "proprietary",
      status: isShutdown ? "deprecated" : "active",
      context_window: api?.inputTokenLimit,
      max_output_tokens: api?.outputTokenLimit,
      deprecation_date: dep.shutdown,
      modalities: depModalities,
      ...(depCapabilities ? { capabilities: depCapabilities } : {}),
    };

    // Add pricing
    const price = pricing.get(id);
    if (price) entry.pricing = buildPricing(price);

    if (dep.replacement) entry.successor = dep.replacement;

    written += upsertWithSnapshot("google", entry);
  }

  // Write API-only models not covered above
  if (apiKey) {
    for (const [id, api] of apiModels) {
      if (!api.supportedGenerationMethods?.length) continue;
      const alreadyWritten =
        specs.some((s) => s.id === id) || deprecations.has(id);
      if (alreadyWritten) continue;

      // Build endpoints from API supportedGenerationMethods
      const apiEndpoints: string[] = [];
      if (api.supportedGenerationMethods.includes("generateContent"))
        apiEndpoints.push("generateContent");
      if (api.supportedGenerationMethods.includes("streamGenerateContent"))
        apiEndpoints.push("streamGenerateContent");

      written += upsertWithSnapshot("google", {
        id,
        name: api.displayName,
        description: api.description,
        family: inferFamily(id),
        license: /^gemma/i.test(id) ? "apache-2.0" : "proprietary",
        status: "active",
        context_window: api.inputTokenLimit,
        max_output_tokens: api.outputTokenLimit,
        capabilities: {
          streaming: true,
          vision: true,
          tool_call: true,
        },
        modalities: {
          input: ["text", "image", "audio", "video"],
          output: ["text"],
        },
        tools: ["function_calling"],
        ...(apiEndpoints.length > 0 ? { endpoints: apiEndpoints } : {}),
      });
    }
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
