import {
  inferFamily,
  inferModelType,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch SambaNova Cloud models from the public /v1/models endpoint.
 * The endpoint is unauthenticated and returns full model metadata including
 * pricing (USD per token, multiplied by 1e6 for per-1M-token rate).
 *
 * Whisper-Large-v3 lives at /v1/audio/transcriptions, not /v1/models, so it's
 * added manually as a community-tracked entry.
 */

const sources = readSources("sambanova");
const MODELS_URL = sources.models as string;

interface SambaModel {
  id: string;
  context_length?: number;
  max_completion_tokens?: number;
  owned_by?: string;
  pricing?: { prompt?: string; completion?: string };
}

interface SambaResponse {
  data: SambaModel[];
  object: string;
}

function inferCreator(id: string): string {
  const lower = id.toLowerCase();
  if (lower.includes("llama")) return "meta";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("whisper")) return "openai";
  if (lower.startsWith("gpt-oss")) return "openai";
  if (lower.includes("minimax")) return "minimax";
  if (lower.includes("gemma")) return "google";
  if (lower.includes("qwen") || lower.startsWith("qwq")) return "qwen";
  return "unknown";
}

function tokensPerMillion(perTokenStr: string | undefined): number | undefined {
  if (!perTokenStr) return undefined;
  const n = Number(perTokenStr);
  if (!Number.isFinite(n)) return undefined;
  // Round to 4 decimals to keep the number compact (e.g. 0.00000300 → 3.0)
  return Math.round(n * 1_000_000 * 10000) / 10000;
}

