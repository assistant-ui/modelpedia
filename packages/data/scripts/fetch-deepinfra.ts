import {
  buildPricing,
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch DeepInfra models from the public /models/list endpoint.
 *
 * The endpoint returns a JSON array. Each entry exposes its model name, type,
 * description, tags, and pricing. Token pricing is given in cents per token,
 * which we convert to USD per 1M tokens (cents/token * 10000 = USD/1M).
 * Image, TTS, video, and other non-token pricing goes to `pricing_notes`
 * because the schema only supports per-token flat fields.
 *
 * Deprecated models are skipped. No auth required.
 */

const sources = readSources("deepinfra");
const MODELS_URL = sources.models as string;

interface DeepInfraPricing {
  type?: string;
  cents_per_input_token?: number;
  cents_per_output_token?: number;
  rate_per_input_token_cached?: number;
  cents_per_input_chars?: number;
  cents_per_image_unit?: number;
  cents_per_sec?: number;
  default_width?: number;
  default_height?: number;
  short?: string;
}

interface DeepInfraModel {
  model_name: string;
  type?: string;
  reported_type?: string;
  description?: string;
  tags?: string[];
  pricing?: DeepInfraPricing;
  max_tokens?: number;
  deprecated?: boolean | null;
  private?: number;
  is_partner?: boolean;
  quantization?: string;
}

const TYPE_MAP: Record<string, string> = {
  "text-generation": "chat",
  "text-to-image": "image",
  "image-to-image": "image",
  embeddings: "embed",
  "text-to-video": "video",
  "image-to-video": "video",
  "text-to-speech": "tts",
  "automatic-speech-recognition": "transcription",
  reranker: "rerank",
  "zero-shot-image-classification": "image",
  "object-detection": "image",
  "fill-mask": "chat",
  "question-answering": "chat",
  "token-classification": "chat",
  "text-classification": "chat",
  "sentence-similarity": "embed",
};

// Map DeepInfra owner directory → modelpedia created_by id.
// Long-tail owners not in this map fall through to lowercased directory name.
const OWNER_MAP: Record<string, string> = {
  "meta-llama": "meta",
  "Meta-Llama": "meta",
  mistralai: "mistral",
  google: "google",
  "deepseek-ai": "deepseek",
  Qwen: "alibaba",
  "Alibaba-NLP": "alibaba",
  QwenCollab: "alibaba",
  moonshotai: "moonshot",
  MiniMaxAI: "minimax",
  openai: "openai",
  anthropic: "anthropic",
  ByteDance: "bytedance",
  "ByteDance-Seed": "bytedance",
  "bytedance-research": "bytedance",
  "stepfun-ai": "stepfun",
  "zai-org": "zhipu",
  THUDM: "zhipu",
  nvidia: "nvidia",
  NVIDIA: "nvidia",
  microsoft: "microsoft",
  Microsoft: "microsoft",
  BAAI: "baai",
  intfloat: "intfloat",
  "sentence-transformers": "sentence-transformers",
  thenlper: "thenlper",
  jinaai: "jina-ai",
  "jina-ai": "jina-ai",
  "mixedbread-ai": "mixedbread",
  Salesforce: "salesforce",
  stabilityai: "stability-ai",
  "black-forest-labs": "black-forest-labs",
  "openai-community": "openai",
  "PixArt-alpha": "pixart-alpha",
  Lykon: "lykon",
  Mubert: "mubert",
  huggyllama: "meta",
  lmsys: "lmsys",
  tiiuae: "tii",
  "01-ai": "01-ai",
  Sao10K: "sao10k",
  Gryphe: "gryphe",
  Phind: "phind",
  WizardLM: "wizardlm",
  WizardLMTeam: "wizardlm",
  Austism: "austism",
  deepinfra: "deepinfra",
  DeepInfra: "deepinfra",
  "perplexity-ai": "perplexity",
  perplexity: "perplexity",
  cognitivecomputations: "cognitive-computations",
  openchat: "openchat",
  "Phi-3": "microsoft",
  Suno: "suno",
  suno: "suno",
  "Kokoro-TTS": "kokoro",
  hexgrad: "hexgrad",
  "Wan-AI": "wan-ai",
  WanAI: "wan-ai",
  Lightricks: "lightricks",
  tencent: "tencent",
  Tencent: "tencent",
  TencentARC: "tencent",
  shuttleai: "shuttleai",
  Tesslate: "tesslate",
  Skywork: "skywork",
  skywork: "skywork",
  "rednote-hilab": "rednote",
  Snowflake: "snowflake",
  Cohere: "cohere",
  CohereForAI: "cohere",
  Yi: "01-ai",
  tencentwizard: "tencent",
  facebook: "meta",
  FacebookAI: "meta",
  openrouter: "openrouter",
  BlinkDL: "blinkdl",
  EleutherAI: "eleutherai",
  TheBloke: "thebloke",
  Codestral: "mistral",
  ai21labs: "ai21",
  AI21labs: "ai21",
  amazon: "amazon",
  Amazon: "amazon",
  "openchat-team": "openchat",
  ostris: "ostris",
  "rhymes-ai": "rhymes-ai",
  OpenGVLab: "opengvlab",
  OuteAI: "oute",
  OpenSora: "opensora",
};

const LICENSE_MAP: Record<string, string> = {
  meta: "llama",
  "meta-llama": "llama",
  "Meta-Llama": "llama",
  mistralai: "apache-2.0",
  Qwen: "apache-2.0",
  "deepseek-ai": "deepseek",
  google: "gemma",
  moonshotai: "modified-mit",
  MiniMaxAI: "minimax",
  ByteDance: "apache-2.0",
  "stepfun-ai": "apache-2.0",
  "zai-org": "mit",
  BAAI: "mit",
  intfloat: "mit",
  "sentence-transformers": "apache-2.0",
  "black-forest-labs": "flux",
  stabilityai: "stability-ai",
  openai: "proprietary",
};

function ownerToId(owner: string): string {
  return OWNER_MAP[owner] ?? owner.toLowerCase().replace(/_/g, "-");
}

// cents/token * 10000 = USD per 1M tokens
function centsPerTokenToPerMillion(
  cents: number | undefined,
): number | undefined {
  if (cents == null) return undefined;
  return Math.round(Number(cents) * 10000 * 1e6) / 1e6;
}

function deriveCapabilities(
  tags: string[],
  modelType: string,
): Record<string, boolean> {
  const caps: Record<string, boolean> = {};
  const set = new Set(tags);
  if (set.has("tools")) caps.tool_call = true;
  if (set.has("structured-output")) caps.structured_output = true;
  if (set.has("json")) caps.json_mode = true;
  if (set.has("reasoning") && !set.has("non-reasoning")) caps.reasoning = true;
  if (set.has("multimodal") || set.has("vision")) caps.vision = true;
  if (
    modelType === "chat" ||
    modelType === "reasoning" ||
    modelType === "embed" ||
    modelType === "image" ||
    modelType === "tts" ||
    modelType === "transcription"
  ) {
    caps.streaming = true;
  }
  return caps;
}

function deriveModalities(
  tags: string[],
  modelType: string,
): { input: string[]; output: string[] } {
  if (modelType === "image") return { input: ["text"], output: ["image"] };
  if (modelType === "video") return { input: ["text"], output: ["video"] };
  if (modelType === "tts") return { input: ["text"], output: ["audio"] };
  if (modelType === "transcription")
    return { input: ["audio"], output: ["text"] };
  if (modelType === "embed" || modelType === "rerank")
    return { input: ["text"], output: ["text"] };
  const input = ["text"];
  if (tags.includes("multimodal") || tags.includes("vision"))
    input.push("image");
  return { input, output: ["text"] };
}

function deriveEndpoints(tags: string[], modelType: string): string[] {
  if (
    tags.includes("openai") &&
    (modelType === "chat" || modelType === "reasoning")
  )
    return ["chat_completions"];
  if (modelType === "embed") return ["embeddings"];
  if (modelType === "rerank") return ["rerank"];
  if (modelType === "image") return ["images"];
  if (modelType === "video") return ["video"];
  if (modelType === "tts") return ["audio_speech"];
  if (modelType === "transcription") return ["audio_transcriptions"];
  return [];
}

function makePricingNotes(p: DeepInfraPricing): string | undefined {
  if (p.type === "input_character_length" && p.cents_per_input_chars != null) {
    return `$${(Number(p.cents_per_input_chars) * 10000).toFixed(4)} per 1M input characters`;
  }
  if (p.type === "image_units" && p.cents_per_image_unit != null) {
    const w = p.default_width ?? 1024;
    const h = p.default_height ?? 1024;
    return `$${(Number(p.cents_per_image_unit) / 100).toFixed(4)} per image unit (${w}x${h} default)`;
  }
  if (p.type === "time" && p.cents_per_sec != null) {
    return `$${(Number(p.cents_per_sec) / 100).toFixed(6)} per second`;
  }
  if (p.short) return p.short;
  return undefined;
}

async function main() {
  console.log(`Fetching ${MODELS_URL}...`);
  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const raw = (await res.json()) as DeepInfraModel[];
  console.log(`Got ${raw.length} entries`);

  let written = 0;
  let skippedDeprecated = 0;
  let skippedPrivate = 0;
  const seen = new Set<string>();

  for (const m of raw) {
    if (m.deprecated) {
      skippedDeprecated++;
      continue;
    }
    if (m.private) {
      skippedPrivate++;
      continue;
    }
    if (seen.has(m.model_name)) continue;
    seen.add(m.model_name);

    const diType = m.type ?? m.reported_type ?? "text-generation";
    const modelType = TYPE_MAP[diType] ?? "chat";
    const owner = m.model_name.includes("/")
      ? m.model_name.split("/")[0]
      : "deepinfra";
    const tags = m.tags ?? [];

    const entry: ModelEntry = {
      id: m.model_name,
      name: m.model_name.split("/").pop() ?? m.model_name,
      created_by: ownerToId(owner),
      family: inferFamily(m.model_name),
      model_type: modelType as ModelEntry["model_type"],
      status: "active",
      open_weight: !m.is_partner,
    };

    if (m.description) {
      const desc = m.description.replace(/\s+/g, " ").trim();
      entry.description = desc.length > 500 ? `${desc.slice(0, 497)}...` : desc;
    }

    if (m.max_tokens && (modelType === "chat" || modelType === "reasoning")) {
      entry.context_window = m.max_tokens;
    }

    if (tags.includes("reasoning") && !tags.includes("non-reasoning")) {
      entry.reasoning_tokens = true;
    }

    const lic = LICENSE_MAP[owner];
    if (lic) entry.license = lic;

    const caps = deriveCapabilities(tags, modelType);
    if (Object.keys(caps).length > 0) entry.capabilities = caps;

    entry.modalities = deriveModalities(tags, modelType);

    const eps = deriveEndpoints(tags, modelType);
    if (eps.length > 0) entry.endpoints = eps;

    if (tags.includes("tools")) entry.tools = ["function_calling"];

    const p = m.pricing ?? {};
    if (p.type === "tokens") {
      const input = centsPerTokenToPerMillion(p.cents_per_input_token);
      const output = centsPerTokenToPerMillion(p.cents_per_output_token);
      const cacheRate = p.rate_per_input_token_cached;
      const cachedInput =
        cacheRate && input != null
          ? Math.round(input * Number(cacheRate) * 1e6) / 1e6
          : undefined;
      const pricing = buildPricing({
        input,
        output,
        cached_input: cachedInput,
      });
      if (pricing) entry.pricing = pricing;
    } else {
      const note = makePricingNotes(p);
      if (note) entry.pricing_notes = [note];
    }

    if (m.quantization) {
      (entry as Record<string, unknown>).quantization = m.quantization;
    }

    if (upsertModel("deepinfra", entry)) written++;
  }

  console.log(
    `Wrote ${written} models (skipped ${skippedDeprecated} deprecated, ${skippedPrivate} private)`,
  );
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
