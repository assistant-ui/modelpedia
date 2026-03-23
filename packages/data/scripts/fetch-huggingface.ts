import { fetchJson, fetchText } from "./parse.ts";
import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Hugging Face Inference API models.
 * No API key needed — public API.
 */

const sources = readSources("huggingface");
const API_URL = sources.api as string;
const CONCURRENCY = 8;

// ── Types ──

interface HFModelListItem {
  id: string;
  modelId: string;
  downloads: number;
  likes: number;
  pipeline_tag: string;
  tags: string[];
  library_name?: string;
  createdAt: string;
  lastModified?: string;
  cardData?: {
    license?: string;
    language?: string[];
    [key: string]: unknown;
  };
  safetensors?: {
    parameters?: Record<string, number>;
    total?: number;
  };
  config?: {
    architectures?: string[];
    model_type?: string;
    tokenizer_config?: Record<string, unknown>;
  };
}

interface HFConfig {
  max_position_embeddings?: number;
  max_sequence_length?: number;
  sliding_window?: number | null;
  num_experts?: number;
  num_experts_per_tok?: number;
  num_local_experts?: number;
  [key: string]: unknown;
}

// ── Helpers ──

function extractCreator(id: string): string {
  const org = id.split("/")[0];
  const map: Record<string, string> = {
    "meta-llama": "meta",
    meta: "meta",
    Qwen: "qwen",
    mistralai: "mistral",
    google: "google",
    openai: "openai",
    "deepseek-ai": "deepseek",
    nvidia: "nvidia",
    microsoft: "microsoft",
    "zai-org": "zhipu",
    tiiuae: "tii",
    ibm: "ibm",
    NousResearch: "nousresearch",
    bigcode: "bigcode",
    bytedance: "bytedance",
    ai21labs: "ai21",
    "01-ai": "01-ai",
    allenai: "allenai",
    MiniMaxAI: "minimax",
    moonshotai: "moonshot",
  };
  return map[org] ?? org.toLowerCase();
}

function extractName(id: string): string {
  return id.split("/").pop() ?? id;
}

/** Convert total parameters (number) to billions, rounded. */
function toBillions(total: number): number {
  const b = total / 1e9;
  if (b >= 10) return Math.round(b);
  if (b >= 1) return Math.round(b * 10) / 10;
  return Math.round(b * 100) / 100;
}

/** Normalize HF license strings to SPDX-like IDs. */
function normalizeLicense(license: unknown): string | undefined {
  if (!license) return undefined;
  const raw = Array.isArray(license) ? license[0] : license;
  if (typeof raw !== "string") return undefined;
  const l = raw.toLowerCase().trim();
  const map: Record<string, string> = {
    "apache-2.0": "apache-2.0",
    apache: "apache-2.0",
    mit: "mit",
    "cc-by-4.0": "cc-by-4.0",
    "cc-by-nc-4.0": "cc-by-nc-4.0",
    "cc-by-sa-4.0": "cc-by-sa-4.0",
    "cc-by-nc-sa-4.0": "cc-by-nc-sa-4.0",
    openrail: "openrail",
    "bigscience-openrail-m": "bigscience-openrail-m",
  };
  return map[l] ?? l;
}

/**
 * Map HF `config.architectures[0]` to a normalized architecture value.
 * Uses MoE signals from config to distinguish "moe" from "transformer".
 */
