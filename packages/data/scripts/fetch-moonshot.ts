import { fetchJson, fetchText } from "./parse.ts";
import {
  assertParsed,
  envOrNull,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Moonshot AI (Kimi) models.
 *
 * Data sources:
 * 1. Public pricing docs — the catalog, prices and context windows
 * 2. /v1/models API (optional, requires MOONSHOT_API_KEY) — release dates
 * 3. MODEL_SPECS below — capabilities and modalities the tables do not carry
 *
 * Source history: this script had no live catalog at all. The API needs a key,
 * which CI deliberately never has, so every run fell back to a hardcoded list
 * and the catalog froze at kimi-k2.5 while k2.6, k2.7-code and k3 shipped. The
 * note that pricing "renders tables via JavaScript and cannot be scraped" was
 * true of the HTML page only: the `.md` variant serves the DocTable source.
 *
 * A hardcoded list is invisible to every guard: it parses cleanly, writes a
 * stable count and reports zero delisted models forever.
 */

const sources = readSources("moonshot");
const API_URL = sources.api as string;
const PRICING_INDEX = sources.pricing_index as string;

// ── Docs-verified model specs ──
// These come from platform.moonshot.ai docs pages (intro, quickstart guides).
// max_output_tokens: 32768 documented for kimi-k2.5 and kimi-k2 models.

const MODELS: ModelEntry[] = [
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    family: "kimi",
    license: "mit",
    description:
      "Kimi's most intelligent model with native multimodal support, thinking/non-thinking modes.",
    context_window: 256000,
    max_output_tokens: 32768,
    capabilities: {
      streaming: true,
      vision: true,
      tool_call: true,
      reasoning: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: "kimi-k2-0905-preview",
    name: "Kimi K2 (0905)",
    family: "kimi",
    license: "mit",
    description:
      "Enhanced agentic coding, front-end aesthetics, context understanding.",
    context_window: 256000,
    max_output_tokens: 32768,
    parameters: 1000,
    active_parameters: 32,
    architecture: "MoE",
    capabilities: { streaming: true, tool_call: true },
  },
  {
    id: "kimi-k2-0711-preview",
    name: "Kimi K2 (0711)",
    family: "kimi",
    license: "mit",
    description:
      "MoE model with 1T total parameters and 32B active. Strong at code and agent tasks.",
    context_window: 128000,
    max_output_tokens: 32768,
    parameters: 1000,
    active_parameters: 32,
    architecture: "MoE",
    capabilities: { streaming: true, tool_call: true },
  },
  {
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    family: "kimi",
    license: "mit",
    description:
      "Long-term thinking, multi-step tool usage, complex problem solving.",
    context_window: 256000,
    max_output_tokens: 32768,
    reasoning_tokens: true,
    capabilities: { streaming: true, tool_call: true, reasoning: true },
  },
  {
    id: "kimi-k2-turbo-preview",
    name: "Kimi K2 Turbo",
    family: "kimi",
    license: "mit",
    description: "High-speed version, 60-100 tokens/sec output.",
    context_window: 256000,
    max_output_tokens: 32768,
    capabilities: { streaming: true, tool_call: true },
    speed: 5,
  },
  {
    id: "kimi-k2-thinking-turbo",
    name: "Kimi K2 Thinking Turbo",
    family: "kimi",
    license: "mit",
    description: "Deep reasoning with high speed output.",
    context_window: 256000,
    max_output_tokens: 32768,
    reasoning_tokens: true,
    capabilities: { streaming: true, tool_call: true, reasoning: true },
    speed: 5,
  },
  {
    id: "moonshot-v1-128k",
    name: "Moonshot v1 128K",
    family: "moonshot",
    license: "proprietary",
    context_window: 128000,
    capabilities: { streaming: true },
  },
  {
    id: "moonshot-v1-32k",
    name: "Moonshot v1 32K",
    family: "moonshot",
    license: "proprietary",
    context_window: 32000,
    capabilities: { streaming: true },
  },
  {
    id: "moonshot-v1-8k",
    name: "Moonshot v1 8K",
    family: "moonshot",
    license: "proprietary",
    context_window: 8000,
    capabilities: { streaming: true },
  },
  {
    id: "moonshot-v1-8k-vision-preview",
    name: "Moonshot v1 8K Vision",
    family: "moonshot",
    license: "proprietary",
    context_window: 8000,
    capabilities: { streaming: true, vision: true },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: "moonshot-v1-32k-vision-preview",
    name: "Moonshot v1 32K Vision",
    family: "moonshot",
    license: "proprietary",
    context_window: 32000,
    capabilities: { streaming: true, vision: true },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: "moonshot-v1-128k-vision-preview",
    name: "Moonshot v1 128K Vision",
    family: "moonshot",
    license: "proprietary",
    context_window: 128000,
    capabilities: { streaming: true, vision: true },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
];

// Capabilities and modalities the pricing tables do not carry. Enrichment
// only: a model absent from here is still written from what the docs say.
const specsById = new Map(MODELS.map((m) => [m.id, m]));

// ── Pricing docs ──

interface DocsModel {
  id: string;
  input?: number;
  output?: number;
  cached_input?: number;
  cache_write?: number;
  cache_write_1h?: number;
  context_window?: number;
}

/** "$3.00" wrapped in JSX (`<>{"$"}3.00</>`) or plain; "1,048,576 tokens". */
function cellNumber(cell: string): number | undefined {
  const n = Number(cell.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && cell.match(/\d/) ? n : undefined;
}

/**
 * Split one `[...]` row into cells, respecting nested JSX braces and quotes.
 * Quote tracking is load-bearing: context windows are written "1,048,576
 * tokens", and splitting inside the quotes turned that cell into "1.
 */
function splitRow(row: string): string[] {
  const cells: string[] = [];
  let depth = 0;
  let inQuote = false;
  let start = 0;
  for (let i = 0; i < row.length; i++) {
    const c = row[i];
    if (c === '"' && row[i - 1] !== "\\") inQuote = !inQuote;
    else if (inQuote) continue;
    else if (c === "<" || c === "{" || c === "[") depth++;
    else if (c === ">" || c === "}" || c === "]") depth--;
    else if (c === "," && depth === 0) {
      cells.push(row.slice(start, i));
      start = i + 1;
    }
  }
  cells.push(row.slice(start));
  return cells.map((c) => c.trim().replace(/^"|"$/g, ""));
}

/**
 * Parse the `<DocTable columns={[...]} rows={[...]}/>` blocks on a pricing page.
 *
 * Column count varies by family: the v1 series has a single input price where
 * k2.6 and newer split cache hit from cache miss, so cells are located by
 * column title rather than by position.
 */
function parsePricingPage(md: string): DocsModel[] {
  const out: DocsModel[] = [];
  for (const table of md.matchAll(
    /columns=\{\[([\s\S]*?)\]\}\s*rows=\{\[([\s\S]*?)\]\}\s*\/>/g,
  )) {
    const titles = [...table[1].matchAll(/title:\s*"([^"]+)"/g)].map((m) =>
      m[1].trim().replace(/\s+/g, " ").toLowerCase(),
    );
    const col = (test: (t: string) => boolean) => titles.findIndex(test);
    const iId = col((t) => t === "model");
    const iCtx = col((t) => t.includes("context"));
    const iOut = col((t) => t.startsWith("output"));
    const iMiss = col((t) => t.includes("cache miss"));
    const iHit = col((t) => t.includes("cache hit") || t.startsWith("cached"));
    // No split means the single input column is the headline rate.
    const iIn = iMiss >= 0 ? iMiss : col((t) => t.startsWith("input"));
    const iCacheWrite = col(
      (t) => t.startsWith("cache write") && !/\b1h\b/.test(t),
    );
    const iCacheWrite1h = col(
      (t) => t.startsWith("cache write") && /\b1h\b/.test(t),
    );
    if (iId < 0) continue;

    for (const row of table[2].matchAll(/\[([\s\S]*?)\],?\s*(?=\[|$)/g)) {
      const cells = splitRow(row[1]);
      const id = cells[iId];
      if (!id || !/^[a-z]/.test(id)) continue;
      out.push({
        id,
        input: iIn >= 0 ? cellNumber(cells[iIn] ?? "") : undefined,
        output: iOut >= 0 ? cellNumber(cells[iOut] ?? "") : undefined,
        cached_input: iHit >= 0 ? cellNumber(cells[iHit] ?? "") : undefined,
        cache_write:
          iCacheWrite >= 0 ? cellNumber(cells[iCacheWrite] ?? "") : undefined,
        cache_write_1h:
          iCacheWrite1h >= 0
            ? cellNumber(cells[iCacheWrite1h] ?? "")
            : undefined,
        context_window: iCtx >= 0 ? cellNumber(cells[iCtx] ?? "") : undefined,
      });
    }
  }
  return out;
}

// ── API types ──

interface ApiModel {
  id: string;
  object: string;
  created?: number;
  owned_by?: string;
}

// ── Main ──

async function main() {
  console.log("Fetching Moonshot AI models...");

  // 1. Public pricing docs are the catalog.
  const pricingMd = await fetchText(PRICING_INDEX);
  const docsModels = new Map(
    parsePricingPage(pricingMd).map((model) => [model.id, model]),
  );
  console.log(`Parsed ${docsModels.size} models from pricing docs`);
  assertParsed(docsModels.size, "moonshot");

  // 2. Optional: the API adds release dates but needs a key.
  const apiKey = envOrNull("MOONSHOT_API_KEY");
  const apiModels = new Map<string, ApiModel>();
  if (apiKey && API_URL) {
    try {
      const json = await fetchJson<{ data: ApiModel[] }>(API_URL, {
        Authorization: `Bearer ${apiKey}`,
      });
      for (const m of json.data) apiModels.set(m.id, m);
      console.log(`Found ${apiModels.size} models from API`);
    } catch (err) {
      console.warn("Could not fetch models API:", err);
    }
  }

  let written = 0;

  for (const [id, doc] of docsModels) {
    const specs = specsById.get(id);
    const apiModel = apiModels.get(id);

    const entry: ModelEntry = {
      ...(specs ?? {}),
      id,
      name: specs?.name ?? id,
      family: specs?.family ?? "kimi",
      created_by: "moonshot",
      license: specs?.license ?? "proprietary",
      status: "active",
      // The docs table is authoritative over the enrichment table.
      context_window: doc.context_window ?? specs?.context_window,
      page_url: "https://platform.moonshot.ai/docs/pricing/chat",
    };

    if (doc.input != null || doc.output != null) {
      entry.pricing = {
        ...(doc.input != null ? { input: doc.input } : {}),
        ...(doc.output != null ? { output: doc.output } : {}),
        ...(doc.cached_input != null ? { cached_input: doc.cached_input } : {}),
        ...(doc.cache_write != null ? { cache_write: doc.cache_write } : {}),
        ...(doc.cache_write_1h != null
          ? { cache_write_1h: doc.cache_write_1h }
          : {}),
      };
    }

    if (apiModel?.created) {
      entry.release_date = new Date(apiModel.created * 1000)
        .toISOString()
        .split("T")[0];
    }

    written += upsertWithSnapshot("moonshot", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
