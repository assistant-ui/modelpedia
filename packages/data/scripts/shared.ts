import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

export const PROVIDERS_DIR = path.join(ROOT, "providers");
// ── IO ──

/** Read _sources.json for a provider. */
export function readSources(provider: string): Record<string, unknown> {
  const filePath = path.join(PROVIDERS_DIR, provider, "_sources.json");
  if (!fs.existsSync(filePath)) return {};
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function readModelJson(
  provider: string,
  modelId: string,
): Record<string, unknown> | null {
  const filePath = path.join(
    PROVIDERS_DIR,
    provider,
    "models",
    `${modelId}.json`,
  );
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

export function writeModelJson(
  provider: string,
  modelId: string,
  data: Record<string, unknown>,
) {
  const dir = path.join(PROVIDERS_DIR, provider, "models");
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${modelId}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  console.log(`  wrote ${provider}/models/${modelId}.json`);
}

export function runGenerate(): void {
  console.log("\nRegenerating data.ts...");
  execSync("bun scripts/generate.ts", { stdio: "inherit", cwd: ROOT });
}

// ── Env ──

export function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
  return val;
}

export function envOrNull(...names: string[]): string | null {
  for (const name of names) {
    if (process.env[name]) return process.env[name]!;
  }
  return null;
}

// ── Utils ──

/** Short hash of a JSON value for change detection. */
function hashValue(val: unknown): string {
  return createHash("md5")
    .update(JSON.stringify(val))
    .digest("hex")
    .slice(0, 8);
}

export function sanitizeModelId(id: string): string {
  return id.replace(/[^a-z0-9._-]/gi, "-").toLowerCase();
}

export function today(): string {
  return new Date().toISOString().split("T")[0];
}

export function firstSentence(text: string): string {
  const m = text.match(/^(.+?\.)\s/);
  return m ? m[1] : text.slice(0, 200);
}

const VALID_MODALITIES = new Set(["text", "image", "audio", "video"]);

export function filterModalities(input: string[], output: string[]) {
  return {
    input: input.filter((m) => VALID_MODALITIES.has(m)),
    output: output.filter((m) => VALID_MODALITIES.has(m)),
  };
}

// ── Date normalization ──

const MONTH_MAP: Record<string, string> = {
  jan: "01",
  january: "01",
  feb: "02",
  february: "02",
  mar: "03",
  march: "03",
  apr: "04",
  april: "04",
  may: "05",
  jun: "06",
  june: "06",
  jul: "07",
  july: "07",
  aug: "08",
  august: "08",
  sep: "09",
  september: "09",
  oct: "10",
  october: "10",
  nov: "11",
  november: "11",
  dec: "12",
  december: "12",
};

/**
 * Normalize a date string to YYYY-MM-DD or YYYY-MM format.
 * Handles: "May 2025", "October 31, 2025", "Sep 2021",
 *          "May 31, 2024", "2025-05", "2025-05-31", etc.
 * Returns the original string if it can't be parsed.
 */
export function normalizeDate(date: string | null | undefined): string | null {
  if (!date) return null;
  const s = date.trim();

  // Already YYYY-MM-DD or YYYY-MM
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) return s;

  // "Month Day, Year" → "2025-10-31"
  const mdy = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (mdy) {
    const mm = MONTH_MAP[mdy[1].toLowerCase()];
    if (mm) return `${mdy[3]}-${mm}-${String(mdy[2]).padStart(2, "0")}`;
  }

  // "Month Year" → "2025-10"
  const my = s.match(/^([A-Za-z]+)\s+(\d{4})$/);
  if (my) {
    const mm = MONTH_MAP[my[1].toLowerCase()];
    if (mm) return `${my[2]}-${mm}`;
  }

  return s;
}

// ── Family inference ──