function inferArchitecture(
  listConfig?: HFModelListItem["config"],
  detailConfig?: HFConfig | null,
): string | undefined {
  const arch = listConfig?.architectures?.[0];
  if (!arch) return undefined;

  // MoE detection: either the architecture name itself contains "Moe"
  // or the detailed config declares expert counts
  const isMoe =
    /moe|mixture/i.test(arch) ||
    (detailConfig != null &&
      ((detailConfig.num_experts != null &&
        detailConfig.num_experts_per_tok != null) ||
        detailConfig.num_local_experts != null));

  if (isMoe) return "moe";

  // SSM / state-space architectures
  if (/mamba|ssm|rwkv/i.test(arch)) return "ssm";

  // Hybrid (e.g. Jamba = transformer + SSM)
  if (/hybrid/i.test(arch)) return "hybrid";

  // Default: anything ending in ForCausalLM / ForSeq2SeqLM / etc. is a transformer
  if (/transformer|ForCausalLM|ForConditionalGeneration|ForSeq2Seq/i.test(arch))
    return "transformer";

  // Fallback: still a known architecture class → transformer
  if (arch.endsWith("LM") || arch.endsWith("Model")) return "transformer";

  return undefined;
}

/** Map HF `pipeline_tag` to our `model_type` values. */
function mapPipelineTag(tag: string | undefined): string | undefined {
  if (!tag) return undefined;
  const map: Record<string, string> = {
    "text-generation": "chat",
    "text2text-generation": "chat",
    conversational: "chat",
    "text-classification": "chat",
    "question-answering": "chat",
    summarization: "chat",
    "feature-extraction": "embed",
    "sentence-similarity": "embed",
    "fill-mask": "chat",
    "text-to-image": "image",
    "image-to-text": "chat",
    "image-text-to-text": "chat",
    "text-to-video": "video",
    "text-to-audio": "tts",
    "text-to-speech": "tts",
    "automatic-speech-recognition": "transcription",
    "audio-classification": "audio",
    translation: "translation",
    "image-classification": "chat",
    "zero-shot-classification": "chat",
  };
  return map[tag];
}

/** Infer capabilities from HF tags and config. */
function inferCapabilities(
  tags: string[],
  _config?: HFModelListItem["config"],
) {
  const caps: Record<string, boolean> = { streaming: true };
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));
  if (tagSet.has("conversational")) caps.tool_call = true;
  return caps;
}

/** Extract description from the first paragraph of a README (after YAML front matter). */
function extractDescription(readme: string): string | undefined {
  // Remove YAML front matter
  const withoutFM = readme.replace(/^---[\s\S]*?---\s*/, "");
  // Skip the first H1 (model title)
  const withoutTitle = withoutFM.replace(/^#\s+.+\n*/, "");
  // Find first substantive paragraph (skip badges, links, empty lines)
  const lines = withoutTitle.split("\n");
  const paragraphs: string[] = [];
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();
    // Stop at next heading
    if (trimmed.startsWith("#")) break;
    // Skip badge images, HTML tags, empty lines
    if (
      trimmed === "" ||
      trimmed.startsWith("<") ||
      trimmed.startsWith("[![") ||
      trimmed.startsWith("![") ||
      (trimmed.startsWith("[") && trimmed.includes("img.shields.io"))
    ) {
      if (current) {
        paragraphs.push(current);
        current = "";
      }
      continue;
    }
    current += (current ? " " : "") + trimmed;
  }
  if (current) paragraphs.push(current);

  // Return first meaningful paragraph
  for (const p of paragraphs) {
    // Skip social/community links, badges, very short or link-only lines
    if (
      p.length <= 30 ||
      p.startsWith("http") ||
      p.includes("discord.gg") ||
      p.includes("WeChat") ||
      p.includes("img.shields.io") ||
      p.includes("<a href") ||
      /^[\s🔗👋💬📢]/u.test(p)
    )
      continue;
    if (p.length > 30) {
      // Truncate to ~500 chars at sentence boundary
      if (p.length > 500) {
        const cut = p.slice(0, 500);
        const lastDot = cut.lastIndexOf(". ");
        return lastDot > 200 ? cut.slice(0, lastDot + 1) : `${cut}…`;
      }
      return p;
    }
  }
  return undefined;
}

/** Fetch config.json for context window and MoE info. Concurrent-safe. */
async function fetchModelConfig(modelId: string): Promise<HFConfig | null> {
  try {
    return await fetchJson<HFConfig>(
      `https://huggingface.co/${modelId}/raw/main/config.json`,
    );
  } catch {
    return null;
  }
}

