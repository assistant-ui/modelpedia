import {
  buildPricing,
  envOrNull,
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

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

// ── Get model slugs from docs overview page ──

async function fetchModelSlugs(): Promise<string[]> {
  const res = await fetch(MODELS_PAGE);
  const html = await res.text();
  // Extract links to individual model pages: /gemini-api/docs/models/<slug>
  // Matches all model types: gemini, gemma, imagen, veo, text-embedding, etc.
  const slugs = [
    ...new Set(
      [...html.matchAll(/\/gemini-api\/docs\/models\/([a-z][a-z0-9._-]+)/g)]
        .map((m) => m[1])
        .filter((s) => s !== "all" && !s.startsWith("_")),
    ),
  ];
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

async function fetchModelSpec(slug: string): Promise<ModelSpec | null> {
  const res = await fetch(`${MODELS_PAGE}/${slug}`);
  if (!res.ok) return null;
  const html = await res.text();
  const text = html
    .replace(/<(style|script|nav|header|footer|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ");

  // Model ID - the slug itself is the ID
  const id = slug;
  const page_url = `https://ai.google.dev/gemini-api/docs/models/${slug}`;

  // Description — the intro paragraph sits between the page title and
  // "Try in Google AI Studio" in the stripped text.
  let description: string | undefined;
  const descMatch = text.match(
    /((?:Our |A |The |An )\S[\s\S]*?)\s+Try in Google AI Studio/,
  );
  if (descMatch) {
    const raw = descMatch[1].trim();
    // Skip deprecation notices — they are not real descriptions
    if (!/^This model is deprecated/i.test(raw) && raw.length >= 20) {
      description = raw;
    }
  }

  // Input token limit
  const inputMatch = text.match(
    /(?:Input|Context)\s*(?:token)?\s*(?:limit|window)?\s*[:.]?\s*([\d,]+)/i,
  );
  const inputTokens = inputMatch
    ? Number(inputMatch[1].replace(/,/g, ""))
    : undefined;

  // Output token limit
  const outputMatch = text.match(
    /Output\s*(?:token)?\s*limit\s*[:.]?\s*([\d,]+)/i,
  );
  const outputTokens = outputMatch
    ? Number(outputMatch[1].replace(/,/g, ""))
    : undefined;

  // Knowledge cutoff
  const kcMatch = text.match(
    /(?:Knowledge|Training)\s*(?:data)?\s*(?:cutoff|cut-off)\s*[:.]?\s*([A-Z][a-z]+ \d{4})/i,
  );
  const knowledgeCutoff = kcMatch?.[1];

  // Capabilities
  const caps: Record<string, boolean> = { streaming: true };
  if (/Function calling.*?Supported/i.test(text)) caps.tool_call = true;
  if (/Structured output.*?Supported/i.test(text))
    caps.structured_output = true;
  if (/Thinking.*?Supported/i.test(text)) caps.reasoning = true;
  if (/Caching.*?Supported/i.test(text)) caps.batch = true;

  // Modalities — use "Supported" pattern from feature tables, not loose keyword matches
  const inputMods = ["text"];
  if (
    /Image\s*(?:input|understanding).*?Supported/i.test(text) ||
    /Input.*?Image/i.test(text)
  )
    inputMods.push("image");
  if (
    /Video\s*(?:input|understanding).*?Supported/i.test(text) ||
    /Input.*?Video/i.test(text)
  )
    inputMods.push("video");
  if (
    /Audio\s*(?:input|understanding).*?Supported/i.test(text) ||
    /Input.*?Audio/i.test(text)
  )
    inputMods.push("audio");
  const outputMods = ["text"];
  if (/Image generation.*?Supported/i.test(text)) outputMods.push("image");
  if (
    /Audio generation.*?Supported/i.test(text) ||
    /TTS.*?Supported/i.test(text)
  )
    outputMods.push("audio");

  // Override modalities for non-text models based on ID
  // Modality overrides: [inputModalities, outputModalities, capabilities]
  const MODALITY_OVERRIDES: [
    string,
    string[],
    string[],
    Record<string, boolean> | null,
  ][] = [
    ["imagen", ["text"], ["image"], null],
    ["veo", ["text", "image"], ["video"], null],
    ["lyria", ["text"], ["audio"], null],
  ];

  for (const [prefix, input, output, capOverride] of MODALITY_OVERRIDES) {
    if (id.startsWith(prefix)) {
      return {
        id,
        description,
        page_url,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        knowledge_cutoff: knowledgeCutoff,
        capabilities: capOverride ?? caps,
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
      inputModalities: ["text"],
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

async function fetchPricing(): Promise<Map<string, PricingInfo>> {
  const res = await fetch(PRICING_PAGE);
  const html = await res.text();
  const map = new Map<string, PricingInfo>();

  // Find model heading IDs and grab all content until the NEXT model heading
  const modelHeadings = [
    ...html.matchAll(
      /<h[2-4][^>]*id="((?:gemini|imagen|veo|text-embedding)[^"]*)"[^>]*>/g,
    ),
  ].filter((m) => !m[1].startsWith("standard") && !m[1].startsWith("batch"));

  for (let i = 0; i < modelHeadings.length; i++) {
    const headingId = modelHeadings[i][1];
    const startIdx = modelHeadings[i].index!;
    const endIdx =
      i + 1 < modelHeadings.length ? modelHeadings[i + 1].index! : html.length;
    const section = html.slice(startIdx, endIdx);

    // Get all tables in this section
    const tables = [...section.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
    if (tables.length === 0) continue;

    // First table = Standard, second = Batch
    const stdText = tables[0][1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    const stdIn = extractFirstPrice(stdText, /Input[^$]*\$(\d+\.?\d*)/i);
    const stdOut = extractFirstPrice(stdText, /Output[^$]*\$(\d+\.?\d*)/i);
    const stdCached = extractFirstPrice(
      stdText,
      /[Cc]ach(?:ing|ed)[^$]*\$(\d+\.?\d*)/i,
    );

    if (stdIn == null && stdOut == null) continue;

    const info: PricingInfo = {};
    info.input = stdIn;
    info.output = stdOut;
    if (stdCached != null) info.cached_input = stdCached;

    // Build tiers
    const tierRows: { label: string; values: (number | null)[] }[] = [];
    tierRows.push({
      label: "Standard",
      values: [stdIn ?? null, stdCached ?? null, stdOut ?? null],
    });

    if (tables.length >= 2) {
      const batchText = tables[1][1]
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ");
      const batchIn = extractFirstPrice(batchText, /Input[^$]*\$(\d+\.?\d*)/i);
      const batchOut = extractFirstPrice(
        batchText,
        /Output[^$]*\$(\d+\.?\d*)/i,
      );
      if (batchIn != null) info.batch_input = batchIn;
      if (batchOut != null) info.batch_output = batchOut;

      tierRows.push({
        label: "Batch",
        values: [batchIn ?? null, null, batchOut ?? null],
      });
    }

    info.tiers = [
      {
        label: "Text tokens",
        unit: "Per 1M tokens",
        columns: ["Input", "Cached input", "Output"],
        rows: tierRows,
      },
    ];

    map.set(headingId, info);
  }

  return map;
}

// ── Parse deprecation page ──

interface DeprecationInfo {
  shutdown?: string;
  replacement?: string | string[];
}

async function fetchDeprecations(): Promise<Map<string, DeprecationInfo>> {
  const res = await fetch(DEPRECATIONS_PAGE);
  const html = await res.text();
  const depMap = new Map<string, DeprecationInfo>();

  // Extract from tables: Model | Release | Shutdown | Replacement
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
  for (const table of tables) {
    const rows = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    for (const row of rows) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
      const texts = cells.map((c) =>
        c[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      );
      if (texts.length < 3) continue;
      const modelId = texts[0];
      if (
        !modelId.startsWith("gemini") &&
        !modelId.startsWith("imagen") &&
        !modelId.startsWith("veo") &&
        !modelId.startsWith("text-embedding") &&
        !modelId.startsWith("embedding")
      )
        continue;

      // Table columns: Model | Release | Shutdown | Replacement
      // Use the shutdown column (index 2) directly — don't guess from all dates.
      // If the shutdown cell is empty or not a date, the model is not deprecated.
      const DATE_RE = /\w+ \d+, \d{4}/;
      const shutdown =
        texts.length >= 3 && DATE_RE.test(texts[2]) ? texts[2] : undefined;
      const rawReplacement = texts[texts.length - 1];
      const replacements = rawReplacement
        .split(/\s*or\s*|,\s*/)
        .map((s) => s.trim())
        .filter((s) => s && s !== modelId);

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

    const res = await fetch(url.toString());
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
        vision: true,
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

      const dep = deprecations.get(id);
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
        status: dep ? "deprecated" : "active",
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