/**
 * Infer model family from the model name/ID.
 * Strips provider prefix (e.g. "anthropic/") if present.
 *
 * Examples:
 *   "gpt-5.4-mini"         → "gpt-5.4"
 *   "claude-opus-4.6"      → "claude-opus"
 *   "claude-3.5-haiku"     → "claude-haiku"
 *   "gemini-2.5-pro"       → "gemini-2.5"
 *   "grok-3-mini"          → "grok-3"
 *   "o3-mini"              → "o3"
 */
export function inferFamily(modelId: string): string | undefined {
  const slash = modelId.indexOf("/");
  let name = slash !== -1 ? modelId.slice(slash + 1) : modelId;
  // Normalize Google variant prefixes: gemini-live-2.5 → gemini-2.5, gemini-robotics-er-1.5 → gemini-1.5
  name = name.replace(/^gemini-(?:live|robotics-\w+)-/i, "gemini-");

  // [regex, fixed_family] — null means use capture group m[1]
  const rules: [RegExp, string | null][] = [
    // OpenAI
    [/^(gpt-5\.\d+)/, null],
    [/^gpt-5(?:-|$)/, "gpt-5"],
    [/^(gpt-4\.1)/, null],
    [/^gpt-4o/, "gpt-4o"],
    [/^gpt-4-turbo/, "gpt-4-turbo"],
    [/^gpt-4(?:-|$)/, "gpt-4"],
    [/^gpt-3\.5/, "gpt-3.5"],
    [/^(gpt-image-\d+\.?\d*)/, null],
    [/^gpt-image/, "gpt-image"],
    [/^gpt-realtime/, "gpt-realtime"],
    [/^gpt-audio/, "gpt-audio"],
    [/^gpt-oss/, "gpt-oss"],
    [/^(o\d+)(?:-|$)/, null],
    [/^codex/, "codex"],
    [/^chatgpt/, "chatgpt"],
    // Anthropic
    [/^claude.*opus/, "claude-opus"],
    [/^claude.*sonnet/, "claude-sonnet"],
    [/^claude.*haiku/, "claude-haiku"],
    [/^claude/, "claude"],
    // Google
    [/^(gemini-\d+\.?\d*)/, null],
    [/^(gemma-\d+\w*)/, null],
    // xAI
    [/^(grok-\d+\.?\d*)/, null],
    [/^grok-code/, "grok-code"],
    [/^grok-imagine/, "grok-imagine"],
    // DeepSeek
    [/^deepseek-r\d+/, "deepseek-r1"],
    [/^deepseek-reasoner/, "deepseek-reasoner"],
    [/^deepseek-chat/, "deepseek-chat"],
    [/^deepseek/, "deepseek"],
    // Mistral
    [/^mistral-large/, "mistral-large"],
    [/^mistral-small/, "mistral-small"],
    [/^mistral-medium/, "mistral-medium"],
    [/^codestral/, "codestral"],
    [/^ministral/, "ministral"],
    [/^pixtral/, "pixtral"],
    [/^devstral/, "devstral"],
    [/^mixtral/, "mixtral"],
    // Meta
    [/^(?:meta-)?llama-?guard/i, "llama-guard"],
    [/^codellama/i, "codellama"],
    [/^(?:meta-)?(llama-\d+\.?\d*)/i, null],
    // Qwen
    [/^(qwen\d*\.?\d*)/, null],
    [/^qwq/, "qwq"],
    // Cohere
    [/^command-a/, "command-a"],
    [/^command-r-plus/, "command-r-plus"],
    [/^command-r\d*/, "command-r"],
    [/^command/, "command"],
    [/^c4ai-aya/, "aya"],
    [/^embed/, "embed"],
    [/^rerank/, "rerank"],
    // Google non-gemini
    [/^(imagen-\d+\.?\d*)/i, null],
    [/^imagen/i, "imagen"],
    [/^(veo-\d+\.?\d*)/i, null],
    [/^gemini-embedding/, "gemini-embedding"],
    [/^deep-research/, "deep-research"],
    // ZAI / GLM
    [/^(glm-\d+\.?\d*)/i, null],
    [/^glm/i, "glm"],
    // MiniMax
    [/^minimax/i, "minimax"],
    // Moonshot / Kimi
    [/^(kimi-k\d+\.?\d*)/i, null],
    [/^kimi/i, "kimi"],
    [/^(moonshot-v\d+)/i, null],
    [/^moonshot/i, "moonshot"],
    // Mistral non-main
    [/^magistral/, "magistral"],
    [/^mistral-nemo/, "mistral-nemo"],
    [/^mistral-saba/, "mistral-saba"],
    [/^mistral-7b/, "mistral-7b"],
    [/^mistral-embed/, "mistral-embed"],
    [/^mistral-moderation/, "mistral-moderation"],
    [/^voxtral/, "voxtral"],
    // OpenAI non-gpt
    [/^dall-e/, "dall-e"],
    [/^sora-2/, "sora-2"],
    [/^text-embedding/, "text-embedding"],
    [/^omni-moderation/, "omni-moderation"],
    [/^text-moderation/, "text-moderation"],
    [/^tts/, "tts"],
    [/^gpt-4\.5/, "gpt-4.5"],
    // Qwen non-qwen
    [/^(wan\d*\.?\d*)/i, null],
    [/^wanx/, "wanx"],
    // Perplexity
    [/^sonar/, "sonar"],
    // Groq
    [/^compound/, "compound"],
    // Audio
    [/^whisper/, "whisper"],
  ];

  for (const [re, fixed] of rules) {
    const m = name.match(re);
    if (m) return fixed ?? m[1];
  }

  return undefined;
}

