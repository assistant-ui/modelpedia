import { type ModelEntry, runGenerate, upsertWithSnapshot } from "./shared.ts";

/**
 * Fetch Moonshot AI (Kimi) models from docs page.
 * No API key needed.
 */

// Known models from docs
const MODELS: ModelEntry[] = [
  {
    id: "kimi-k2.5",
    name: "Kimi K2.5",
    family: "kimi",
    description:
      "Kimi's most intelligent model with native multimodal support, thinking/non-thinking modes.",
    context_window: 256000,
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
    description:
      "Enhanced agentic coding, front-end aesthetics, context understanding.",
    context_window: 256000,
    capabilities: { streaming: true, tool_call: true },
  },
  {
    id: "kimi-k2-thinking",
    name: "Kimi K2 Thinking",
    family: "kimi",
    description: "Long-term thinking, multi-step tool usage, complex problem solving.",
    context_window: 256000,
    reasoning_tokens: true,
    capabilities: { streaming: true, tool_call: true, reasoning: true },
  },
  {
    id: "kimi-k2-turbo-preview",
    name: "Kimi K2 Turbo",
    family: "kimi",
    description: "High-speed version, 60-100 tokens/sec output.",
    context_window: 256000,
    capabilities: { streaming: true, tool_call: true },
    speed: 5,
  },
  {
    id: "kimi-k2-thinking-turbo",
    name: "Kimi K2 Thinking Turbo",
    family: "kimi",
    description: "Deep reasoning with high speed output.",
    context_window: 256000,
    reasoning_tokens: true,
    capabilities: { streaming: true, tool_call: true, reasoning: true },
    speed: 5,
  },
  {
    id: "moonshot-v1-128k",
    name: "Moonshot v1 128K",
    family: "moonshot",
    context_window: 128000,
    capabilities: { streaming: true },
  },
  {
    id: "moonshot-v1-32k",
    name: "Moonshot v1 32K",
    family: "moonshot",
    context_window: 32000,
    capabilities: { streaming: true },
  },
  {
    id: "moonshot-v1-8k",
    name: "Moonshot v1 8K",
    family: "moonshot",
    context_window: 8000,
    capabilities: { streaming: true },
  },
];

async function main() {
  console.log("Fetching Moonshot AI models...");

  let written = 0;
  for (const entry of MODELS) {
    written += upsertWithSnapshot("moonshot", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
