import { fetchText, findHtmlTables } from "./parse.ts";
import {
  filterModalities,
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  sanitizeModelId,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Amazon Bedrock models from AWS docs.
 * No API key needed — scrapes public documentation.
 */

const sources = readSources("amazon");
const DOCS_URL = sources.docs as string;

const PROVIDER_MAP: Record<string, string> = {
  "ai21 labs": "ai21",
  amazon: "amazon",
  anthropic: "anthropic",
  cohere: "cohere",
  deepseek: "deepseek",
  google: "google",
  "luma ai": "luma",
  meta: "meta",
  minimax: "minimax",
  "mistral ai": "mistral",
  "moonshot ai": "moonshot",
  nvidia: "nvidia",
  openai: "openai",
  qwen: "qwen",
  "stability ai": "stability",
  twelvelabs: "twelvelabs",
  writer: "writer",
  "z.ai": "zhipu",
};

async function main() {
  console.log("Fetching Amazon Bedrock models from docs...");

  const html = await fetchText(DOCS_URL);

  // Parse the main table
  const tables = findHtmlTables(html);
  if (tables.length === 0) throw new Error("No tables found");

  // Find the table with "Provider" and "Model name" headers
  let modelRows: string[][] | null = null;
  for (const t of tables) {
    if (t.raw.includes("Provider") && t.raw.includes("Model ID")) {
      modelRows = t.rows;
      break;
    }
  }
  if (!modelRows) throw new Error("Model table not found");

  console.log(`Found ${modelRows.length} rows`);

  let currentProvider = "";
  let written = 0;

  for (const texts of modelRows.slice(1)) {
    // skip header
    if (texts.length < 4) continue;

    // Provider column (may be empty if same as previous row)
    if (texts[0]) {
      const p = texts[0].toLowerCase();
      currentProvider = PROVIDER_MAP[p] ?? p;
    }

    // Columns: Provider | Model | Model ID | Single-region | Cross-region | Input mod | Output mod | Streaming | Params
    const modelName = texts[1];
    const modelId = texts[2];
    if (!modelId || modelId === "Model ID") continue;

    // Streaming (column 7)
    const streaming = texts[7]?.toLowerCase() === "yes";

    // Input modalities (column 5)
    const inputMods = texts[5]
      ? texts[5]
          .split(",")
          .map((m) => m.trim().toLowerCase())
          .filter(Boolean)
      : ["text"];

    // Output modalities (column 6)
    const outputMods = texts[6]
      ? texts[6]
          .split(",")
          .map((m) => m.trim().toLowerCase())
          .filter(Boolean)
      : ["text"];

    const mods = filterModalities(inputMods, outputMods);

    const hasVision = inputMods.some((m) => m.includes("image"));

    const entry: ModelEntry = {
      id: modelId,
      name: modelName,
      created_by: currentProvider,
      family: inferFamily(sanitizeModelId(modelId)),
      capabilities: {
        ...(streaming ? { streaming: true } : {}),
        ...(hasVision ? { vision: true } : {}),
      },
      modalities: mods,
    };

    written += upsertWithSnapshot("amazon", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
