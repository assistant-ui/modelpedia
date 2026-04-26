import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Jina AI models from the public /v1/models endpoint.
 * No auth required for the listing. Pricing in the payload is per-token (USD/token),
 * converted to USD per 1M tokens for the schema.
 *
 * Reader / VLM language models (jina-vlm, ReaderLM-*) aren't billed via the
 * embeddings/rerank endpoints in the same way and aren't part of the curated
 * model list, so we filter them out by id pattern.
 */

const sources = readSources("jina");
const MODELS_URL = sources.models as string;

interface JinaPricing {
  prompt: string;
  completion: string;
  image?: string;
  request?: string;
  input_cache_read?: string;
  input_cache_write?: string;
}

interface JinaModel {
  id: string;
  hugging_face_id?: string;
  name: string;
  created?: number;
  input_modalities: string[];
  output_modalities: string[];
  context_length?: number;
  max_output_length?: number;
  pricing: JinaPricing;
  description?: string;
}

// Known canonical licenses per HF repo. Defaults to "jina-ai" custom license.
// Verified against huggingface.co/jinaai for 2026-04 catalogue.
const LICENSE_OVERRIDES: Record<string, string> = {
  "jina-ai/jina-embeddings-v5-text-small": "jina-ai",
  "jina-ai/jina-embeddings-v5-text-nano": "jina-ai",
  "jina-ai/jina-embeddings-v4": "qwen-research",
  "jina-ai/jina-embeddings-v3": "cc-by-nc-4.0",
  "jina-ai/jina-clip-v2": "cc-by-nc-4.0",
  "jina-ai/jina-clip-v1": "apache-2.0",
  "jina-ai/jina-colbert-v2": "cc-by-nc-4.0",
  "jina-ai/jina-colbert-v1-en": "apache-2.0",
  "jina-ai/jina-embeddings-v2-base-en": "apache-2.0",
  "jina-ai/jina-embeddings-v2-base-zh": "apache-2.0",
  "jina-ai/jina-embeddings-v2-base-de": "apache-2.0",
  "jina-ai/jina-embeddings-v2-base-es": "apache-2.0",
  "jina-ai/jina-embeddings-v2-base-code": "apache-2.0",
  "jina-ai/jina-code-embeddings-1.5b": "apache-2.0",
  "jina-ai/jina-code-embeddings-0.5b": "apache-2.0",
  "jina-ai/jina-reranker-v3": "jina-ai",
  "jina-ai/jina-reranker-m0": "cc-by-nc-4.0",
  "jina-ai/jina-reranker-v2-base-multilingual": "cc-by-nc-4.0",
  "jina-ai/jina-reranker-v1-base-en": "apache-2.0",
  "jina-ai/jina-reranker-v1-turbo-en": "apache-2.0",
  "jina-ai/jina-reranker-v1-tiny-en": "apache-2.0",
};

function stripPrefix(id: string): string {
  return id.startsWith("jina-ai/") ? id.slice("jina-ai/".length) : id;
}

function isReranker(id: string): boolean {
  return /reranker/i.test(id);
}

function isReaderOrVlm(id: string): boolean {
  return /reader-lm|readerlm|jina-vlm/i.test(id);
}

function endpointFor(id: string): string {
  return isReranker(id) ? "rerank" : "embeddings";
}

function modelTypeFor(id: string): "rerank" | "embed" {
  return isReranker(id) ? "rerank" : "embed";
}

function toPerMillion(rate: string): number {
  return Math.round(Number(rate) * 1_000_000 * 1_000_000) / 1_000_000;
}

function buildEntry(m: JinaModel): ModelEntry | null {
  const cleanId = stripPrefix(m.id);
  if (isReaderOrVlm(cleanId)) return null;

  const inputMods = m.input_modalities.filter(
    (x) => x === "text" || x === "image" || x === "audio" || x === "video",
  );

  const release_date = m.created
    ? new Date(m.created * 1000).toISOString().slice(0, 10)
    : undefined;

  const pricingInput = toPerMillion(m.pricing.prompt);

  const entry: ModelEntry = {
    id: cleanId,
    name: m.name.replace(/^Jina AI:\s*/, ""),
    family: inferFamily(cleanId) ?? cleanId.replace(/-v\d+(?:[-.].+)?$/, ""),
    description: m.description,
    model_type: modelTypeFor(cleanId),
    status: "active",
    release_date,
    context_window: m.context_length,
    license: LICENSE_OVERRIDES[m.id] ?? "jina-ai",
    open_weight: true,
    modalities: { input: inputMods, output: [] },
    endpoints: [endpointFor(cleanId)],
    pricing: { input: pricingInput },
  };

  return entry;
}

async function main() {
  console.log(`Fetching Jina models from ${MODELS_URL}`);
  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new Error(`models fetch failed: ${res.status}`);
  const json = (await res.json()) as { data: JinaModel[] };
  console.log(`Got ${json.data.length} entries`);

  let written = 0;
  for (const m of json.data) {
    const entry = buildEntry(m);
    if (!entry) {
      console.log(`  skip ${m.id} (reader/vlm)`);
      continue;
    }
    if (upsertModel("jina", entry)) written++;
  }

  console.log(`Wrote/updated ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