/** Fetch README.md for description. */
async function fetchReadme(modelId: string): Promise<string | null> {
  try {
    return await fetchText(
      `https://huggingface.co/${modelId}/raw/main/README.md`,
    );
  } catch {
    return null;
  }
}

/** Run async tasks with concurrency limit. */
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ── Main ──

async function main() {
  console.log("Fetching Hugging Face models...");

  // Fetch list with expanded fields (safetensors, cardData, config, lastModified)
  const expandParams = [
    "expand[]=safetensors",
    "expand[]=cardData",
    "expand[]=config",
    "expand[]=lastModified",
    "expand[]=tags",
    "expand[]=gated",
    "expand[]=likes",
    "expand[]=downloads",
    "expand[]=createdAt",
  ].join("&");
  const apiUrl = `${API_URL}&${expandParams}`;

  const models = await fetchJson<HFModelListItem[]>(apiUrl);
  console.log(`Found ${models.length} models`);

  // Filter to instruct/chat models (skip base models)
  const chatModels = models.filter((m) => {
    const name = m.id.toLowerCase();
    return (
      name.includes("instruct") ||
      name.includes("chat") ||
      name.includes("it") ||
      name.includes("gpt-oss") ||
      name.includes("glm") ||
      name.includes("coder") ||
      name.includes("codex") ||
      name.includes("qwen3") ||
      name.includes("thinking")
    );
  });

  console.log(`Filtered to ${chatModels.length} chat/instruct models`);

  // Fetch detailed config.json and README for each model (with concurrency limit)
  console.log(
    `Fetching config.json and README for ${chatModels.length} models (concurrency: ${CONCURRENCY})...`,
  );

  const details = await pMap(
    chatModels,
    async (m) => {
      const [config, readme] = await Promise.all([
        fetchModelConfig(m.id),
        fetchReadme(m.id),
      ]);
      return { config, readme };
    },
    CONCURRENCY,
  );

  let written = 0;
  for (let i = 0; i < chatModels.length; i++) {
    const m = chatModels[i];
    const { config, readme } = details[i];
    const shortName = extractName(m.id);

    // Parameters from safetensors
    const totalParams = m.safetensors?.total;
    const parameters = totalParams ? toBillions(totalParams) : undefined;

    // Context window from config.json
    const contextWindow =
      config?.max_position_embeddings ?? config?.max_sequence_length;

    // MoE active parameters
    let activeParameters: number | undefined;
    if (config?.num_experts && config?.num_experts_per_tok && totalParams) {
      // Rough estimate: active params ≈ total * (active_experts / total_experts)
      // This is approximate — non-expert params are always active
      const ratio = config.num_experts_per_tok / config.num_experts;
      const activeTotal = totalParams * ratio;
      activeParameters = toBillions(activeTotal);
    }

    // License from cardData
    const license = normalizeLicense(m.cardData?.license as string | undefined);

    // Release date from createdAt
    const releaseDate = m.createdAt ? m.createdAt.split("T")[0] : undefined;

    // Description from README
    const description = readme ? extractDescription(readme) : undefined;

    // Tags
    const tags = m.tags ?? [];

    // Architecture from config.architectures[0] + MoE signals
    const architecture = inferArchitecture(m.config, config);

    // Model type from pipeline_tag (direct signal from HF)
    const modelType = mapPipelineTag(m.pipeline_tag);

    const entry: ModelEntry = {
      id: m.id,
      name: shortName,
      created_by: extractCreator(m.id),
      family: inferFamily(shortName),
      description,
      page_url: `https://huggingface.co/${m.id}`,
      release_date: releaseDate,
      context_window: contextWindow,
      parameters,
      active_parameters: activeParameters,
      license,
      architecture,
      model_type: modelType,
      capabilities: inferCapabilities(tags, m.config),
    };

    written += upsertWithSnapshot("huggingface", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