// ── Parameter inference ──

/**
 * Extract parameter counts from model name/ID.
 * Returns { parameters, active_parameters } in billions, or undefined.
 *
 * Examples:
 *   "Llama-3.1-405B-Instruct"        → { parameters: 405 }
 *   "qwen3-235b-a22b"                 → { parameters: 235, active_parameters: 22 }
 *   "ministral-8b"                    → { parameters: 8 }
 *   "gpt-5.4"                         → undefined (proprietary, no public params)
 */
export function inferParameters(
  modelId: string,
): { parameters: number; active_parameters?: number } | undefined {
  const id = modelId.toLowerCase();
  // MoE pattern: 235b-a22b
  const moe = id.match(/(\d+)b[\s_-]*a(\d+)b/i);
  if (moe) {
    return {
      parameters: Number(moe[1]),
      active_parameters: Number(moe[2]),
    };
  }
  // Standard pattern: 70B, 8b, 405B (must be preceded by - or start of known prefix)
  const std = id.match(/(?:^|[-_])(\d+(?:\.\d+)?)b(?:[-_]|$)/i);
  if (std) {
    return { parameters: Number(std[1]) };
  }
  return undefined;
}

// ── Model type inference ──

/**
 * Infer model_type from model ID and optional metadata.
 * Returns undefined if cannot be determined.
 */
