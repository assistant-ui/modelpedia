import {
  buildPricing,
  filterModalities,
  firstSentence,
  inferFamily,
  inferModelType,
  inferParameters,
  type ModelEntry,
} from "./shared.ts";

export function toPerMillion(perToken: string | number | undefined | null) {
  if (perToken == null || perToken === "") return undefined;
  const value = Number(perToken);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  return Math.round(value * 1_000_000 * 1000) / 1000;
}

export function dateOnly(value: string | number | undefined | null) {
  if (value == null || value === "") return undefined;
  const date =
    typeof value === "number"
      ? new Date(value * 1000)
      : new Date(String(value));
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

export function displayNameFromId(id: string) {
  const bare = id.split("/").pop() ?? id;
  return bare
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase());
}

const CREATOR_MAP: Record<string, string> = {
  "01-ai": "01-ai",
  ai21labs: "ai21",
  alibaba: "alibaba",
  anthropic: "anthropic",
  "black-forest-labs": "black-forest-labs",
  bytedance: "bytedance",
  "bytedance-seed": "bytedance",
  deepseek: "deepseek",
  "deepseek-ai": "deepseek",
  fal: "fal",
  "fal-ai": "fal",
  google: "google",
  jinaai: "jina",
  "meta-llama": "meta",
  microsoft: "microsoft",
  minimax: "minimax",
  mistralai: "mistral",
  moonshotai: "moonshot",
  openai: "openai",
  qwen: "alibaba",
  replicate: "replicate",
  stabilityai: "stability",
  "stability-ai": "stability",
  voyage: "voyage",
  xai: "xai",
  "x-ai": "xai",
  xiaomimimo: "xiaomi",
  "zai-org": "zai",
  "z-ai": "zai",
};

export function createdByFromModelId(id: string, fallback: string) {
  const owner = id.includes("/") ? id.split("/")[0] : fallback;
  return CREATOR_MAP[owner] ?? owner.toLowerCase().replace(/_/g, "-");
}

export function capabilitiesFromText(
  text: string,
  extra: Record<string, boolean> = {},
) {
  const lower = text.toLowerCase();
  const caps: Record<string, boolean> = { ...extra };
  if (/(vision|image|multimodal|vl\b)/.test(lower)) caps.vision = true;
  if (/(tool|function calling|function-calling)/.test(lower))
    caps.tool_call = true;
  if (/(reasoning|thinking)/.test(lower)) caps.reasoning = true;
  if (/(json|structured)/.test(lower)) caps.structured_output = true;
  return caps;
}

export function capabilitiesFromParameters(params: string[] | undefined) {
  const set = new Set(params ?? []);
  const caps: Record<string, boolean> = {};
  if (set.has("tools") || set.has("tool_choice")) caps.tool_call = true;
  if (set.has("response_format") || set.has("structured_outputs"))
    caps.structured_output = true;
  if (set.has("reasoning") || set.has("include_reasoning"))
    caps.reasoning = true;
  return caps;
}

export function modelTypeFromCategory(category: string | undefined) {
  const value = (category ?? "").toLowerCase();
  if (!value) return undefined;
  if (value.includes("embedding")) return "embed";
  if (value.includes("rerank")) return "rerank";
  if (value.includes("text-to-image") || value.includes("image-to-image"))
    return "image";
  if (value.includes("text-to-video") || value.includes("image-to-video"))
    return "video";
  if (value.includes("text-to-speech")) return "tts";
  if (
    value.includes("speech-to-text") ||
    value.includes("audio-to-text") ||
    value.includes("transcription")
  )
    return "transcription";
  if (value.includes("chat") || value.includes("text-generation"))
    return "chat";
  if (value.includes("code")) return "code";
  return "other";
}

export function modalitiesForType(
  modelType: ModelEntry["model_type"] | undefined,
  hint = "",
) {
  const lower = hint.toLowerCase();
  if (modelType === "image") {
    return filterModalities(
      lower.includes("image-to-image") ? ["text", "image"] : ["text"],
      ["image"],
    );
  }
  if (modelType === "video") {
    const input = ["text"];
    if (lower.includes("image-to-video")) input.push("image");
    if (lower.includes("audio")) input.push("audio");
    return filterModalities(input, ["video"]);
  }
  if (modelType === "tts") return filterModalities(["text"], ["audio"]);
  if (modelType === "transcription")
    return filterModalities(["audio"], ["text"]);
  if (modelType === "embed" || modelType === "rerank")
    return filterModalities(["text"], ["text"]);
  if (
    modelType === "chat" ||
    modelType === "reasoning" ||
    modelType === "code"
  ) {
    const input = ["text"];
    if (/(vision|image|multimodal|vl\b)/.test(lower)) input.push("image");
    return filterModalities(input, ["text"]);
  }
  return undefined;
}

export function endpointsForType(modelType: ModelEntry["model_type"]) {
  if (modelType === "embed") return ["embeddings"];
  if (modelType === "rerank") return ["rerank"];
  if (modelType === "image") return ["images"];
  if (modelType === "video") return ["video"];
  if (modelType === "tts") return ["audio_speech"];
  if (modelType === "transcription") return ["audio_transcriptions"];
  if (modelType === "chat" || modelType === "reasoning" || modelType === "code")
    return ["chat_completions"];
  return [];
}

export function enrichEntry(
  entry: ModelEntry,
  opts?: { description?: string; modelTypeHint?: string },
) {
  const modelType =
    entry.model_type ??
    (modelTypeFromCategory(opts?.modelTypeHint) as ModelEntry["model_type"]) ??
    (inferModelType(entry.id) as ModelEntry["model_type"] | undefined);
  if (modelType) entry.model_type = modelType;
  entry.family ??= inferFamily(entry.id);
  const params = inferParameters(entry.id);
  if (params) {
    entry.parameters ??= params.parameters;
    entry.active_parameters ??= params.active_parameters;
  }
  if (opts?.description) {
    entry.description ??= firstSentence(opts.description);
  }
  const hint = `${entry.id} ${entry.name} ${opts?.description ?? ""} ${opts?.modelTypeHint ?? ""}`;
  const caps = capabilitiesFromText(hint, entry.capabilities ?? {});
  if (modelType === "chat" || modelType === "reasoning" || modelType === "code")
    caps.streaming ??= true;
  if (Object.keys(caps).length > 0) entry.capabilities = caps;
  entry.modalities ??= modalitiesForType(modelType, hint);
  const endpoints = modelType ? endpointsForType(modelType) : [];
  if (endpoints.length > 0) entry.endpoints ??= endpoints;
  return entry;
}

export function tokenPricing(
  input?: unknown,
  output?: unknown,
  cached?: unknown,
) {
  return buildPricing({
    input: toPerMillion(input as string | number | undefined),
    output: toPerMillion(output as string | number | undefined),
    cached_input: toPerMillion(cached as string | number | undefined),
  });
}

export async function fetchJsonWithOptionalBearer<T>(
  url: string,
  token?: string | null,
) {
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  return (await res.json()) as T;
}
