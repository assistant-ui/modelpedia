import { fetchText } from "./parse.ts";
import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Vercel AI Gateway models from their public .md endpoint.
 * No API key needed — structured markdown table.
 */

const sources = readSources("vercel");
const MODELS_MD = sources.docs as string;

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

function parseContext(s: string): number | undefined {
  const m = s.match(/([\d.]+)([KkMm])/);
  if (!m) return undefined;
  const num = Number(m[1]);
  if (m[2] === "M" || m[2] === "m") return Math.round(num * 1_000_000);
  return Math.round(num * 1_000);
}

function extractCreatedBy(modelId: string): string {
  const slash = modelId.indexOf("/");
  if (slash === -1) return "unknown";
  const prefix = modelId.slice(0, slash);
  const map: Record<string, string> = {
    alibaba: "qwen",
    amazon: "amazon",
    anthropic: "anthropic",
    "arcee-ai": "arcee",
    bfl: "black-forest-labs",
    bytedance: "bytedance",
    cohere: "cohere",
    deepseek: "deepseek",
    google: "google",
    inception: "inception",
    meituan: "meituan",
    meta: "meta",
    minimax: "minimax",
    mistral: "mistral",
    moonshotai: "moonshot",
    morph: "morph",
    nvidia: "nvidia",
    openai: "openai",
    perplexity: "perplexity",
    xai: "xai",
    xiaomi: "xiaomi",
    zai: "zhipu",
  };
  return map[prefix] ?? prefix;
}

function parseTags(tags: string): Record<string, boolean> {
  const caps: Record<string, boolean> = { streaming: true };
  if (tags.includes("vision")) caps.vision = true;
  if (tags.includes("tool-use")) caps.tool_call = true;
  if (tags.includes("reasoning")) caps.reasoning = true;
  if (tags.includes("file-input")) caps.vision = true;
  return caps;
}

async function main() {
  console.log("Fetching Vercel AI Gateway models...");

  const md = await fetchText(MODELS_MD);

  const lines = md
    .split("\n")
    .filter(
      (l) =>
        l.startsWith("| ") && !l.startsWith("| Model") && !l.startsWith("|--"),
    );

  console.log(`Parsed ${lines.length} models`);

  let written = 0;
  for (const line of lines) {
    const cells = line.split("|").map((c) => c.trim());
    // cells: ["", model, type, context, input, output, providers, tags, ""]
    const modelId = cells[1];
    const _modelType = cells[2];
    const context = cells[3];
    const inputPrice = cells[4];
    const outputPrice = cells[5];
    const tags = cells[7] ?? "";

    if (!modelId) continue;

    const shortName = modelId.includes("/")
      ? modelId.split("/").pop()!
      : modelId;

    const entry: ModelEntry = {
      id: modelId,
      name: shortName,
      created_by: extractCreatedBy(modelId),
      family: inferFamily(shortName),
      context_window: parseContext(context),
      capabilities: parseTags(tags),
    };

    const inp = parseDollar(inputPrice);
    const out = parseDollar(outputPrice);
    if (inp != null && out != null) {
      entry.pricing = { input: inp, output: out };
    }

    written += upsertWithSnapshot("vercel", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