export function inferModelType(
  modelId: string,
  endpoints?: string[],
): string | undefined {
  // Strip provider prefix (e.g. "stability.sd3-5-large" → "sd3-5-large", "anthropic/claude-opus" → "claude-opus")
  // but keep version dots (e.g. "llama-3.1-8b" stays as-is)
  const raw = modelId.toLowerCase();
  const slashIdx = raw.indexOf("/");
  const stripped = slashIdx !== -1 ? raw.slice(slashIdx + 1) : raw;
  const prefixMatch = stripped.match(/^([a-z]+)\./);
  const id = prefixMatch ? stripped.slice(prefixMatch[0].length) : stripped;

  // Embedding
  if (/^text-embedding|embed/i.test(id)) return "embed";
  // Image generation
  if (
    /^(dall-e|chatgpt-image|gpt-image|stable-diffusion|flux|sdxl|imagen)/i.test(
      id,
    )
  )
    return "image";
  if (/^grok-imagine/i.test(id)) return "image";
  if (/^recraft/i.test(id)) return "image";
  if (/^wanx?[\d.]+-t2i|^wanx?[\d.]+-image/i.test(id)) return "image";
  if (/^stable[-_](?:diffusion|image)|^sd\d/i.test(id)) return "image";
  if (/^titan[-_]image/i.test(id)) return "image";
  if (/^nova[-_]canvas/i.test(id)) return "image";
  if (/^stable[-_](?:outpaint|style|conservative|creative|fast)/i.test(id))
    return "image";
  if (/^titan[-_]e/i.test(id)) return "embed";
  // Video generation
  if (/^(sora|veo|seedance|kling)/i.test(id)) return "video";
  if (/^wanx?[\d.]+-(?:t2v|i2v|kf2v|r2v|s2v|vace|animate)/i.test(id))
    return "video";
  if (/^nova[-_]reel|^ray[-_]v/i.test(id)) return "video";
  if (/^pegasus/i.test(id)) return "video";
  // TTS / music / audio
  if (/^tts-|[-_]tts(?:[-_]|$)/i.test(id)) return "tts";
  if (/^orpheus/i.test(id)) return "tts";
  if (/^lyria/i.test(id)) return "tts";
  if (/^nova[-_]sonic|^voxtral/i.test(id)) return "audio";
  // Deep research
  if (/^deep-research/i.test(id)) return "reasoning";
  // Transcription / ASR
  if (/^whisper|transcribe|^asr/i.test(id)) return "transcription";
  // Moderation
  if (/moderation/i.test(id)) return "moderation";
  // Rerank
  if (/rerank/i.test(id)) return "rerank";
  // Code (dedicated code models, not code-capable chat models)
  if (/^codestral|^devstral|^codellama|^codex/i.test(id)) return "code";
  if (/^grok-code/i.test(id)) return "code";
  // Reasoning (generic, after specific o-series/deepseek checks)
  if (/reasoning/i.test(id)) return "reasoning";
  // Realtime / search (specialized chat variants)
  if (/realtime/i.test(id)) return "audio";
  if (/search/i.test(id)) return "chat";
  // Translation
  if (/translate/i.test(id)) return "translation";
  // Qwen-specific: coder → code, omni with audio → audio
  if (/^qwen.*coder/i.test(id)) return "code";
  if (/^qwen.*omni/i.test(id)) return "chat";
  // Chat models (after more specific patterns above)
  if (/^command|^c4ai-aya|^qwen/i.test(id)) return "chat";
  if (/^nova[-_](?:pro|lite|micro|premier|2)/i.test(id)) return "chat";
  if (
    /^(?:meta-)?llama|^jamba|^palmyra|^mixtral|^mistral|^ministral|^pixtral/i.test(
      id,
    )
  )
    return "chat";
  if (/^titan[-_]t/i.test(id)) return "chat";
  if (/^glm|^kimi|^nemotron|^minimax|^gpt-oss|^m\d+-/i.test(id)) return "chat";
  if (/^claude/i.test(id)) return "chat";
  if (/^gemma/i.test(id)) return "chat";
  if (/^gemini/i.test(id)) return "chat";
  if (/^grok/i.test(id)) return "chat";
  if (/^wan.*(?:t2i|image)/i.test(id)) return "image";
  if (/^wan/i.test(id)) return "video";
  if (/^sonar/i.test(id)) return "chat";
  if (/^moonshot/i.test(id)) return "chat";
  if (/^deepseek[-_]v\d|^deepseek[-_]chat/i.test(id)) return "chat";
  if (/^r1|^v3/i.test(id)) return "chat"; // deepseek on bedrock
  if (/^gpt-\d|^gpt[-_]audio/i.test(id)) return "chat";
  if (/^cogito|^granite|^lfm|^rnj|^mimo|^phi|^falcon/i.test(id)) return "chat";
  if (/^computer-use/i.test(id)) return "chat";
  if (/^ultravox/i.test(id)) return "audio";
  if (/^cogview/i.test(id)) return "image";
  if (/^cogvideo/i.test(id)) return "video";
  if (/^tts$|^tts-/i.test(id)) return "tts";
  if (/^composer/i.test(id)) return "chat"; // cursor composer
  // Reasoning
  if (/^(o\d+)(?:-|$)/.test(id)) return "reasoning";
  if (/^deepseek-r\d/i.test(id)) return "reasoning";
  if (/^qwq/i.test(id)) return "reasoning";
  if (/^kimi.*thinking|^magistral/i.test(id)) return "reasoning";
  // Guard / safety
  if (/guard|safeguard/i.test(id)) return "moderation";
  // Endpoint-based inference
  if (
    endpoints?.includes("embeddings") &&
    !endpoints.includes("chat_completions")
  )
    return "embed";

  return undefined;
}

