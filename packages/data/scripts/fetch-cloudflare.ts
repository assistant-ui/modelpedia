import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Cloudflare Workers AI models from docs page.
 * No API key needed — scrapes public documentation.
 */

const DOCS_URL = "https://developers.cloudflare.com/workers-ai/models/";

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

// Text generation models we care about
const _TEXT_GEN_KEYWORDS = [
  "llama",
  "gemma",
  "mistral",
  "qwen",
  "deepseek",
  "phi",
  "falcon",
  "openchat",
  "tinyllama",
  "cybertron",
  "hermes",
  "starling",
  "neural-chat",
  "zephyr",
  "openhermes",
  "discolm",
  "granite",
  "kimi",
  "glm",
  "gpt-oss",
  "nemotron",
  "sqlcoder",
  "llava",
  "scout",
];

async function main() {
  console.log("Fetching Cloudflare Workers AI models...");

  const res = await fetch(DOCS_URL);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const html = await res.text();

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

  // Filter to text generation / chat models
  const chatModels = allIds.filter((id) => {
    const name = id.toLowerCase();
    // Skip non-chat models
    if (name.includes("embed") || name.includes("bge-")) return false;
    if (name.includes("stable-diffusion") || name.includes("flux"))
      return false;
    if (
      name.includes("whisper") ||
      name.includes("aura") ||
      name.includes("melotts") ||
      name.includes("nova-3")
    )
      return false;
    if (name.includes("resnet") || name.includes("detr")) return false;
    if (name.includes("bart-large") || name.includes("reranker")) return false;
    if (name.includes("m2m100") || name.includes("indictrans")) return false;
    if (name.includes("img2img") || name.includes("inpainting")) return false;
    if (name.includes("guard") || name.includes("distilbert")) return false;
    if (name.includes("smart-turn") || name.includes("uform")) return false;
    if (
      name.includes("lucid") ||
      name.includes("phoenix") ||
      name.includes("dreamshaper")
    )
      return false;
    return true;
  });

  console.log(`Filtered to ${chatModels.length} chat/text models`);

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

    written += upsertWithSnapshot("cloudflare", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
