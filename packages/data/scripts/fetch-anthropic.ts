import * as fs from "node:fs";
import * as path from "node:path";
import {
  envOrNull,
  fetchCached,
  inferFamily,
  type ModelEntry,
  normalizeDate,
  PROVIDERS_DIR,
  parseMarkdownTable,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

// ── Types ──

interface ModelSpec {
  id: string;
  alias?: string;
  name: string;
  description?: string;
  context_window?: number;
  max_output_tokens?: number;
  knowledge_cutoff?: string;
  training_data_cutoff?: string;
  latency?: string;
  extended_thinking?: boolean;
  adaptive_thinking?: boolean;
  bedrock_id?: string;
  vertex_id?: string;
  deprecated?: boolean;
  pricing_input?: number;
  pricing_output?: number;
}

// ── Markdown endpoints ──

const sources = readSources("anthropic");
const MODELS_MD = sources.models as string;
const PRICING_MD = sources.pricing as string;

function parseTokenCount(s: string): number | undefined {
  // Handle: "1M tokens", "200k tokens", "128k tokens",
  // "<Tooltip ...>1M tokens</Tooltip>", "1M (or 200k) tokens"
  const cleaned = s.replace(/<[^>]+>/g, "").replace(/\([^)]*\)/g, "");
  const m = cleaned.match(/([\d,.]+)\s*([MKk])/);
  if (!m) return undefined;
  const num = Number(m[1].replace(/,/g, ""));
  return m[2] === "M" ? num * 1_000_000 : num * 1_000;
}

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