// ── Pricing helper ──

/**
 * Build a pricing object from a source record, only including non-null fields.
 * Eliminates the repeated pattern of checking each pricing field individually.
 */
export function buildPricing(source: {
  input?: number | null;
  output?: number | null;
  cached_input?: number | null;
  cache_write?: number | null;
  batch_input?: number | null;
  batch_output?: number | null;
  tiers?: unknown;
}): Record<string, unknown> | undefined {
  const p: Record<string, unknown> = {};
  if (source.input != null) p.input = source.input;
  if (source.output != null) p.output = source.output;
  if (source.cached_input != null) p.cached_input = source.cached_input;
  if (source.cache_write != null) p.cache_write = source.cache_write;
  if (source.batch_input != null) p.batch_input = source.batch_input;
  if (source.batch_output != null) p.batch_output = source.batch_output;
  if (source.tiers != null) p.tiers = source.tiers;
  return Object.keys(p).length > 0 ? p : undefined;
}

// ── Upsert ──

import type { ModelData } from "../src/types";

/**
 * Entry passed to upsertModel. All fields optional except id/name.
 * `source` and `last_updated` are set automatically.
 * `pricing` accepts any record (tiers are handled internally).
 */
export type ModelEntry = Omit<
  Partial<ModelData>,
  "id" | "name" | "source" | "last_updated" | "pricing"
> & {
  id: string;
  name: string;
  pricing?: Record<string, unknown>;
};

