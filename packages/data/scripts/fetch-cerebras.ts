import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Cerebras models from their docs .md endpoints.
 * No API key needed.
 */

const MODEL_PAGES = [
  "https://inference-docs.cerebras.ai/models/llama-31-8b.md",
  "https://inference-docs.cerebras.ai/models/openai-oss.md",
  "https://inference-docs.cerebras.ai/models/qwen-3-235b-2507.md",
  "https://inference-docs.cerebras.ai/models/zai-glm-47.md",
];

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

function parseTokens(s: string): number | undefined {
  const m = s.match(/(\d+)[kK]/);
  return m ? Number(m[1]) * 1000 : undefined;
}

const CREATOR_MAP: Record<string, string> = {
  llama: "meta",
  "gpt-oss": "openai",
  qwen: "qwen",
  glm: "zhipu",
};

function extractCreator(id: string): string {
  for (const [prefix, creator] of Object.entries(CREATOR_MAP)) {
    if (id.includes(prefix)) return creator;
  }
  return "unknown";
}

async function main() {
  console.log("Fetching Cerebras models...");

  let written = 0;

  for (const url of MODEL_PAGES) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const md = await res.text();

    // Extract model ID from ModelInfo component
    const idMatch = md.match(/modelId="([\w.-]+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];

    // Context window
    const ctxMatch = md.match(/paidTiers:\s*"(\d+)[kK]\s*tokens"/);
    const contextWindow = ctxMatch ? Number(ctxMatch[1]) * 1000 : undefined;

    // Max output
    const maxOutMatch = md.match(
      /maxOutput=\{\{[\s\S]*?paidTiers:\s*"(\d+)[kK]\s*tokens"/,
    );
    const maxOutput = maxOutMatch ? Number(maxOutMatch[1]) * 1000 : undefined;

    // Pricing
    const inputPrice = md.match(/inputPrice:\s*"\$([\d.]+)/);
    const outputPrice = md.match(/outputPrice:\s*"\$([\d.]+)/);

    // Capabilities
    const caps: Record<string, boolean> = { streaming: true };
    if (md.includes("Tool Calling")) caps.tool_call = true;
    if (md.includes("Structured Outputs")) caps.structured_output = true;
    if (md.includes("Vision") || md.includes("image")) caps.vision = true;
    if (md.includes("Thinking") || md.includes("reasoning"))
      caps.reasoning = true;

    // Input formats
    const inputFmts = md.match(/inputFormats:\s*\[([\s\S]*?)\]/);
    const hasImageInput = inputFmts?.[1]?.includes("image") ?? false;

    const entry: ModelEntry = {
      id,
      name: id,
      created_by: extractCreator(id),
      family: inferFamily(id),
      context_window: contextWindow,
      max_output_tokens: maxOutput,
      capabilities: caps,
      modalities: {
        input: hasImageInput ? ["text", "image"] : ["text"],
        output: ["text"],
      },
    };

    if (inputPrice && outputPrice) {
      entry.pricing = {
        input: Number(inputPrice[1]),
        output: Number(outputPrice[1]),
      };
    }

    written += upsertWithSnapshot("cerebras", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