/** Strip HTML tags, sup markers, and markdown code backticks from an ID cell. */
function cleanIdCell(s: string): string {
  return s
    .replace(/<sup>.*?<\/sup>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/`/g, "")
    .trim();
}

/** Model IDs never contain whitespace; prose like "Limited availability" or "N/A" is not an ID. */
function isIdLike(s: string): boolean {
  return s.length > 0 && s !== "N/A" && !/\s/.test(s);
}

// ── Parse models overview page ──

function parseModelsMarkdown(md: string): ModelSpec[] {
  const models: ModelSpec[] = [];

  // Split into sections by table headers
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    // Find table start (header row with "Feature")
    if (!lines[i].includes("| Feature |")) {
      i++;
      continue;
    }

    // Collect table lines
    const tableLines: string[] = [];
    while (i < lines.length && lines[i].startsWith("|")) {
      tableLines.push(lines[i]);
      i++;
    }

    const rows = parseMarkdownTable(tableLines);
    if (rows.length < 3) continue; // header + separator + at least 1 data row

    const headers = rows[0];
    const modelCount = headers.length - 1;
    const cols: ModelSpec[] = Array.from({ length: modelCount }, (_, j) => ({
      id: "",
      name: headers[j + 1].replace(/\(deprecated\)/, "").trim(),
      deprecated: headers[j + 1].includes("deprecated"),
    }));

    for (const row of rows.slice(1)) {
      const feature = row[0]
        .replace(/<[^>]+>/g, "")
        .replace(
          /\[[^\]]+\]\([^)]+\)/g,
          (m) => m.match(/\[([^\]]+)\]/)?.[1] ?? m,
        )
        .trim();

      for (let j = 0; j < modelCount; j++) {
        const val = row[j + 1];
        if (!val) continue;
        const m = cols[j];

        if (feature.includes("Claude API ID")) {
          const clean = cleanIdCell(val);
          if (isIdLike(clean)) m.id = clean;
        } else if (feature.includes("Claude API alias")) {
          const clean = cleanIdCell(val);
          if (isIdLike(clean)) m.alias = clean;
        } else if (feature === "Description") {
          m.description = val;
        } else if (feature.includes("Pricing")) {
          // Two layouts: "\$5 / input MTok<br/>\$25 / output MTok" and
          // "$10 / $50 per MTok (input / output)" — first two dollar values
          // are input then output in both.
          const dollars = Array.from(val.matchAll(/\$([\d.]+)/g), (d) =>
            Number(d[1]),
          );
          if (dollars.length >= 2) {
            m.pricing_input = dollars[0];
            m.pricing_output = dollars[1];
          }
        } else if (feature.includes("Context window")) {
          m.context_window = parseTokenCount(val);
        } else if (feature.includes("Max output")) {
          m.max_output_tokens = parseTokenCount(val);
        } else if (feature.includes("Reliable knowledge cutoff")) {
          const cleaned = val.replace(/<sup>.*?<\/sup>/g, "").trim();
          if (cleaned && cleaned !== "—" && /[A-Z][a-z]+ \d{4}/.test(cleaned)) {
            m.knowledge_cutoff = cleaned.match(/[A-Z][a-z]+ \d{4}/)?.[0];
          }
        } else if (feature.includes("Training data cutoff")) {
          const cleaned = val.replace(/<sup>.*?<\/sup>/g, "").trim();
          if (cleaned && cleaned !== "—" && /[A-Z][a-z]+ \d{4}/.test(cleaned)) {
            m.training_data_cutoff = cleaned.match(/[A-Z][a-z]+ \d{4}/)?.[0];
          }
        } else if (feature.includes("Comparative latency")) {
          m.latency = val;
        } else if (feature.includes("Extended thinking")) {
          // Values include qualified forms like "Yes (always on)".
          m.extended_thinking = /^yes\b/i.test(val);
        } else if (feature.includes("Adaptive thinking")) {
          m.adaptive_thinking = /^yes\b/i.test(val);
        } else if (feature.includes("AWS Bedrock ID")) {
          const clean = cleanIdCell(val);
          if (isIdLike(clean)) m.bedrock_id = clean;
        } else if (feature.includes("Vertex AI ID")) {
          const clean = cleanIdCell(val);
          if (isIdLike(clean)) m.vertex_id = clean;
        }
      }
    }

    models.push(...cols.filter((m) => m.id));
    i++;
  }

  return models;
}

// ── Parse pricing page ──

interface ModelPricing {
  input: number;
  output: number;
  cached_input: number;
  cache_write: number;
  cache_write_1h?: number;
}

function cleanPricingName(s: string): string {
  return s
    .replace(/\(?\[.*?\]\(.*?\)\)?/g, "")
    .replace(/\(deprecated\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parsePricingMarkdown(md: string): {
  pricing: Map<string, ModelPricing>;
  batch: Map<string, { batch_input: number; batch_output: number }>;
} {
  const pricing = new Map<string, ModelPricing>();
  const batch = new Map<
    string,
    { batch_input: number; batch_output: number }
  >();

  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith("| ") || !lines[i].includes("|")) {
      i++;
      continue;
    }

    const tableLines: string[] = [];
    while (i < lines.length && lines[i].startsWith("|")) {
      tableLines.push(lines[i]);
      i++;
    }

    const rows = parseMarkdownTable(tableLines);
    if (rows.length < 2) continue;

    const headers = rows[0].map((h) => h.toLowerCase());
    const headerStr = headers.join(" ");

    if (headerStr.includes("base input") && headerStr.includes("cache")) {
      // Model pricing: resolve columns by header, not by index, so upstream
      // column order changes don't silently shift values.
      const inputIdx = headers.findIndex((h) => h.includes("base input"));
      const cache5mIdx = headers.findIndex((h) =>
        /5\s*m(?:in)?\s*cache/.test(h),
      );
      const cache1hIdx = headers.findIndex((h) =>
        /1\s*h(?:our|r)?\s*cache/.test(h),
      );
      const hitsIdx = headers.findIndex((h) => h.includes("cache hit"));
      const outputIdx = headers.findIndex(
        (h) => h.includes("output") && !h.includes("batch"),
      );

      for (const row of rows.slice(1)) {
        const name = cleanPricingName(row[0] ?? "");
        const input = inputIdx >= 0 ? parseDollar(row[inputIdx]) : undefined;
        const output = outputIdx >= 0 ? parseDollar(row[outputIdx]) : undefined;
        const cacheWrite5m =
          cache5mIdx >= 0 ? parseDollar(row[cache5mIdx]) : undefined;
        const cacheWrite1h =
          cache1hIdx >= 0 ? parseDollar(row[cache1hIdx]) : undefined;
        const cachedInput =
          hitsIdx >= 0 ? parseDollar(row[hitsIdx]) : undefined;

        if (name && input != null && output != null) {
          const entry: ModelPricing = {
            input,
            output,
            cache_write: cacheWrite5m ?? input * 1.25,
            cached_input: cachedInput ?? input * 0.1,
          };
          if (cacheWrite1h != null) entry.cache_write_1h = cacheWrite1h;
          pricing.set(name, entry);
        }
      }
    } else if (
      headerStr.includes("batch input") &&
      headerStr.includes("batch output")
    ) {
      const batchInIdx = headers.findIndex((h) => h.includes("batch input"));
      const batchOutIdx = headers.findIndex((h) => h.includes("batch output"));

      for (const row of rows.slice(1)) {
        const name = cleanPricingName(row[0] ?? "");
        const batchIn =
          batchInIdx >= 0 ? parseDollar(row[batchInIdx]) : undefined;
        const batchOut =
          batchOutIdx >= 0 ? parseDollar(row[batchOutIdx]) : undefined;
        if (name && batchIn != null && batchOut != null) {
          batch.set(name, { batch_input: batchIn, batch_output: batchOut });
        }
      }
    }

    i++;
  }

  return { pricing, batch };
}

// ── Parse batch extended-output beta ──
//
// Upstream note (on the models overview page):
//   "On the Message Batches API, Opus 4.7, Opus 4.6, and Sonnet 4.6 support
//    up to 300k output tokens by using the `output-300k-...` beta header."
// Extract the model list + token count so we can surface it per model.

interface BatchExtendedOutput {
  models: string[];
  tokens: number;
}

function parseBatchExtendedOutput(md: string): BatchExtendedOutput | null {
  const phraseIdx = md.search(/support\s+up\s+to\s+\d+k\s+output\s+tokens/i);
  if (phraseIdx < 0) return null;

  const tail = md.slice(phraseIdx);
  const countMatch = tail.match(
    /support\s+up\s+to\s+(\d+)k\s+output\s+tokens/i,
  );
  if (!countMatch) return null;
  const tokens = Number(countMatch[1]) * 1000;

  // Grab a short window of text before the phrase to scrape the model list.
  const before = md.slice(Math.max(0, phraseIdx - 300), phraseIdx);
  const modelRegex =
    /(?:Claude\s+)?(?:Fable|Mythos|Opus|Sonnet|Haiku)\s+\d+(?:\.\d+)?/gi;
  const models = Array.from(before.matchAll(modelRegex), (m) =>
    /^claude\b/i.test(m[0]) ? m[0] : `Claude ${m[0]}`,
  );
  if (models.length === 0) return null;

  return { models, tokens };
}

// ── Parse fast mode pricing (Anthropic-specific premium tier) ──

interface FastModePricing {
  input: number;
  output: number;
}

/**
 * The fast-mode table carries model names per row; a single row can cover
 * several models ("Claude Opus 4.6 / Claude Opus 4.7"). Returns a map keyed
 * by display name.
 */
function parseFastModePricing(md: string): Map<string, FastModePricing> {
  const result = new Map<string, FastModePricing>();
  const hdrIdx = md.search(/###\s+Fast\s+mode\s+pricing/i);
  if (hdrIdx === -1) return result;

  // Slice to end of this H3 section
  const rest = md.slice(hdrIdx);
  const nextSection = rest.slice(3).search(/^###\s+/m);
  const section = nextSection >= 0 ? rest.slice(0, nextSection + 3) : rest;

  // Pull the first pipe-table in the section
  const lines = section.split("\n");
  let i = lines.findIndex((l) => l.startsWith("|"));
  if (i < 0) return result;
  const tableLines: string[] = [];
  while (i < lines.length && lines[i].startsWith("|")) {
    tableLines.push(lines[i]);
    i++;
  }
  const rows = parseMarkdownTable(tableLines);
  if (rows.length < 2) return result;

  const headers = rows[0].map((h) => h.toLowerCase());
  const modelIdx = headers.findIndex((h) => h.includes("model"));
  const inputIdx = headers.findIndex((h) => h.includes("input"));
  const outputIdx = headers.findIndex((h) => h.includes("output"));
  if (modelIdx < 0 || inputIdx < 0 || outputIdx < 0) return result;

  for (const row of rows.slice(1)) {
    const input = parseDollar(row[inputIdx] ?? "");
    const output = parseDollar(row[outputIdx] ?? "");
    if (input == null || output == null) continue;
    for (const part of (row[modelIdx] ?? "").split(/\s*\/\s*/)) {
      const name = cleanPricingName(part);
      if (name) result.set(name, { input, output });
    }
  }

  return result;
}

// ── Parse deprecations page ──

interface DeprecationInfo {
  status: "active" | "deprecated" | "legacy" | "retired";
  deprecation_date?: string;
  retirement_date?: string;
  successor?: string;
}

function parseDeprecationsMarkdown(md: string): Map<string, DeprecationInfo> {
  const result = new Map<string, DeprecationInfo>();
  const lines = md.split("\n");
  let i = 0;

  // 1. Parse the main model status table
  while (i < lines.length) {
    if (
      lines[i].startsWith("|") &&
      /api model name/i.test(lines[i]) &&
      /current state/i.test(lines[i])
    ) {
      break;
    }
    i++;
  }
  if (i < lines.length) {
    const tableLines: string[] = [];
    while (i < lines.length && lines[i].startsWith("|")) {
      tableLines.push(lines[i]);
      i++;
    }
    const rows = parseMarkdownTable(tableLines);
    for (const row of rows.slice(1)) {
      const id = row[0]?.replace(/`/g, "").trim();
      const state = row[1]?.toLowerCase().trim() as DeprecationInfo["status"];
      const depDate = row[2]?.trim();
      const retDate = row[3]?.trim();
      if (!id || !state) continue;
      result.set(id, {
        status: state,
        deprecation_date: /\d{4}/.test(depDate ?? "")
          ? normalizeDate(depDate!)
          : undefined,
        retirement_date: /\d{4}/.test(retDate ?? "")
          ? normalizeDate(retDate!.replace(/^Not sooner than\s*/i, ""))
          : undefined,
      });
    }
  }

  // 2. Parse deprecation history tables for successor mappings
  for (; i < lines.length; i++) {
    if (
      !lines[i].startsWith("|") ||
      !/deprecated model/i.test(lines[i]) ||
      !/replacement/i.test(lines[i])
    )
      continue;
    const tableLines: string[] = [];
    while (i < lines.length && lines[i].startsWith("|")) {
      tableLines.push(lines[i]);
      i++;
    }
    const rows = parseMarkdownTable(tableLines);
    for (const row of rows.slice(1)) {
      const depModel = row[1]?.replace(/`/g, "").trim();
      const replacement = row[2]?.replace(/`/g, "").trim();
      if (!depModel || !replacement) continue;
      const existing = result.get(depModel);
      if (existing) {
        existing.successor = replacement;
      } else {
        result.set(depModel, { status: "retired", successor: replacement });
      }
    }
  }

  return result;
}

