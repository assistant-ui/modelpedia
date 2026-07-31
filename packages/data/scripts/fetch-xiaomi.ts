import {
  assertParsed,
  filterModalities,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Xiaomi MiMo models from the platform's public catalog endpoint. No key.
 *
 * Source history: the catalog used to be published as HTML tables in
 * llms-full.txt. That path now serves the single-page app shell and every
 * /docs/ route renders client-side, so no table survives in the HTML. The
 * platform exposes the same catalog as key-free JSON in an OpenRouter-shaped
 * payload, which carries more than the tables ever did (descriptions, output
 * limits, cache pricing, supported parameters).
 */

const sources = readSources("xiaomi");
const CATALOG_URL = sources.catalog as string;

// The provider states that these V2 models auto-route to their V2.5
// counterparts and are fully deprecated on 2026-06-30.
const DEPRECATED: Record<string, string> = {
  "mimo-v2-pro": "mimo-v2.5-pro",
  "mimo-v2-omni": "mimo-v2.5",
};

interface CatalogModel {
  id: string;
  name?: string;
  created?: number;
  description?: string;
  context_length?: number;
  max_output_length?: number;
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
  pricing?: Record<string, string>;
  supported_parameters?: string[];
  supported_features?: string[];
}

/** Catalog rates are per token; modelpedia stores USD per 1M tokens. */
function perMillion(raw: string | undefined): number | undefined {
  if (raw == null) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return Math.round(n * 1e6 * 1e6) / 1e6;
}

function buildPricing(p: CatalogModel["pricing"]) {
  if (!p) return undefined;
  const pricing: Record<string, number> = {};
  const input = perMillion(p.prompt);
  const output = perMillion(p.completion);
  const cached = perMillion(p.input_cache_read);
  const cacheWrite = perMillion(p.input_cache_write);
  if (input != null) pricing.input = input;
  if (output != null) pricing.output = output;
  if (cached != null) pricing.cached_input = cached;
  if (cacheWrite != null) pricing.cache_write = cacheWrite;
  return Object.keys(pricing).length > 0 ? pricing : undefined;
}

function buildCapabilities(m: CatalogModel) {
  const params = new Set(m.supported_parameters ?? []);
  const features = new Set(m.supported_features ?? []);
  const caps: Record<string, boolean> = { streaming: true };
  if (params.has("tools") || params.has("tool_choice")) caps.tool_call = true;
  if (params.has("response_format")) caps.structured_output = true;
  if (params.has("reasoning") || params.has("include_reasoning")) {
    caps.reasoning = true;
  }
  if (features.has("prompt_caching") || m.pricing?.input_cache_read) {
    caps.prompt_caching = true;
  }
  if (m.architecture?.input_modalities?.includes("image")) caps.vision = true;
  return caps;
}

async function main() {
  console.log("Fetching Xiaomi MiMo models from the platform catalog...");

  const res = await fetch(CATALOG_URL);
  if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
  const catalog = (await res.json()) as { data?: CatalogModel[] };
  const models = catalog.data ?? [];

  console.log(`Parsed ${models.length} models from catalog`);
  assertParsed(models.length, "xiaomi");

  let written = 0;
  for (const m of models) {
    // Catalog ids are namespaced (`xiaomi/mimo-v2.5`); modelpedia keys the
    // provider's own directory by the bare id.
    const id = m.id.replace(/^xiaomi\//, "");

    const modalities = filterModalities(
      m.architecture?.input_modalities ?? ["text"],
      m.architecture?.output_modalities ?? ["text"],
    );
    const capabilities = buildCapabilities(m);

    const entry: ModelEntry = {
      id,
      name: (m.name ?? id).replace(/^Xiaomi MiMo[:：]\s*/, ""),
      family: "mimo",
      created_by: "xiaomi",
      model_type: "chat",
      status: DEPRECATED[id] ? "deprecated" : "active",
      description: m.description,
      context_window: m.context_length,
      max_output_tokens: m.max_output_length,
      release_date: m.created
        ? new Date(m.created * 1000).toISOString().split("T")[0]
        : undefined,
      capabilities,
      modalities,
      pricing: buildPricing(m.pricing),
      page_url: "https://platform.xiaomimimo.com",
    };
    if (capabilities.reasoning) entry.reasoning_tokens = true;
    if (DEPRECATED[id]) {
      entry.deprecation_date = "2026-06-30";
      entry.successor = DEPRECATED[id];
    }

    if (upsertModel("xiaomi", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
