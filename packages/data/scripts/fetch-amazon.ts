import { fetchText } from "./parse.ts";
import {
  assertParsed,
  filterModalities,
  firstSentence,
  inferFamily,
  inferModelType,
  type ModelEntry,
  normalizeDate,
  readSources,
  runGenerate,
  sanitizeModelId,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Amazon Bedrock models from AWS docs. No API key needed.
 *
 * In 2026 AWS replaced the single models-supported.html table with a two-level
 * layout: model-cards.md is an index (Logo | Provider | Supported models) that
 * links each model to a per-model card (model-card-<slug>.md). Each card holds
 * the canonical Bedrock model id, launch date, context window, max output, and
 * a modality table. We crawl the index, then parse each card.
 */

const sources = readSources("amazon");
const INDEX_URL = sources.docs as string;
const BASE = INDEX_URL.replace(/[^/]+$/, "");

const PROVIDER_MAP: Record<string, string> = {
  "ai21 labs": "ai21",
  amazon: "amazon",
  anthropic: "anthropic",
  cohere: "cohere",
  deepseek: "deepseek",
  google: "google",
  "luma ai": "luma",
  meta: "meta",
  minimax: "minimax",
  "mistral ai": "mistral",
  "moonshot ai": "moonshot",
  nvidia: "nvidia",
  openai: "openai",
  qwen: "qwen",
  "stability ai": "stability",
  twelvelabs: "twelvelabs",
  writer: "writer",
  "z.ai": "zhipu",
};

const MODALITY_MAP: Record<string, string> = {
  text: "text",
  image: "image",
  video: "video",
  audio: "audio",
  speech: "audio",
};

async function fetchWithRetry(url: string, attempts = 3): Promise<string> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fetchText(url);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/** Group consecutive `|`-prefixed lines into tables of cell rows. */
function mdTables(md: string): string[][][] {
  const tables: string[][][] = [];
  let cur: string[][] = [];
  for (const line of md.split("\n")) {
    if (line.trim().startsWith("|")) {
      if (/^[\s:|-]+$/.test(line.replace(/\|/g, ""))) continue; // separator
      cur.push(
        line
          .split("|")
          .slice(1, -1)
          .map((c) => c.trim()),
      );
    } else if (cur.length) {
      tables.push(cur);
      cur = [];
    }
  }
  if (cur.length) tables.push(cur);
  return tables;
}

function bullet(md: string, label: string): string | undefined {
  return md
    .match(new RegExp(`\\*\\*${label}:\\*\\*\\s*([^\\n+|]+)`, "i"))?.[1]
    ?.trim();
}

interface IndexEntry {
  provider: string;
  name: string;
  slug: string;
}

function parseIndex(md: string): IndexEntry[] {
  const entries: IndexEntry[] = [];
  for (const table of mdTables(md)) {
    const hdr = table[0].map((h) => h.toLowerCase());
    const pIdx = hdr.indexOf("provider");
    const mIdx = hdr.indexOf("supported models");
    if (pIdx < 0 || mIdx < 0) continue;
    for (const row of table.slice(1)) {
      const provider = row[pIdx]?.match(/\[([^\]]+)\]/)?.[1] ?? "";
      for (const link of (row[mIdx] ?? "").matchAll(
        /\[([^\]]+)\]\((model-card-[a-z0-9.-]+)\.md\)/g,
      )) {
        entries.push({ provider, name: link[1], slug: link[2] });
      }
    }
  }
  return entries;
}

interface CardData {
  id?: string;
  description?: string;
  release_date?: string;
  context_window?: number;
  max_output_tokens?: number;
  reasoning?: boolean;
  input: string[];
  output: string[];
}

function parseTokenish(s: string | undefined): number | undefined {
  if (!s) return undefined;
  const m = s.replace(/,/g, "").match(/([\d.]+)\s*([KkMm])?/);
  if (!m) return undefined;
  let n = Number(m[1]);
  if (/k/i.test(m[2] ?? "")) n *= 1000;
  else if (/m/i.test(m[2] ?? "")) n *= 1_000_000;
  return n > 0 ? n : undefined;
}

