import { fetchJson } from "./parse.ts";
import {
  filterModalities,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Inception Labs Mercury models.
 *
 * GET https://api.inceptionlabs.ai/v1/models is public and returns full
 * specs (context, max_output, pricing in $/token, modalities, features,
 * datacenters). No auth required.
 *
 * Pricing fields come back as USD per token; we multiply by 1e6 for per-1M.
 */

const sources = readSources("inception");
const API_URL = sources.models as string;

interface ApiPricing {
  prompt?: string;
  completion?: string;
  image?: string;
  request?: string;
  input_cache_reads?: string;
  input_cache_writes?: string;
}

interface ApiModel {
  id: string;
  name?: string;
  created?: number;
  description?: string;
  context_length?: number;
  max_output_length?: number;
  input_modalities?: string[];
  output_modalities?: string[];
  supported_features?: string[];
  pricing?: ApiPricing;
  datacenters?: { country_code?: string }[];
}

interface ApiResponse {
  data: ApiModel[];
}

const FAMILY = "mercury";

function perMillion(perToken: string | undefined): number | undefined {
  if (perToken == null) return undefined;
  const n = Number(perToken);
  if (!Number.isFinite(n)) return undefined;
  return Number((n * 1_000_000).toFixed(6));
}

function inferType(id: string, features: string[]): ModelEntry["model_type"] {
  if (id.includes("edit")) return "code";
  if (id.includes("coder")) return "code";
  if (features.includes("reasoning") || id.endsWith("-2")) return "reasoning";
  return "chat";
}

function buildEntry(m: ApiModel): ModelEntry {
  const features = m.supported_features ?? [];
  const isEdit = m.id.includes("edit");

  const caps: Record<string, boolean> = { streaming: true };
  if (features.includes("tools")) caps.tool_call = true;
  if (features.includes("json_mode")) caps.json_mode = true;
  if (features.includes("structured_outputs")) caps.structured_output = true;
  if (m.id === "mercury-2") {
    caps.reasoning = true;
  }

  const modalities = filterModalities(
    m.input_modalities ?? ["text"],
    m.output_modalities ?? ["text"],
  );

  const pricing: Record<string, number> = {};
  const input = perMillion(m.pricing?.prompt);
  const output = perMillion(m.pricing?.completion);
  const cachedInput = perMillion(m.pricing?.input_cache_reads);
  if (input != null) pricing.input = input;
  if (output != null) pricing.output = output;
  if (cachedInput != null) pricing.cached_input = cachedInput;

  const displayName = m.name?.replace(/^Inception:\s*/i, "") ?? m.id;

  const entry: ModelEntry = {
    id: m.id,
    name: displayName,
    family: FAMILY,
    description: m.description,
    status: "active",
    model_type: inferType(m.id, features),
    context_window: m.context_length,
    max_output_tokens: m.max_output_length,
    license: "proprietary",
    open_weight: false,
    capabilities: caps,
    modalities,
    endpoints: isEdit
      ? ["fim_completions", "edit_completions"]
      : ["chat_completions"],
  };

  if (caps.tool_call) entry.tools = ["function_calling"];
  if (caps.reasoning) entry.reasoning_tokens = true;
  if (Object.keys(pricing).length > 0) entry.pricing = pricing;
  // The API's `created` field is a generic ingest timestamp shared by all
  // Mercury models, not the actual release date — ignore it and let curated
  // release_date values stay in place.

  return entry;
}

async function main() {
  console.log("Fetching Inception Labs models...");

  const json = await fetchJson<ApiResponse>(API_URL);
  const models = json.data ?? [];
  console.log(`Found ${models.length} models from API`);

  let written = 0;
  for (const m of models) {
    if (upsertModel("inception", buildEntry(m))) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