// ── Name → ID mapping ──

const NAME_TO_ID: Record<string, string> = {
  "Claude Fable 5": "claude-fable-5",
  "Claude Mythos 5": "claude-mythos-5",
  "Claude Mythos Preview": "claude-mythos-preview",
  "Claude Opus 4.6": "claude-opus-4-6",
  "Claude Opus 4.5": "claude-opus-4-5",
  "Claude Opus 4.1": "claude-opus-4-1",
  "Claude Opus 4": "claude-opus-4-0",
  "Claude Opus 3": "claude-3-opus",
  "Claude Sonnet 4.6": "claude-sonnet-4-6",
  "Claude Sonnet 4.5": "claude-sonnet-4-5",
  "Claude Sonnet 4": "claude-sonnet-4-0",
  "Claude Sonnet 3.7": "claude-3-7-sonnet",
  "Claude Haiku 4.5": "claude-haiku-4-5",
  "Claude Haiku 3.5": "claude-3-5-haiku",
  "Claude Haiku 3": "claude-3-haiku",
};

function latencyToSpeed(latency: string | undefined): number | undefined {
  if (!latency) return undefined;
  const l = latency.toLowerCase();
  if (l.includes("fastest")) return 5;
  if (l.includes("fast")) return 4;
  if (l.includes("moderate")) return 3;
  return undefined;
}

