import {
  envOrNull,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch DeepSeek models from:
 * 1. Docs pricing page (specs + pricing, no key needed)
 * 2. /models API (optional, needs key — for release dates)
 */

const _DOCS_URL = "https://api-docs.deepseek.com/quick_start/pricing";

// Known models from docs
const MODELS: ModelEntry[] = [
  {
    id: "deepseek-chat",
    name: "DeepSeek V3.2 (Chat)",
    family: "deepseek-chat",
    description:
      "DeepSeek-V3.2 in non-thinking mode. Best for general chat, code, and tool use.",
    context_window: 128000,
    max_output_tokens: 8000,
    capabilities: {
      streaming: true,
      tool_call: true,
      json_mode: true,
      structured_output: true,
    },
    pricing: {
      input: 0.28,
      output: 0.42,
      cached_input: 0.028,
    },
  },
  {
    id: "deepseek-reasoner",
    name: "DeepSeek V3.2 (Reasoner)",
    family: "deepseek-chat",
    description:
      "DeepSeek-V3.2 in thinking mode with chain-of-thought reasoning.",
    context_window: 128000,
    max_output_tokens: 64000,
    capabilities: {
      streaming: true,
      reasoning: true,
      tool_call: true,
    },
    reasoning_tokens: true,
    pricing: {
      input: 0.28,
      output: 0.42,
      cached_input: 0.028,
    },
  },
];

async function main() {
  console.log("Fetching DeepSeek models...");

  // Optional: API for release dates
  const apiKey = envOrNull("DEEPSEEK_API_KEY");
  const apiModels = new Map<string, { created: number }>();
  if (apiKey) {
    try {
      const res = await fetch("https://api.deepseek.com/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data: { id: string; created: number }[];
        };
        for (const m of json.data) apiModels.set(m.id, m);
        console.log(`Found ${apiModels.size} models from API`);
      }
    } catch {}
  }

  let written = 0;
  for (const entry of MODELS) {
    const apiModel = apiModels.get(entry.id);
    if (apiModel?.created) {
      entry.release_date = new Date(apiModel.created * 1000)
        .toISOString()
        .split("T")[0];
    }
    written += upsertWithSnapshot("deepseek", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
