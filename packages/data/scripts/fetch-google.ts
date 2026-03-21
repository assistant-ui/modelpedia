import {
  envOrNull,
  inferFamily,
  type ModelEntry,
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

const MODELS_PAGE = "https://ai.google.dev/gemini-api/docs/models";
const DEPRECATIONS_PAGE = "https://ai.google.dev/gemini-api/docs/deprecations";

// ── Get model slugs from docs overview page ──

async function fetchModelSlugs(): Promise<string[]> {
  const res = await fetch(MODELS_PAGE);
  const html = await res.text();
  // Extract links to individual model pages: /gemini-api/docs/models/gemini-xxx
  const slugs = [
    ...new Set(
      [
        ...html.matchAll(
          /\/gemini-api\/docs\/models\/(gemini-[a-z0-9.-]+(?:-preview)?)/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
  return slugs;
}

// ── Fetch model detail page ──

interface ModelSpec {
  id: string;
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
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Model ID - the slug itself is the ID
  const id = slug;

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

  // Modalities
  const inputMods = ["text"];
  if (/Image/i.test(text)) inputMods.push("image");
  if (/Video/i.test(text)) inputMods.push("video");
  if (/Audio/i.test(text)) inputMods.push("audio");
  const outputMods = ["text"];
  if (/Image generation.*?Supported/i.test(text)) outputMods.push("image");

  return {
    id,
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    knowledge_cutoff: knowledgeCutoff,
    capabilities: caps,
    inputModalities: inputMods,
    outputModalities: outputMods,
  };
}

// ── Parse deprecation page ──

interface DeprecationInfo {
  shutdown?: string;
  replacement?: string;
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
        !modelId.startsWith("veo")
      )
        continue;

      // Find shutdown date and replacement
      const dates = texts.filter((t) => /\w+ \d+, \d{4}/.test(t));
      const shutdown = dates.length >= 2 ? dates[1] : dates[0];
      const replacement = texts[texts.length - 1];

      depMap.set(modelId, {
        shutdown,
        replacement: replacement !== modelId ? replacement : undefined,
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
    const url = new URL(
      "https://generativelanguage.googleapis.com/v1beta/models",
    );
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

  const [slugs, deprecations] = await Promise.all([
    fetchModelSlugs(),
    fetchDeprecations(),
  ]);
  console.log(
    `Found ${slugs.length} model slugs, ${deprecations.size} deprecated`,
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

    const entry: ModelEntry = {
      id: spec.id,
      name: api?.displayName ?? spec.id,
      description: api?.description,
      family: inferFamily(spec.id),
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
    };

    if (dep?.shutdown) entry.deprecation_date = dep.shutdown;

    written += upsertWithSnapshot("google", entry);
  }

  // Write deprecated models not in docs detail pages
  for (const [id, dep] of deprecations) {
    if (!id.startsWith("gemini")) continue;
    const api = apiModels.get(id);
    const alreadyWritten = specs.some((s) => s.id === id);
    if (alreadyWritten) continue;

    const isShutdown = dep.shutdown
      ? new Date(dep.shutdown) < new Date()
      : true;

    const entry: ModelEntry = {
      id,
      name: api?.displayName ?? id,
      description: api?.description,
      family: inferFamily(id),
      status: isShutdown ? "deprecated" : "active",
      context_window: api?.inputTokenLimit,
      max_output_tokens: api?.outputTokenLimit,
      deprecation_date: dep.shutdown,
      capabilities: { streaming: true, vision: true },
      modalities: { input: ["text", "image"], output: ["text"] },
    };

    written += upsertWithSnapshot("google", entry);
  }

  // Write API-only models not covered above
  if (apiKey) {
    for (const [id, api] of apiModels) {
      if (!id.startsWith("gemini")) continue;
      if (!api.supportedGenerationMethods?.includes("generateContent"))
        continue;
      if (id.includes("embedding")) continue;
      const alreadyWritten =
        specs.some((s) => s.id === id) || deprecations.has(id);
      if (alreadyWritten) continue;

      const dep = deprecations.get(id);
      written += upsertWithSnapshot("google", {
        id,
        name: api.displayName,
        description: api.description,
        family: inferFamily(id),
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
