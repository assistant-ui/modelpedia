import { fetchJson } from "./parse.ts";
import {
  envOrNull,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Reka AI models.
 *
 * The /v1/models endpoint requires REKA_API_KEY (returns {} unauthenticated).
 * When no key is present we fall back to hardcoded specs sourced from
 * docs.reka.ai/pricing and reka.ai/news.
 */

const sources = readSources("reka");
const API_URL = sources.models as string;

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
  } else {
    console.log("No REKA_API_KEY set, using hardcoded specs");
  }

  let written = 0;
  const seen = new Set<string>();

  for (const entry of HARDCODED) {
    const apiModel = apiModels.get(entry.id);
    const enriched: ModelEntry = { ...entry };
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
