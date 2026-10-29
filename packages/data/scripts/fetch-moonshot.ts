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
 * 1. Public model list — the active catalog
 * 2. Public pricing docs — prices and context windows
 * 3. /v1/models API (optional, requires MOONSHOT_API_KEY) — release dates
 * 4. MODELS below — capabilities and modalities the tables do not carry
 */

const sources = readSources("moonshot");
const API_URL = sources.api as string;
const PRICING_INDEX = sources.pricing_index as string;
const PRICING_PAGE = sources.pricing as string;
const MODEL_LIST = new URL("/docs/models.md", PRICING_PAGE).href;

// ── Docs-verified model specs ──
// These come from platform.kimi.ai docs pages (intro, quickstart guides).
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

function parseModelList(md: string): string[] {
  const active = md.split(/^## Deprecated Models/m)[0];
  return [...active.matchAll(/^\| `([a-z][a-z0-9.-]+)` \|/gm)].map(
    (match) => match[1],
  );
}

function parsePricingPage(html: string, md: string): DocsModel[] {
  const context = new Map<string, number>();
  for (const match of md.matchAll(
    /All (K\d+) series models support a ([\d,]+)-token context window/gi,
  )) {
    context.set(match[1].toLowerCase(), Number(match[2].replaceAll(",", "")));
  }

  const out: DocsModel[] = [];
  for (const row of html.matchAll(
    /\[_jsx\(_components\.a,\{[^}]*children:`(kimi-[a-z0-9.-]+)`\}\),([^\]]+)\]/g,
  )) {
    const prices = [...row[2].matchAll(/\$([\d.]+) \/ MTok/g)].map((m) =>
      Number(m[1]),
    );
    if (prices.length !== 3 && prices.length !== 5) continue;
    const id = row[1];
    const series = id.match(/^kimi-(k\d+)/)?.[1];
    out.push({
      id,
      input: prices[0],
      output: prices[1],
      cached_input: prices[2],
      cache_write: prices[3],
      cache_write_1h: prices[4],
      context_window: series ? context.get(series) : undefined,
    });
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

  const [modelsMd, pricingMd, pricingHtml] = await Promise.all([
    fetchText(MODEL_LIST),
    fetchText(PRICING_INDEX),
    fetchText(PRICING_PAGE),
  ]);
  const priced = new Map(
    parsePricingPage(pricingHtml, pricingMd).map((model) => [model.id, model]),
  );
  assertParsed(priced.size, "moonshot pricing");
  const docsModels = new Map(
    parseModelList(modelsMd).map((id) => [id, priced.get(id) ?? { id }]),
  );
  console.log(
    `Parsed ${docsModels.size} active models, ${priced.size} prices from docs`,
  );
  assertParsed(docsModels.size, "moonshot");

  // Optional: the API adds release dates but needs a key.
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
      page_url: PRICING_PAGE,
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
