import { fetchText } from "./parse.ts";
import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Cloudflare Workers AI models from docs page.
 * No API key needed — scrapes public documentation.
 */

const sources = readSources("cloudflare-workers-ai");
const DOCS_URL = sources.docs as string;

const CREATOR_MAP: Record<string, string> = {
  meta: "meta",
  "meta-llama": "meta",
  google: "google",
  openai: "openai",
  mistral: "mistral",
  mistralai: "mistral",
  qwen: "qwen",
  "deepseek-ai": "deepseek",
  nvidia: "nvidia",
  "black-forest-labs": "black-forest-labs",
  baai: "baai",
  facebook: "meta",
  microsoft: "microsoft",
  "ibm-granite": "ibm",
  moonshotai: "moonshot",
  "zai-org": "zhipu",
  stabilityai: "stability",
  bytedance: "bytedance",
  leonardo: "leonardo",
  deepgram: "deepgram",
  "myshell-ai": "myshell",
  tiiuae: "tii",
  runwayml: "runway",
  aisingapore: "aisingapore",
  pfnet: "pfnet",
};

function extractCreator(modelId: string): string {
  // @cf/meta/llama-3.1-8b-instruct → meta
  // @hf/google/gemma-7b-it → google
  const parts = modelId.replace(/^@(?:cf|hf)\//, "").split("/");
  if (parts.length >= 2) {
    return CREATOR_MAP[parts[0]] ?? parts[0];
  }
  return "unknown";
}

function extractShortName(modelId: string): string {
  // @cf/meta/llama-3.1-8b-instruct → llama-3.1-8b-instruct
  const parts = modelId.replace(/^@(?:cf|hf)\//, "").split("/");
  return parts[parts.length - 1];
}

async function main() {
  console.log("Fetching Cloudflare Workers AI models...");

  const html = await fetchText(DOCS_URL);

  // Extract all @cf/ and @hf/ model IDs
  const cfIds = [
    ...new Set(
      [...html.matchAll(/@cf\/([\w/.-]+)/g)].map((m) => `@cf/${m[1]}`),
    ),
  ];
  const hfIds = [
    ...new Set(
      [...html.matchAll(/@hf\/([\w/.-]+)/g)].map((m) => `@hf/${m[1]}`),
    ),
  ];
  const allIds = [...cfIds, ...hfIds];

  console.log(
    `Found ${allIds.length} models (${cfIds.length} @cf, ${hfIds.length} @hf)`,
  );

  const chatModels = allIds;

  console.log(`Using all ${chatModels.length} models`);

  let written = 0;
  for (const fullId of chatModels) {
    const shortName = extractShortName(fullId);
    const creator = extractCreator(fullId);

    const entry: ModelEntry = {
      id: fullId,
      name: shortName,
      created_by: creator,
      family: inferFamily(shortName),
      capabilities: { streaming: true },
    };

    written += upsertWithSnapshot("cloudflare-workers-ai", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