/** Extract YYYY-MM-DD from a dated snapshot suffix (e.g. claude-opus-4-5-20251101). */
function dateFromSnapshotId(id: string): string | undefined {
  const m = id.match(/-(\d{4})(\d{2})(\d{2})$/);
  if (!m) return undefined;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Resolve a pricing-table display name to a model ID.
 * Falls back to the NAME_TO_ID table for 3.x (inverted) naming, then to a
 * deterministic rule for 4.x+ names so new releases don't need a mapping bump.
 */
function nameToId(name: string): string | undefined {
  if (NAME_TO_ID[name]) return NAME_TO_ID[name];
  // "Claude Opus 4.7" → "claude-opus-4-7", "Claude Fable 5" → "claude-fable-5"
  const m = name.match(
    /^Claude\s+(Fable|Mythos|Opus|Sonnet|Haiku)\s+(\d+)(?:\.(\d+))?$/i,
  );
  if (!m) return undefined;
  const family = m[1].toLowerCase();
  const major = m[2];
  // Only auto-derive for 4.x+ (3.x and older use inverted "claude-3-5-haiku" style,
  // which must stay in NAME_TO_ID).
  if (Number(major) < 4) return undefined;
  // Minor-less 5-gen names omit the minor in the ID (claude-fable-5, not
  // claude-fable-5-0); 4.x names always carry a minor in the pricing table.
  return m[3] != null
    ? `claude-${family}-${major}-${m[3]}`
    : `claude-${family}-${major}`;
}

// ── API fetch (optional, for release dates) ──

interface ApiModel {
  id: string;
  display_name: string;
  created_at: string;
}

async function fetchApiModels(apiKey: string): Promise<Map<string, ApiModel>> {
  const models = new Map<string, ApiModel>();
  let afterId: string | undefined;
  while (true) {
    const url = new URL(sources.api as string);
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = (await res.json()) as {
      data: ApiModel[];
      has_more: boolean;
      last_id?: string;
    };
    for (const m of data.data)
      if (m.id.startsWith("claude")) models.set(m.id, m);
    if (!data.has_more) break;
    afterId = data.last_id ?? data.data[data.data.length - 1]?.id;
  }
  return models;
}

// ── Main ──

async function main() {
  console.log("Fetching Anthropic models from docs (.md)...");

  const DEPRECATIONS_MD = sources.deprecations as string;

  const [modelsRes, pricingRes, deprecationsRes] = await Promise.allSettled([
    fetchCached(MODELS_MD, { scope: "anthropic", label: "models" }),
    fetchCached(PRICING_MD, { scope: "anthropic", label: "pricing" }),
    fetchCached(DEPRECATIONS_MD, { scope: "anthropic", label: "deprecations" }),
  ]);
  if (modelsRes.status !== "fulfilled")
    throw new Error(`Failed to fetch models page: ${modelsRes.reason}`);
  if (pricingRes.status !== "fulfilled")
    throw new Error(`Failed to fetch pricing page: ${pricingRes.reason}`);
  const modelsMd = modelsRes.value;
  const pricingMd = pricingRes.value;
  const deprecationsMd =
    deprecationsRes.status === "fulfilled" ? deprecationsRes.value : "";
  if (deprecationsRes.status !== "fulfilled") {
    console.warn(
      `Deprecations page fetch failed — continuing without: ${deprecationsRes.reason}`,
    );
  }

  const specs = parseModelsMarkdown(modelsMd);
  const { pricing, batch } = parsePricingMarkdown(pricingMd);
  const deprecations = parseDeprecationsMarkdown(deprecationsMd);
  const fastMode = parseFastModePricing(pricingMd);
  const batchExtended = parseBatchExtendedOutput(modelsMd);

  console.log(
    `Parsed: ${specs.length} models from docs, ${pricing.size} pricing, ${batch.size} batch, ${deprecations.size} deprecation entries`,
  );

  // Optional API for release dates
  const apiKey = envOrNull("ANTHROPIC_API_KEY");
  let apiModels = new Map<string, ApiModel>();
  if (apiKey) {
    console.log("Fetching from API...");
    apiModels = await fetchApiModels(apiKey);
    console.log(`Found ${apiModels.size} models from API`);
  }

  // Exact-match lookups. Both tables are keyed by cleaned display names
  // (via cleanPricingName), so a substring fallback would just risk cross-
  // matching versions (e.g. "Claude Opus 4" vs "Claude Opus 4.7"). If an
  // upstream label drifts, better to fail loudly than silently mispricing.
  const findPricing = (name: string) => pricing.get(name);
  const findBatch = (name: string) => batch.get(name);

  const seen = new Set<string>();
  let written = 0;

  function buildEntry(
    spec: ModelSpec,
    id: string,
    extra?: Partial<ModelEntry>,
  ): ModelEntry {
    const p =
      findPricing(spec.name) ??
      (spec.pricing_input != null
        ? {
            input: spec.pricing_input,
            output: spec.pricing_output ?? 0,
            cache_write: spec.pricing_input * 1.25,
            cached_input: spec.pricing_input * 0.1,
          }
        : undefined);
    const b = findBatch(spec.name);
    const apiModel = apiModels.get(id);

    // Thinking modes: collect each parsed mode into a single array so new
    // modes (e.g. "radical") can be added without new boolean fields.
    const thinkingModes: string[] = [];
    if (spec.extended_thinking) thinkingModes.push("extended");
    if (spec.adaptive_thinking) thinkingModes.push("adaptive");
    const hasThinking = thinkingModes.length > 0;

    const tools: string[] = ["function_calling"];
    if (hasThinking) tools.push("computer_use", "mcp");

    // Infer performance rating from model family
    const family = inferFamily(id);
    const FAMILY_PERF: Record<string, number> = {
      "claude-fable": 5,
      "claude-mythos": 5,
      "claude-opus": 5,
      "claude-sonnet": 4,
      "claude-haiku": 3,
    };
    const performance = family ? FAMILY_PERF[family] : undefined;

    // Anthropic-specific fields (provider extensions, not in ModelEntry schema)
    const anthropicFields: Record<string, unknown> = {};
    if (thinkingModes.length > 0)
      anthropicFields.thinking_modes = thinkingModes;
    if (spec.bedrock_id) anthropicFields.bedrock_id = spec.bedrock_id;
    if (spec.vertex_id) anthropicFields.vertex_id = spec.vertex_id;
    // Priority tier: all current models support it
    if (!spec.deprecated) anthropicFields.priority_tier = true;
    // Fast mode (beta premium pricing) — only on specific models
    const fm = fastMode.get(spec.name);
    if (fm) {
      anthropicFields.fast_mode_pricing = {
        input: fm.input,
        output: fm.output,
      };
    }

    // Deprecation info from deprecations page. The table is keyed by API model
    // name (usually the dated snapshot), so try the entry's own id, then the
    // spec's snapshot id (covers aliases like claude-sonnet-4-0 whose snapshot
    // is claude-sonnet-4-20250514), then snapshot entries prefixed by this id.
    const dep =
      deprecations.get(id) ??
      deprecations.get(spec.id) ??
      [...deprecations.entries()].find(
        ([k]) => k.startsWith(`${id}-`) && /\d{8}$/.test(k),
      )?.[1];
    const status =
      dep?.status === "retired" || dep?.status === "deprecated"
        ? "deprecated"
        : spec.deprecated
          ? "deprecated"
          : "active";

    const entry: ModelEntry = {
      id,
      name: spec.name,
      family,
      description: spec.description,
      license: "proprietary",
      page_url: `https://docs.anthropic.com/en/docs/about-claude/models#${id}`,
      status,
      deprecation_date: dep?.deprecation_date,
      retirement_date: dep?.retirement_date,
      successor: dep?.successor,
      context_window: spec.context_window,
      max_output_tokens: spec.max_output_tokens,
      batch_max_output_tokens: batchExtended?.models.includes(spec.name)
        ? batchExtended.tokens
        : undefined,
      knowledge_cutoff: spec.knowledge_cutoff,
      training_data_cutoff: spec.training_data_cutoff
        ? normalizeDate(spec.training_data_cutoff)
        : undefined,
      speed: latencyToSpeed(spec.latency),
      performance,
      reasoning: hasThinking ? performance : undefined,
      modalities: { input: ["text", "image"], output: ["text"] },
      capabilities: {
        streaming: true,
        vision: true,
        tool_call: true,
        ...(!spec.deprecated ? { batch: true } : {}),
        ...(hasThinking
          ? { reasoning: true, structured_output: true, json_mode: true }
          : {}),
      },
      tools,
      endpoints: ["messages"],
      ...anthropicFields,
      ...extra,
    } as ModelEntry;

    if (p) {
      entry.pricing = {
        input: p.input,
        output: p.output,
        cache_write: p.cache_write,
        cached_input: p.cached_input,
        ...(p.cache_write_1h != null
          ? { cache_write_1h: p.cache_write_1h }
          : {}),
        ...(b
          ? { batch_input: b.batch_input, batch_output: b.batch_output }
          : {}),
      };
    }

    if (apiModel?.created_at) {
      entry.release_date = apiModel.created_at.split("T")[0];
    } else {
      // Fallback: snapshot IDs encode their release date as YYYYMMDD suffix.
      const fromId = dateFromSnapshotId(id);
      if (fromId) entry.release_date = fromId;
    }

    return entry;
  }

  for (const spec of specs) {
    const snapshotId = spec.id; // e.g. claude-opus-4-6-20260101
    const aliasId = spec.alias; // e.g. claude-opus-4-6
    const hasAlias = aliasId && aliasId !== snapshotId;

    // 1. Write alias model (with snapshots list)
    if (aliasId && !seen.has(aliasId)) {
      seen.add(aliasId);
      const entry = buildEntry(spec, aliasId, {
        snapshots: hasAlias ? [snapshotId] : undefined,
      });
      if (upsertModel("anthropic", entry)) written++;
    } else if (aliasId && hasAlias) {
      // Alias already written — append this snapshot to its snapshots list
      // (handled by upsert merge on array field)
    }

    // 2. Write snapshot model (with alias back-reference)
    if (hasAlias && !seen.has(snapshotId)) {
      seen.add(snapshotId);
      const entry = buildEntry(spec, snapshotId, {
        alias: aliasId,
      });
      if (upsertModel("anthropic", entry)) written++;
    }

    // 3. Models without alias/snapshot distinction (id === alias or no alias)
    if (!hasAlias && !seen.has(snapshotId)) {
      seen.add(snapshotId);
      const entry = buildEntry(spec, snapshotId);
      if (upsertModel("anthropic", entry)) written++;
    }
  }

  // Pricing-only models not in overview
  for (const [name, p] of pricing) {
    const id = nameToId(name);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const b = findBatch(name);
    const apiModel = apiModels.get(id);
    const dep =
      deprecations.get(id) ??
      [...deprecations.entries()].find(
        ([k]) => k.startsWith(`${id}-`) && /\d{8}$/.test(k),
      )?.[1];
    const isDeprecated =
      dep?.status === "retired" || dep?.status === "deprecated";
    const entry: ModelEntry = {
      id,
      name,
      family: inferFamily(id),
      license: "proprietary",
      page_url: `https://docs.anthropic.com/en/docs/about-claude/models#${id}`,
      status: isDeprecated ? "deprecated" : undefined,
      deprecation_date: dep?.deprecation_date,
      retirement_date: dep?.retirement_date,
      successor: dep?.successor,
      modalities: { input: ["text", "image"], output: ["text"] },
      capabilities: {
        streaming: true,
        vision: true,
        tool_call: true,
        ...(!isDeprecated ? { batch: true } : {}),
      },
      tools: ["function_calling"],
      endpoints: ["messages"],
      pricing: {
        input: p.input,
        output: p.output,
        cache_write: p.cache_write,
        cached_input: p.cached_input,
        ...(p.cache_write_1h != null
          ? { cache_write_1h: p.cache_write_1h }
          : {}),
        ...(b
          ? { batch_input: b.batch_input, batch_output: b.batch_output }
          : {}),
      },
    };
    if (apiModel?.created_at) {
      entry.release_date = apiModel.created_at.split("T")[0];
    } else {
      const fromId = dateFromSnapshotId(id);
      if (fromId) entry.release_date = fromId;
    }
    if (upsertModel("anthropic", entry)) written++;
  }

  // One-time migration: drop legacy boolean thinking fields now that
  // thinking_modes supersedes them. Idempotent — safe to keep running.
  const LEGACY_FIELDS = ["extended_thinking", "adaptive_thinking"] as const;
  const modelDir = path.join(PROVIDERS_DIR, "anthropic", "models");
  for (const file of fs.readdirSync(modelDir)) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(modelDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<
      string,
      unknown
    >;
    const gen = data._generated as Record<string, string> | undefined;
    let changed = false;
    for (const key of LEGACY_FIELDS) {
      if (key in data) {
        delete data[key];
        changed = true;
      }
      if (gen && key in gen) {
        delete gen[key];
        changed = true;
      }
    }
    if (changed) {
      fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
      console.log(`  cleaned legacy fields from ${file}`);
    }
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