const MANUAL_OVERRIDES: Record<string, Partial<ModelEntry>> = {
  "DeepSeek-V3.1": {
    name: "DeepSeek V3.1",
    family: "deepseek-v3",
    description:
      "Hybrid reasoning MoE model with switchable thinking and non-thinking modes.",
    status: "active",
    model_type: "reasoning",
    reasoning_tokens: true,
    license: "deepseek",
    open_weight: true,
    capabilities: {
      tool_call: true,
      structured_output: true,
      reasoning: true,
      json_mode: true,
      streaming: true,
    },
  },
  "DeepSeek-V3.1-cb": {
    name: "DeepSeek V3.1 (continuous batching)",
    family: "deepseek-v3",
    description:
      "High-volume continuous-batching variant of DeepSeek V3.1 with reduced context and lower price.",
    status: "active",
    model_type: "reasoning",
    reasoning_tokens: true,
    license: "deepseek",
    open_weight: true,
    capabilities: {
      tool_call: true,
      structured_output: true,
      reasoning: true,
      json_mode: true,
      streaming: true,
    },
  },
  "DeepSeek-V3.2": {
    name: "DeepSeek V3.2",
    family: "deepseek-v3",
    description:
      "Preview release of DeepSeek V3.2 on SambaCloud, high volume lane with limited context.",
    status: "preview",
    model_type: "reasoning",
    reasoning_tokens: true,
    license: "deepseek",
    open_weight: true,
    capabilities: {
      tool_call: true,
      structured_output: true,
      reasoning: true,
      json_mode: true,
      streaming: true,
    },
  },
  "Llama-4-Maverick-17B-128E-Instruct": {
    name: "Llama 4 Maverick 17B 128E Instruct",
    family: "llama-4",
    description:
      "Llama 4 Maverick MoE multimodal model (17B active, 128 experts) with vision input.",
    status: "preview",
    model_type: "chat",
    license: "llama-4",
    open_weight: true,
    capabilities: {
      vision: true,
      tool_call: true,
      structured_output: true,
      json_mode: true,
      streaming: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  "Meta-Llama-3.3-70B-Instruct": {
    name: "Llama 3.3 70B Instruct",
    family: "llama-3",
    description: "Meta's Llama 3.3 70B instruction-tuned model.",
    status: "active",
    model_type: "chat",
    license: "llama-3.3",
    open_weight: true,
    capabilities: {
      tool_call: true,
      structured_output: true,
      json_mode: true,
      streaming: true,
    },
  },
  "MiniMax-M2.5": {
    name: "MiniMax M2.5",
    family: "minimax-m2",
    description:
      "MiniMax M2.5 agentic and coding-focused open-weights model with long context.",
    status: "active",
    model_type: "chat",
    open_weight: true,
    capabilities: {
      tool_call: true,
      structured_output: true,
      json_mode: true,
      streaming: true,
    },
  },
  "gemma-3-12b-it": {
    name: "Gemma 3 12B IT",
    family: "gemma-3",
    description: "Google Gemma 3 12B instruction-tuned open-weights model.",
    status: "active",
    model_type: "chat",
    license: "gemma",
    open_weight: true,
    capabilities: {
      structured_output: true,
      json_mode: true,
      streaming: true,
    },
  },
  "gpt-oss-120b": {
    name: "GPT-OSS 120B",
    family: "gpt-oss",
    description: "OpenAI's open-weight GPT-OSS 120B reasoning model.",
    status: "active",
    model_type: "reasoning",
    reasoning_tokens: true,
    license: "apache-2.0",
    open_weight: true,
    capabilities: {
      tool_call: true,
      structured_output: true,
      reasoning: true,
      json_mode: true,
      streaming: true,
    },
  },
  "DeepSeek-R1-Distill-Llama-70B": {
    name: "DeepSeek R1 Distill Llama 70B",
    family: "deepseek-r1-distill",
    description: "DeepSeek R1 reasoning distilled into a Llama 70B base.",
    status: "active",
    model_type: "reasoning",
    reasoning_tokens: true,
    license: "llama-3",
    open_weight: true,
    capabilities: {
      reasoning: true,
      streaming: true,
    },
  },
};

async function main() {
  console.log("Fetching SambaNova models...");

  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new Error(`/v1/models fetch failed: ${res.status}`);
  const json = (await res.json()) as SambaResponse;
  console.log(`API returned ${json.data.length} models`);

  let written = 0;
  for (const m of json.data) {
    const overrides = MANUAL_OVERRIDES[m.id] ?? {};
    const created_by =
      (overrides.created_by as string | undefined) ?? inferCreator(m.id);
    const family =
      (overrides.family as string | undefined) ?? inferFamily(m.id) ?? "";
    const model_type =
      (overrides.model_type as string | undefined) ??
      inferModelType(m.id) ??
      "chat";

    const inputPrice = tokensPerMillion(m.pricing?.prompt);
    const outputPrice = tokensPerMillion(m.pricing?.completion);

    const entry: ModelEntry = {
      id: m.id,
      name: (overrides.name as string | undefined) ?? m.id,
      created_by,
      family: family || undefined,
      description: overrides.description as string | undefined,
      status: (overrides.status as ModelEntry["status"]) ?? "active",
      model_type: model_type as ModelEntry["model_type"],
      context_window: m.context_length,
      max_output_tokens: m.max_completion_tokens,
      reasoning_tokens: overrides.reasoning_tokens as boolean | undefined,
      license: overrides.license as string | undefined,
      open_weight: overrides.open_weight as boolean | undefined,
      capabilities: overrides.capabilities as ModelEntry["capabilities"],
      modalities:
        (overrides.modalities as ModelEntry["modalities"]) ??
        ({ input: ["text"], output: ["text"] } as ModelEntry["modalities"]),
      endpoints: ["chat_completions"],
    };

    if (inputPrice != null || outputPrice != null) {
      entry.pricing = {};
      if (inputPrice != null) entry.pricing.input = inputPrice;
      if (outputPrice != null) entry.pricing.output = outputPrice;
    }

    if (overrides.capabilities && (overrides.capabilities as any).tool_call) {
      entry.tools = ["function_calling"];
    }

    if (upsertModel("sambanova", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