function parseCard(md: string): CardData {
  const tables = mdTables(md);
  let id: string | undefined;
  const input: string[] = [];
  const output: string[] = [];

  for (const table of tables) {
    const hdr = table[0].map((h) => h.toLowerCase().replace(/\*/g, "").trim());
    if (hdr[0]?.includes("input modalities")) {
      for (const row of table.slice(1)) {
        const inCell = row[0] ?? "";
        const outCell = row[1] ?? "";
        const inName = inCell
          .replace(/!\[.*?\]\(.*?\)/g, "")
          .trim()
          .toLowerCase();
        const outName = outCell
          .replace(/!\[.*?\]\(.*?\)/g, "")
          .trim()
          .toLowerCase();
        if (inCell.includes("icon-yes") && MODALITY_MAP[inName])
          input.push(MODALITY_MAP[inName]);
        if (outCell.includes("icon-yes") && MODALITY_MAP[outName])
          output.push(MODALITY_MAP[outName]);
      }
    }
    const idIdx = hdr.indexOf("model id");
    if (idIdx >= 0 && !id) {
      for (const row of table.slice(1)) {
        const v = row[idIdx];
        if (v?.includes(".") && !v.startsWith("!")) {
          id = v.trim();
          break;
        }
      }
    }
  }

  // Description: first prose paragraph (before the first bullet/table).
  const descMatch = md.match(/^#\s+.+?\n+([A-Z][^\n]{20,})/s);

  return {
    id,
    description: descMatch ? firstSentence(descMatch[1].trim()) : undefined,
    release_date: normalizeDate(bullet(md, "Model launch date")) ?? undefined,
    context_window: parseTokenish(bullet(md, "Context window")),
    max_output_tokens: parseTokenish(bullet(md, "Max output tokens")),
    reasoning: /\*\*Reasoning:\*\*\s*Supported/i.test(md) || undefined,
    input,
    output,
  };
}

async function main() {
  console.log("Fetching Amazon Bedrock models from docs...");

  const indexMd = await fetchWithRetry(INDEX_URL);
  const index = parseIndex(indexMd);
  console.log(`Index: ${index.length} model cards`);
  assertParsed(index.length, "amazon (index)");

  let written = 0;
  let parsed = 0;
  for (let i = 0; i < index.length; i += 8) {
    const batch = index.slice(i, i + 8);
    const results = await Promise.all(
      batch.map(async (entry) => {
        try {
          const md = await fetchWithRetry(`${BASE}${entry.slug}.md`);
          return { entry, card: parseCard(md) };
        } catch {
          console.warn(`Could not fetch ${entry.slug}`);
          return null;
        }
      }),
    );

    for (const r of results) {
      if (!r) continue;
      const { entry, card } = r;
      const id = card.id ?? sanitizeModelId(entry.name);
      if (!card.id)
        console.warn(`No model id in card ${entry.slug}, using name`);
      parsed++;

      const mods = filterModalities(
        card.input.length ? card.input : ["text"],
        card.output.length ? card.output : ["text"],
      );
      const modelType = inferModelType(id);

      const capabilities: Record<string, boolean> = {};
      if (modelType === "chat" || modelType === "reasoning") {
        capabilities.streaming = true;
      }
      if (card.input.includes("image")) capabilities.vision = true;
      if (card.reasoning) capabilities.reasoning = true;

      const provider =
        PROVIDER_MAP[entry.provider.toLowerCase()] ??
        entry.provider.toLowerCase();
      const modelEntry: ModelEntry = {
        id,
        name: entry.name,
        created_by: provider,
        family: inferFamily(sanitizeModelId(id)),
        description: card.description,
        release_date: card.release_date,
        context_window: card.context_window,
        max_output_tokens: card.max_output_tokens,
        modalities: mods,
        page_url: `${BASE}${entry.slug}`,
      };
      if (modelType)
        modelEntry.model_type = modelType as ModelEntry["model_type"];
      if (Object.keys(capabilities).length)
        modelEntry.capabilities = capabilities;
      if (card.reasoning) modelEntry.reasoning_tokens = true;

      written += upsertWithSnapshot("amazon", modelEntry);
    }
  }

  assertParsed(parsed, "amazon (cards)");
  console.log(`Parsed ${parsed} cards, wrote ${written}`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
