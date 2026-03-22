import { fetchJson } from "./parse.ts";
import {
  filterModalities,
  firstSentence,
  inferFamily,
  readModelJson,
  readSources,
  runGenerate,
  sanitizeModelId,
  today,
  writeModelJson,
} from "./shared.ts";

/**
 * Fetch from OpenRouter's public API (no key needed). Two jobs:
 * 1. Write ALL OpenRouter models to providers/openrouter/models/
 * 2. Enrich existing provider models with missing technical specs
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

// ── Job 1: Write OpenRouter provider models ──

function writeOpenRouterModels(models: ORModel[]): number {
  console.log("\n[1/2] Writing OpenRouter provider models...");
  let written = 0;

  for (const m of models) {
    const fileId = sanitizeModelId(m.id);
    const existing = readModelJson("openrouter", fileId);
    if (existing?.source === "community") continue;

    const data: Record<string, unknown> = {
      id: m.id,
      name: m.name,
      created_by: extractCreatedBy(m.id),
      source: "official",
      last_updated: today(),
    };

    const family = inferFamily(m.id);
    if (family) data.family = family;

    if (m.description) data.description = firstSentence(m.description);
    if (m.expiration_date) {
      data.status = "deprecated";
      data.deprecation_date = m.expiration_date;
    }

    if (m.context_length) data.context_window = m.context_length;
    if (m.top_provider.max_completion_tokens) {
      data.max_output_tokens = m.top_provider.max_completion_tokens;
    }

    const mods = filterModalities(
      m.architecture.input_modalities,
      m.architecture.output_modalities,
    );
    if (mods.input.length > 0 || mods.output.length > 0) data.modalities = mods;

    const caps = mapCapabilities(m.supported_parameters);
    if (Object.keys(caps).length > 0) data.capabilities = caps;

    const pricing: Record<string, number | null> = {};
    const inp = toPerMillion(m.pricing.prompt);
    const out = toPerMillion(m.pricing.completion);
    const cached = toPerMillion(m.pricing.input_cache_read);
    if (inp !== undefined) pricing.input = inp;
    if (out !== undefined) pricing.output = out;
    if (cached !== undefined) pricing.cached_input = cached;
    if (Object.keys(pricing).length > 0) data.pricing = pricing;

    writeModelJson("openrouter", fileId, data);
    written++;
  }

  return written;
}

// ── Main ──

async function main() {
  console.log("Fetching OpenRouter models API...");
  const json = await fetchJson<{ data: ORModel[] }>(API_URL);
  console.log(`Got ${json.data.length} models from OpenRouter`);

  const orWritten = writeOpenRouterModels(json.data);
  console.log(`Wrote ${orWritten} models`);

  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
