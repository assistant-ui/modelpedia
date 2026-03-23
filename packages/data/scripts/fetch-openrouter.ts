import { fetchJson } from "./parse.ts";
import {
  filterModalities,
  firstSentence,
  inferFamily,
  inferParameters,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch from OpenRouter's public API (no key needed).
 * Writes ALL OpenRouter models to providers/openrouter/models/
 */

const sources = readSources("openrouter");
const API_URL = sources.api as string;

interface ORModel {
  id: string;
  name: string;
  description: string;
  created: number;
  context_length: number;
  architecture: {
    input_modalities: string[];
    output_modalities: string[];
  };
  pricing: {
    prompt: string;
    completion: string;
    input_cache_read?: string;
  };
  top_provider: {
    context_length: number;
    max_completion_tokens: number | null;
    is_moderated: boolean;
  };
  supported_parameters: string[];
  expiration_date: string | null;
}

// ── Mapping helpers ──

const PROVIDER_MAP: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  mistralai: "mistral",
  deepseek: "deepseek",
  "x-ai": "xai",
};

function extractCreatedBy(orId: string): string {
  const slash = orId.indexOf("/");
  if (slash === -1) return "openrouter";
  const prefix = orId.slice(0, slash);
  return PROVIDER_MAP[prefix] ?? prefix;
}

function mapCapabilities(params: string[]): Record<string, boolean> {
  const p = new Set(params);
  const caps: Record<string, boolean> = {};
  if (p.has("tools") || p.has("tool_choice")) caps.tool_call = true;
  if (p.has("structured_outputs") || p.has("response_format"))
    caps.structured_output = true;
  if (p.has("reasoning") || p.has("include_reasoning")) caps.reasoning = true;
  return caps;
}

function toPerMillion(perToken: string | undefined): number | undefined {
  if (!perToken) return undefined;
  const n = Number(perToken);
  if (Number.isNaN(n) || n <= 0) return undefined;
  return Math.round(n * 1_000_000 * 1000) / 1000;
}

/** Convert Unix timestamp (seconds) to YYYY-MM-DD. */
function unixToDate(ts: number): string {
  return new Date(ts * 1000).toISOString().split("T")[0];
}

// ── Main ──

async function main() {
  console.log("Fetching OpenRouter models API...");
  const json = await fetchJson<{ data: ORModel[] }>(API_URL);
  console.log(`Got ${json.data.length} models from OpenRouter`);

  let written = 0;

  for (const m of json.data) {
    const entry: ModelEntry = {
      id: m.id,
      name: m.name,
      created_by: extractCreatedBy(m.id),
      family: inferFamily(m.id),
    };

    if (m.description) entry.description = firstSentence(m.description);

    // Release date from API created timestamp
    if (m.created) entry.release_date = unixToDate(m.created);

    if (m.expiration_date) {
      entry.status = "deprecated";
      entry.deprecation_date = m.expiration_date;
    }

    if (m.context_length) entry.context_window = m.context_length;
    if (m.top_provider.max_completion_tokens) {
      entry.max_output_tokens = m.top_provider.max_completion_tokens;
    }

    const mods = filterModalities(
      m.architecture.input_modalities,
      m.architecture.output_modalities,
    );
    if (mods.input.length > 0 || mods.output.length > 0)
      entry.modalities = mods;

    const caps = mapCapabilities(m.supported_parameters);
    if (Object.keys(caps).length > 0) entry.capabilities = caps;

    const pricing: Record<string, number | null> = {};
    const inp = toPerMillion(m.pricing.prompt);
    const out = toPerMillion(m.pricing.completion);
    const cached = toPerMillion(m.pricing.input_cache_read);
    if (inp !== undefined) pricing.input = inp;
    if (out !== undefined) pricing.output = out;
    if (cached !== undefined) pricing.cached_input = cached;
    if (Object.keys(pricing).length > 0) entry.pricing = pricing;

    // Infer parameters from model ID (e.g. "llama-3.1-405b" → 405)
    const params = inferParameters(m.id);
    if (params) {
      entry.parameters = params.parameters;
      if (params.active_parameters)
        entry.active_parameters = params.active_parameters;
    }

    written += upsertWithSnapshot("openrouter", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
