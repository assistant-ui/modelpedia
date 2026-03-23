import { fetchJson } from "./parse.ts";
import {
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
 * 1. /v1/models API (optional, requires MOONSHOT_API_KEY) — live model list
 * 2. Hardcoded fallback — docs-verified specs (context, max_output, capabilities)
 *
 * Pricing is NOT extracted: the pricing page (platform.moonshot.ai/docs/pricing/chat)
 * renders tables via JavaScript and cannot be scraped with a simple fetch.
 * Pricing must be maintained manually or a future data source added.
 */

const sources = readSources("moonshot");
const API_URL = sources.api as string;

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

// Build a lookup from model ID to hardcoded specs
const specsById = new Map(MODELS.map((m) => [m.id, m]));

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

  // 1. Try API for live model list (optional, needs key)
  const apiKey = envOrNull("MOONSHOT_API_KEY");
  const apiModels = new Map<string, ApiModel>();

  if (apiKey && API_URL) {
    try {
      const json = await fetchJson<{ data: ApiModel[] }>(API_URL, {
        Authorization: `Bearer ${apiKey}`,
      });
      for (const m of json.data) {
        apiModels.set(m.id, m);
      }
      console.log(`Found ${apiModels.size} models from API`);
    } catch (err) {
      console.warn("Could not fetch models API:", err);
    }
  } else {
    console.log(
      "No MOONSHOT_API_KEY set, using hardcoded model list (API requires auth)",
    );
  }

  // 2. Merge: use API model IDs if available, enrich with hardcoded specs
  const modelIds = new Set<string>();

  // Add all hardcoded models
  for (const m of MODELS) {
    modelIds.add(m.id);
  }

  // Add any API-only models not in hardcoded list
  for (const id of apiModels.keys()) {
    modelIds.add(id);
  }

  let written = 0;

  for (const id of modelIds) {
    const specs = specsById.get(id);
    const apiModel = apiModels.get(id);

    const entry: ModelEntry = specs
      ? { ...specs }
      : {
          id,
          name: apiModel?.id ?? id,
        };

    // Enrich with API data if available
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