function mergeObjects(
  existing: Record<string, unknown> | undefined,
  entry: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!existing && !entry) return undefined;
  const merged: Record<string, unknown> = {};
  if (existing) {
    for (const [k, v] of Object.entries(existing)) {
      if (v !== undefined) merged[k] = v;
    }
  }
  if (entry) {
    for (const [k, v] of Object.entries(entry)) {
      if (v !== undefined) merged[k] = v;
    }
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function pick<T>(...values: (T | undefined)[]): T | undefined {
  for (const v of values) {
    if (v !== undefined) return v;
  }
  return undefined;
}

// Fields excluded from change tracking (metadata, not model data)
const GENERATED_SKIP = new Set([
  "id",
  "created_by",
  "source",
  "last_updated",
  "_generated",
  "snapshots",
  "alias",
]);

/**
 * Protect user-edited fields from being overwritten by script.
 *
 * Stores a short hash per field. On next run:
 * - user changed + script unchanged → keep user value
 * - user changed + script also changed → script wins (upstream updated)
 * - user unchanged → script value (normal update)
 *
 * Mutates `data` in place (restores user values where needed).
 * Returns the new `_generated` hash map.
 */
function protectUserEdits(
  data: Record<string, unknown>,
  existing: Record<string, unknown> | null,
  generated: Record<string, string>,
): Record<string, string> {
  const newGenerated: Record<string, string> = {};

  for (const field of Object.keys(data)) {
    if (GENERATED_SKIP.has(field) || data[field] === undefined) continue;

    const scriptHash = hashValue(data[field]);
    newGenerated[field] = scriptHash;

    if (existing) {
      const currentVal = existing[field];
      const lastGenHash = generated[field];
      if (currentVal !== undefined && lastGenHash !== undefined) {
        const userChanged = hashValue(currentVal) !== lastGenHash;
        const scriptChanged = scriptHash !== lastGenHash;

        if (userChanged && !scriptChanged) {
          data[field] = currentVal;
          newGenerated[field] = lastGenHash;
        }
      }
    }
  }

  return newGenerated;
}

/**
 * Upsert a model entry, merging with existing data.
 * Skips if existing model has source: "community".
 */
export function upsertModel(provider: string, entry: ModelEntry): boolean {
  const modelId = sanitizeModelId(entry.id);
  const existing = readModelJson(provider, modelId);

  if (existing && existing.source === "community") {
    console.log(`  skip ${modelId} (community)`);
    return false;
  }

  // _generated: hash of each field's value when last written by script.
  // If a field's current hash differs from _generated, a user manually changed it → preserve it.
  const generated = (existing?._generated as Record<string, string>) ?? {};

  // Start from existing data to preserve all fields, then overlay new values
  const data: Record<string, unknown> = existing ? { ...existing } : {};

  // Always set core fields
  data.id = entry.id;
  // Prefer display name (e.g. "GPT-5.4 nano") over raw ID (e.g. "gpt-5.4-nano")
  const existingName = existing?.name as string | undefined;
  const isRawId = entry.name === entry.id;
  data.name =
    isRawId && existingName && existingName !== entry.id
      ? existingName
      : entry.name;
  data.created_by =
    entry.created_by ?? (existing?.created_by as string) ?? provider;
  data.source = "official";
  data.last_updated = today();

  const scalars = [
    "family",
    "description",
    "status",
    "release_date",
    "deprecation_date",
    "knowledge_cutoff",
    "context_window",
    "max_context_window",
    "max_output_tokens",
    "max_input_tokens",
    "model_type",
    "reasoning_tokens",
    "license",
    "parameters",
    "active_parameters",
    "alias",
    "performance",
    "reasoning",
    "speed",
    "tagline",
    "page_url",
    "successor",
    "training_data_cutoff",
    "architecture",
    "open_weight",
  ] as const;

  const DATE_FIELDS = new Set([
    "release_date",
    "deprecation_date",
    "knowledge_cutoff",
    "training_data_cutoff",
  ]);

  for (const key of scalars) {
    const val = pick(entry[key], existing?.[key] as any);
    if (val !== undefined) {
      data[key] =
        DATE_FIELDS.has(key) && typeof val === "string"
          ? normalizeDate(val)
          : val;
    }
  }

  // Auto-infer model_type if not explicitly set
  if (!data.model_type) {
    const inferred = inferModelType(
      entry.id,
      entry.endpoints as string[] | undefined,
    );
    if (inferred) data.model_type = inferred;
  }

  // Auto-generate tagline from description if not set
  if (!data.tagline && data.description) {
    const candidate = firstSentence(data.description as string);
    if (candidate && candidate !== "N/A" && candidate.length > 5) {
      data.tagline = candidate;
    }
  }

  const caps = mergeObjects(
    existing?.capabilities as Record<string, unknown> | undefined,
    entry.capabilities as Record<string, unknown> | undefined,
  );
  if (caps) data.capabilities = caps;

  const mods = mergeObjects(
    existing?.modalities as Record<string, unknown> | undefined,
    entry.modalities as Record<string, unknown> | undefined,
  );
  if (mods) data.modalities = mods;

  // Pricing: merge scalar fields but replace tiers array entirely
  const existingPricing = existing?.pricing as
    | Record<string, unknown>
    | undefined;
  const entryPricing = entry.pricing as Record<string, unknown> | undefined;
  const pricing = mergeObjects(existingPricing, entryPricing);
  if (pricing) {
    // tiers should come from entry (current fetch), not be merged
    if (entryPricing?.tiers) {
      pricing.tiers = entryPricing.tiers;
    }
    data.pricing = pricing;
  }

  // Array fields
  // Auto-derive open_weight from license if not explicitly set
  if (data.open_weight == null && data.license) {
    data.open_weight = data.license !== "proprietary";
  }

  // Auto-default modalities for chat/reasoning/code models
  if (!data.modalities && data.model_type) {
    const chatTypes = new Set([
      "chat",
      "reasoning",
      "code",
      "moderation",
      "translation",
    ]);
    if (chatTypes.has(data.model_type as string)) {
      data.modalities = { input: ["text"], output: ["text"] };
    }
  }

  for (const key of ["tools", "endpoints", "pricing_notes"] as const) {
    const val = entry[key] ?? (existing?.[key] as string[] | undefined);
    if (val && Array.isArray(val) && val.length > 0) data[key] = val;
  }

  // Auto-infer tools from capabilities if not explicitly set
  if (
    !data.tools &&
    (data.capabilities as Record<string, unknown> | undefined)?.tool_call
  ) {
    data.tools = ["function_calling"];
  }

  // Provider-specific extra fields (not in ModelEntry schema but passed via spread)
  // Derived from scalars + core/object/array fields to stay in sync
  const knownKeys = new Set<string>([
    ...scalars,
    "id",
    "name",
    "created_by",
    "source",
    "last_updated",
    "capabilities",
    "modalities",
    "pricing",
    "tools",
    "endpoints",
    "snapshots",
    "pricing_notes",
    "_generated",
  ]);
  for (const [key, val] of Object.entries(entry)) {
    if (!knownKeys.has(key) && val !== undefined) {
      data[key] = val;
    }
  }

  // Snapshots: merge (append new, keep existing, deduplicate)
  const existingSnapshots = (existing?.snapshots as string[] | undefined) ?? [];
  const newSnapshots = entry.snapshots ?? [];
  const allSnapshots = [...new Set([...existingSnapshots, ...newSnapshots])];
  if (allSnapshots.length > 0) data.snapshots = allSnapshots;

  data._generated = protectUserEdits(data, existing, generated);

  // Diff: log what changed and record to changes
  if (existing) {
    const changedFields: Record<string, { from: unknown; to: unknown }> = {};
    for (const [k, v] of Object.entries(data)) {
      const oldVal = existing[k];
      if (k === "last_updated" || k === "_generated") continue;
      if (JSON.stringify(v) !== JSON.stringify(oldVal)) {
        changedFields[k] = { from: oldVal, to: v };
      }
    }
    if (Object.keys(changedFields).length === 0) {
      console.log(`  skip ${modelId} (no changes)`);
      return false;
    }
    console.log(
      `  update ${provider}/models/${modelId}.json [${Object.keys(changedFields).join(", ")}]`,
    );
  }

  writeModelJson(provider, modelId, data);
  return true;
}

/**
 * Delete a model entry and record to changes.
 */
export function deleteModel(provider: string, modelId: string): boolean {
  const sanitized = sanitizeModelId(modelId);
  const filePath = path.join(
    PROVIDERS_DIR,
    provider,
    "models",
    `${sanitized}.json`,
  );
  if (!fs.existsSync(filePath)) {
    console.log(`  skip ${sanitized} (not found)`);
    return false;
  }
  fs.unlinkSync(filePath);
  console.log(`  deleted ${provider}/models/${sanitized}.json`);
  return true;
}

// ── Snapshot detection ──

/**
 * Detect if a model ID is a dated snapshot and return its alias.
 * Patterns:
 *   "gpt-5.4-2026-03-05"       → alias "gpt-5.4"
 *   "claude-opus-4-5-20251101"  → alias "claude-opus-4-5"
 *   "mistral-large-2407"        → alias "mistral-large"
 * Returns null if the ID is not a snapshot.
 */
export function detectSnapshot(
  modelId: string,
): { alias: string; snapshot: string } | null {
  // YYYY-MM-DD suffix (OpenAI style)
  const dashDate = modelId.match(/^(.+)-\d{4}-\d{2}-\d{2}$/);
  if (dashDate) return { alias: dashDate[1], snapshot: modelId };

  // YYYYMMDD suffix (Anthropic style)
  const compactDate = modelId.match(/^(.+)-\d{8}$/);
  if (compactDate) return { alias: compactDate[1], snapshot: modelId };

  // YYMM suffix (Mistral style, e.g. mistral-large-2407)
  const shortDate = modelId.match(/^(.+)-(\d{4})$/);
  if (shortDate) {
    const [yy, mm] = [
      Number(shortDate[2].slice(0, 2)),
      Number(shortDate[2].slice(2)),
    ];
    if (yy >= 20 && yy <= 30 && mm >= 1 && mm <= 12) {
      return { alias: shortDate[1], snapshot: modelId };
    }
  }

  return null;
}

/**
 * Write both alias and snapshot model files with proper relationship.
 * - Alias model gets `snapshots: [snapshotId]` (appended via merge)
 * - Snapshot model gets `alias: aliasId`
 * If the model is not a snapshot, writes a single file.
 * Returns number of models written.
 */
export function upsertWithSnapshot(
  provider: string,
  entry: ModelEntry,
): number {
  const detected = detectSnapshot(entry.id);

  if (!detected) {
    // Not a snapshot — write single file
    return upsertModel(provider, entry) ? 1 : 0;
  }

  const { alias, snapshot } = detected;
  let written = 0;

  // Write alias model (with snapshot in snapshots list)
  // Use alias as name if entry.name is the same as snapshot id
  const aliasName =
    entry.name === snapshot || entry.name === entry.id ? alias : entry.name;
  const aliasEntry: ModelEntry = {
    ...entry,
    id: alias,
    name: aliasName,
    snapshots: [snapshot],
    alias: undefined,
  };
  if (upsertModel(provider, aliasEntry)) written++;

  // Write snapshot model (with alias back-reference)
  // Inherit missing fields from the alias file so snapshots are self-contained
  const aliasData = readModelJson(provider, sanitizeModelId(alias));
  const inheritableKeys = [
    "context_window",
    "max_output_tokens",
    "max_input_tokens",
    "knowledge_cutoff",
    "description",
    "model_type",
    "reasoning_tokens",
    "license",
    "parameters",
    "active_parameters",
    "performance",
    "reasoning",
    "speed",
  ] as const;
  const snapshotEntry: ModelEntry = {
    ...entry,
    id: snapshot,
    alias,
    snapshots: undefined,
  };
  if (aliasData) {
    for (const key of inheritableKeys) {
      if (snapshotEntry[key] == null && aliasData[key] != null) {
        (snapshotEntry as any)[key] = aliasData[key];
      }
    }
    // Merge pricing: inherit flat fields from alias, keep snapshot-specific tiers
    if (aliasData.pricing) {
      const aliasPricing = aliasData.pricing as Record<string, unknown>;
      if (!snapshotEntry.pricing) {
        snapshotEntry.pricing = aliasPricing as Record<string, number>;
      } else {
        // Inherit flat pricing fields (input, output, etc.) that snapshot lacks
        for (const pk of [
          "input",
          "output",
          "cached_input",
          "cache_write",
          "batch_input",
          "batch_output",
        ]) {
          if (
            (snapshotEntry.pricing as Record<string, unknown>)[pk] == null &&
            aliasPricing[pk] != null
          ) {
            (snapshotEntry.pricing as Record<string, unknown>)[pk] =
              aliasPricing[pk];
          }
        }
      }
    }
    if (!snapshotEntry.capabilities && aliasData.capabilities) {
      snapshotEntry.capabilities = aliasData.capabilities as Record<
        string,
        boolean
      >;
    }
    if (!snapshotEntry.modalities && aliasData.modalities) {
      snapshotEntry.modalities = aliasData.modalities as {
        input?: string[];
        output?: string[];
      };
    }
  }
  if (upsertModel(provider, snapshotEntry)) written++;

  return written;
}
