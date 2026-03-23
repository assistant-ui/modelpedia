import { fetchText } from "./parse.ts";
import {
  inferFamily,
  inferParameters,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Baseten models from their library page.
 * No API key needed.
 */

const sources = readSources("baseten");
const LIBRARY_URL = sources.docs as string;

const CREATOR_MAP: Record<string, string> = {
  llama: "meta",
  qwen: "qwen",
  deepseek: "deepseek",
  nemotron: "nvidia",
  nvidia: "nvidia",
  mistral: "mistral",
  gemma: "google",
  phi: "microsoft",
  whisper: "openai",
  gpt: "openai",
};

function extractCreator(name: string): string {
  const n = name.toLowerCase();
  for (const [prefix, creator] of Object.entries(CREATOR_MAP)) {
    if (n.includes(prefix)) return creator;
  }
  return "unknown";
}

async function main() {
  console.log("Fetching Baseten models...");

  const html = await fetchText(LIBRARY_URL);

  // Extract model names from the page content
  const modelNames = [
    ...new Set(
      [
        ...html.matchAll(
          /((?:llama|qwen|deepseek|nemotron|nvidia|mistral|gemma|phi|gpt|whisper|voxtral|ultravox|orpheus|flux|stable)[\w.-]+(?:-[\w.-]+)*)/gi,
        ),
      ]
        .map((m) => m[1].toLowerCase())
        .filter(
          (n) =>
            n.length > 5 &&
            !n.includes("http") &&
            !n.includes("class") &&
            !n.includes("style") &&
            !n.includes(".png") &&
            !n.includes(".jpg") &&
            !n.includes(".jpeg") &&
            !n.includes(".svg") &&
            !n.includes("logo"),
        ),
    ),
  ];

  // Filter to chat/LLM models
  const chatModels = modelNames.filter((n) => {
    if (n.includes("tts") || n.includes("asr") || n.includes("embedding"))
      return false;
    if (n.includes("reranker") || n.includes("reward")) return false;
    if (n.includes("flux") || n.includes("stable-diffusion")) return false;
    if (n.includes("streaming")) return false;
    return true;
  });

  console.log(
    `Found ${chatModels.length} chat models (from ${modelNames.length} total)`,
  );

  let written = 0;
  for (const name of chatModels) {
    const params = inferParameters(name);

    const entry: ModelEntry = {
      id: name,
      name,
      created_by: extractCreator(name),
      family: inferFamily(name),
      capabilities: { streaming: true },
      modalities: { input: ["text"], output: ["text"] },
      open_weight: true,
      parameters: params?.parameters,
      active_parameters: params?.active_parameters,
    };

    written += upsertWithSnapshot("baseten", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
