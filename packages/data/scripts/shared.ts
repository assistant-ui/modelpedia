import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

export const PROVIDERS_DIR = path.join(ROOT, "providers");

// ── IO ──

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
  const name = slash !== -1 ? modelId.slice(slash + 1) : modelId;

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
    [/^(llama-\d+\.?\d*)/, null],
    [/^llama-guard/, "llama-guard"],
    // Qwen
    [/^(qwen\d*\.?\d*)/, null],
    [/^qwq/, "qwq"],
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

// ── Upsert ──

export interface ModelEntry {
  id: string;
  name: string;
  created_by?: string;
  family?: string;
  description?: string;
  status?: "active" | "deprecated" | "preview";
  release_date?: string | null;
  deprecation_date?: string | null;
  knowledge_cutoff?: string | null;
  context_window?: number | null;
  max_output_tokens?: number | null;
  max_input_tokens?: number | null;
  capabilities?: Record<string, boolean>;
  modalities?: { input?: string[]; output?: string[] };
  pricing?: Record<string, number | null>;
  model_type?: string;
  tools?: string[];
  endpoints?: string[];
  reasoning_tokens?: boolean;
  snapshots?: string[];
  alias?: string;
  performance?: number;
  speed?: number;
}

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

  // Start from existing data to preserve all fields, then overlay new values
  const data: Record<string, unknown> = existing ? { ...existing } : {};

  // Always set core fields
  data.id = entry.id;
  data.name = entry.name;
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
    "max_output_tokens",
    "max_input_tokens",
    "model_type",
    "reasoning_tokens",
    "alias",
    "performance",
    "speed",
  ] as const;

  for (const key of scalars) {
    const val = pick(entry[key], existing?.[key] as any);
    if (val !== undefined) data[key] = val;
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

  const pricing = mergeObjects(
    existing?.pricing as Record<string, unknown> | undefined,
    entry.pricing as Record<string, unknown> | undefined,
  );
  if (pricing) data.pricing = pricing;

  // Array fields
  for (const key of ["tools", "endpoints"] as const) {
    const val = entry[key] ?? (existing?.[key] as string[] | undefined);
    if (val && Array.isArray(val) && val.length > 0) data[key] = val;
  }

  // Snapshots: merge (append new, keep existing, deduplicate)
  const existingSnapshots = (existing?.snapshots as string[] | undefined) ?? [];
  const newSnapshots = entry.snapshots ?? [];
  const allSnapshots = [...new Set([...existingSnapshots, ...newSnapshots])];
  if (allSnapshots.length > 0) data.snapshots = allSnapshots;

  // Diff: log what changed
  if (existing) {
    const changes: string[] = [];
    for (const [k, v] of Object.entries(data)) {
      const oldVal = existing[k];
      if (k === "last_updated") continue;
      if (JSON.stringify(v) !== JSON.stringify(oldVal)) {
        changes.push(k);
      }
    }
    if (changes.length === 0) {
      console.log(`  skip ${modelId} (no changes)`);
      return false;
    }
    console.log(
      `  update ${provider}/models/${modelId}.json [${changes.join(", ")}]`,
    );
  }

  writeModelJson(provider, modelId, data);
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
  const snapshotEntry: ModelEntry = {
    ...entry,
    id: snapshot,
    alias,
    snapshots: undefined,
  };
  if (upsertModel(provider, snapshotEntry)) written++;

  return written;
}
