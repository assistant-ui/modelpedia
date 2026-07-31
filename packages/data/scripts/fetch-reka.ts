import { fetchJson } from "./parse.ts";
import {
  assertParsed,
  envOrNull,
  type ModelEntry,
  parseMarkdownTable,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Reka AI models.
 *
 * The /v1/models endpoint requires REKA_API_KEY (returns {} unauthenticated),
 * so the catalog and prices come from the public pricing markdown and the API
 * only adds release dates when a key happens to be present.
 *
 * Source history: with no key this script wrote a hardcoded list and nothing
 * else, which is the failure that froze moonshot at kimi-k2.5 while k3 shipped.
 * A hardcoded list is invisible to every guard: it parses cleanly, writes a
 * stable count and reports zero delisted models forever. HARDCODED below is now
 * enrichment for the specs the pricing tables do not carry.
 */

const sources = readSources("reka");
const API_URL = sources.models as string;
const PRICING_MD = sources.pricing_md as string;

interface DocsModel {
  id: string;
  input?: number;
  output?: number;
}

/** "**Reka Flash**" or "<b>Reka Edge</b>" plus prose → `reka-flash`. */
function cellToId(cell: string): string | undefined {
  const bold = cell.match(/<b>([^<]+)<\/b>|\*\*([^*]+)\*\*/);
  const label = (bold?.[1] ?? bold?.[2] ?? "").trim();
  if (!label) return undefined;
  const slug = label.toLowerCase().replace(/\s+/g, "-");
  return /^reka-/.test(slug) ? slug : undefined;
}

function parseUsd(cell: string): number | undefined {
  const m = cell.match(/\$\s*([\d.]+)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Parse the per-1M token table. Other tables on the page price per request or
 * per minute, so only the one whose headers name token columns is taken.
 */
function parsePricing(md: string): DocsModel[] {
  const out: DocsModel[] = [];
  const rows = parseMarkdownTable(md.split("\n"));
  if (rows.length === 0) return out;

  let iIn = -1;
  let iOut = -1;
  for (const cells of rows) {
    const head = cells.map((c) => c.replace(/<[^>]+>/g, " ").toLowerCase());
    const maybeIn = head.findIndex(
      (h) => h.includes("input") && h.includes("token"),
    );
    const maybeOut = head.findIndex(
      (h) => h.includes("output") && h.includes("token"),
    );
    if (maybeIn >= 0 && maybeOut >= 0) {
      iIn = maybeIn;
      iOut = maybeOut;
      continue;
    }
    if (iIn < 0) continue;

    const id = cellToId(cells[0] ?? "");
    if (!id) continue;
    out.push({
      id,
      input: parseUsd(cells[iIn] ?? ""),
      output: parseUsd(cells[iOut] ?? ""),
    });
  }
  return out;
}

interface ApiModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

const HARDCODED: ModelEntry[] = [
  {
    id: "reka-core",
    name: "Reka Core",
    family: "reka-core",
    description:
      "Frontier-class multimodal model handling text, image, audio, and video for complex reasoning tasks.",
    tagline: "Reka's frontier multimodal model.",
    status: "active",
    model_type: "chat",
    context_window: 128000,
    license: "proprietary",
    open_weight: false,
    capabilities: {
      vision: true,
      tool_call: true,
      structured_output: true,
      json_mode: true,
      streaming: true,
    },
    modalities: {
      input: ["text", "image", "audio", "video"],
      output: ["text"],
    },
    tools: ["function_calling"],
    endpoints: ["chat_completions"],
    pricing: { input: 2, output: 6 },
  },
  {
    id: "reka-flash",
    name: "Reka Flash",
    family: "reka-flash",
    description:
      "Cost-efficient multimodal vision-language model for everyday chat, coding, and instruction-following.",
    tagline: "Reliable and cost-efficient multimodal LLM.",
    status: "active",
    model_type: "chat",
    context_window: 128000,
    license: "proprietary",
    open_weight: false,
    capabilities: {
      vision: true,
      tool_call: true,
      structured_output: true,
      json_mode: true,
      streaming: true,
    },
    modalities: { input: ["text", "image", "video"], output: ["text"] },
    tools: ["function_calling"],
    endpoints: ["chat_completions"],
    pricing: { input: 0.8, output: 2 },
  },
  {
    id: "reka-flash-3",
    name: "Reka Flash 3",
    family: "reka-flash",
    description:
      "21B-parameter general-purpose reasoning LLM with explicit reasoning tags and budget-forcing controls.",
    tagline: "Open-weight 21B reasoning model.",
    status: "active",
    model_type: "reasoning",
    context_window: 32000,
    release_date: "2025-03-10",
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
    modalities: { input: ["text"], output: ["text"] },
    tools: ["function_calling"],
    endpoints: ["chat_completions"],
    pricing: { input: 0.2, output: 0.8 },
  },
  {
    id: "reka-edge",
    name: "Reka Edge",
    family: "reka-edge",
    description:
      "7B multimodal vision-language model optimized for edge deployments, robotics, and real-time visual reasoning.",
    tagline: "Frontier-level edge VLM for physical AI.",
    status: "active",
    model_type: "chat",
    context_window: 16384,
    max_output_tokens: 16384,
    release_date: "2026-03-20",
    license: "proprietary",
    open_weight: false,
    capabilities: { vision: true, tool_call: true, streaming: true },
    modalities: { input: ["text", "image", "video"], output: ["text"] },
    tools: ["function_calling"],
    endpoints: ["chat_completions"],
    pricing: { input: 0.1, output: 0.1 },
  },
  {
    id: "reka-spark",
    name: "Reka Spark",
    family: "reka-spark",
    description:
      "Ultra-compact 1B model for embedding AI into the smallest devices.",
    tagline: "Tiny on-device multimodal model.",
    status: "active",
    model_type: "chat",
    license: "proprietary",
    open_weight: false,
    capabilities: { vision: true, streaming: true },
    modalities: { input: ["text", "image"], output: ["text"] },
    endpoints: ["chat_completions"],
    pricing: { input: 0.05, output: 0.05 },
  },
  {
    id: "reka-flash-research",
    name: "Reka Flash Research",
    family: "reka-research",
    description:
      "Research-tier endpoint with parallel-thinking modes for deep web-grounded answers.",
    tagline: "Web-grounded research model.",
    status: "active",
    model_type: "reasoning",
    license: "proprietary",
    open_weight: false,
    capabilities: { reasoning: true, streaming: true },
    modalities: { input: ["text"], output: ["text"] },
    endpoints: ["chat_completions"],
    pricing_notes: [
      "$25/1k requests standard; $35/1k parallel-thinking low; $60/1k parallel-thinking high.",
    ],
  },
];

async function main() {
  console.log("Fetching Reka AI models...");

  const apiKey = envOrNull("REKA_API_KEY");
  const apiModels = new Map<string, ApiModel>();

  if (apiKey && API_URL) {
    try {
      const json = await fetchJson<{ data?: ApiModel[]; models?: ApiModel[] }>(
        API_URL,
        { Authorization: `Bearer ${apiKey}` },
      );
      const list = json.data ?? json.models ?? [];
      for (const m of list) apiModels.set(m.id, m);
      console.log(`Found ${apiModels.size} models from API`);
    } catch (err) {
      console.warn("Could not fetch /v1/models:", err);
    }
  }

  const pricingMd = await fetch(PRICING_MD).then((r) => r.text());
  const docsModels = parsePricing(pricingMd);
  console.log(`Parsed ${docsModels.length} models from pricing docs`);
  assertParsed(docsModels.length, "reka");
  const pricingById = new Map(docsModels.map((m) => [m.id, m]));

  let written = 0;
  const seen = new Set<string>();

  // Everything the docs price, plus the hardcoded specs for anything the
  // tables list without covering (open-weight releases carry no rate).
  const ids = new Set([...pricingById.keys(), ...HARDCODED.map((m) => m.id)]);
  const specsById = new Map(HARDCODED.map((m) => [m.id, m]));

  for (const id of ids) {
    const entry = specsById.get(id) ?? { id, name: id };
    const apiModel = apiModels.get(entry.id);
    const enriched: ModelEntry = { ...entry };
    const priced = pricingById.get(id);
    if (priced && (priced.input != null || priced.output != null)) {
      enriched.pricing = {
        ...(priced.input != null ? { input: priced.input } : {}),
        ...(priced.output != null ? { output: priced.output } : {}),
      };
    }
    if (apiModel?.created && !enriched.release_date) {
      enriched.release_date = new Date(apiModel.created * 1000)
        .toISOString()
        .split("T")[0];
    }
    if (upsertModel("reka", enriched)) written++;
    seen.add(entry.id);
  }

  for (const [id, m] of apiModels) {
    if (seen.has(id)) continue;
    const entry: ModelEntry = {
      id,
      name: id,
      modalities: { input: ["text"], output: ["text"] },
      capabilities: { streaming: true },
    };
    if (m.created) {
      entry.release_date = new Date(m.created * 1000)
        .toISOString()
        .split("T")[0];
    }
    if (upsertModel("reka", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
