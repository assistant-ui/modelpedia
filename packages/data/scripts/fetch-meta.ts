import { fetchJson } from "./parse.ts";
import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Meta Llama models from Hugging Face API.
 * No API key needed.
 */

const sources = readSources("meta");
const API_URL = sources.api as string;

// Known specs for Llama models (from official docs)
const KNOWN_SPECS: Record<string, { context: number; maxOutput?: number }> = {
  "Llama-4-Scout": { context: 1048576 },
  "Llama-4-Maverick": { context: 1048576 },
  "Llama-3.3-70B": { context: 131072 },
  "Llama-3.2-90B": { context: 131072 },
  "Llama-3.2-11B": { context: 131072 },
  "Llama-3.2-3B": { context: 131072 },
  "Llama-3.2-1B": { context: 131072 },
  "Llama-3.1-405B": { context: 131072 },
  "Llama-3.1-70B": { context: 131072 },
  "Llama-3.1-8B": { context: 131072 },
  "Meta-Llama-3-70B": { context: 8192 },
  "Meta-Llama-3-8B": { context: 8192 },
  "Llama-2-70b": { context: 4096 },
  "Llama-2-13b": { context: 4096 },
  "Llama-2-7b": { context: 4096 },
};

function findSpecs(id: string): { context?: number; maxOutput?: number } {
  for (const [key, specs] of Object.entries(KNOWN_SPECS)) {
    if (id.includes(key)) return specs;
  }
  return {};
}

async function main() {
  console.log("Fetching Meta Llama models...");

  const models =
    await fetchJson<
      {
        id: string;
        downloads: number;
        tags: string[];
      }[]
    >(API_URL);

  // Filter to instruct/chat models
  const chatModels = models.filter((m) => {
    const name = m.id.toLowerCase();
    return (
      name.includes("instruct") ||
      name.includes("chat") ||
      name.includes("guard") ||
      name.includes("scout") ||
      name.includes("maverick")
    );
  });

  console.log(
    `Found ${chatModels.length} chat models (from ${models.length} total)`,
  );

  let written = 0;
  for (const m of chatModels) {
    const shortName = m.id.split("/").pop() ?? m.id;
    const specs = findSpecs(m.id);
    const hasVision =
      m.tags?.includes("mllama") ||
      shortName.toLowerCase().includes("vision") ||
      shortName.includes("Scout") ||
      shortName.includes("Maverick");

    const entry: ModelEntry = {
      id: shortName,
      name: shortName,
      family: inferFamily(shortName),
      context_window: specs.context,
      capabilities: {
        streaming: true,
        tool_call: true,
        ...(hasVision ? { vision: true } : {}),
      },
      modalities: {
        input: hasVision ? ["text", "image"] : ["text"],
        output: ["text"],
      },
    };

    written += upsertWithSnapshot("meta", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
