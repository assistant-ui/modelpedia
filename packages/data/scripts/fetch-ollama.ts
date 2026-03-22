import { fetchJson, fetchText } from "./parse.ts";
import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Ollama models from their API and search page.
 * No API key needed.
 */

const sources = readSources("ollama");
const API_URL = sources.api as string;
const SEARCH_URL = sources.search as string;

interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
}

function extractCreator(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("llama") || n.includes("maverick") || n.includes("scout"))
    return "meta";
  if (n.includes("qwen")) return "qwen";
  if (n.includes("gemma")) return "google";
  if (
    n.includes("mistral") ||
    n.includes("ministral") ||
    n.includes("devstral") ||
    n.includes("codestral") ||
    n.includes("pixtral")
  )
    return "mistral";
  if (n.includes("deepseek")) return "deepseek";
  if (n.includes("nemotron")) return "nvidia";
  if (n.includes("glm")) return "zhipu";
  if (n.includes("kimi")) return "moonshot";
  if (n.includes("minimax")) return "minimax";
  if (n.includes("gpt-oss")) return "openai";
  if (n.includes("phi")) return "microsoft";
  if (n.includes("granite")) return "ibm";
  if (n.includes("mimo")) return "xiaomi";
  if (n.includes("lfm")) return "liquid";
  if (n.includes("falcon")) return "tii";
  if (n.includes("rnj")) return "essentialai";
  return "unknown";
}

async function fetchFromApi(): Promise<string[]> {
  try {
    const json = await fetchJson<{ models: OllamaModel[] }>(API_URL);
    return json.models.map((m) => m.name.split(":")[0]);
  } catch {
    return [];
  }
}

async function fetchFromSearch(): Promise<string[]> {
  try {
    const html = await fetchText(SEARCH_URL);
    return [
      ...new Set(
        [...html.matchAll(/href="\/library\/([\w.-]+)"/g)].map((m) => m[1]),
      ),
    ];
  } catch {
    return [];
  }
}

async function main() {
  console.log("Fetching Ollama models...");

  const [apiModels, searchModels] = await Promise.all([
    fetchFromApi(),
    fetchFromSearch(),
  ]);

  const allNames = [...new Set([...apiModels, ...searchModels])];
  console.log(
    `Found ${allNames.length} unique models (${apiModels.length} from API, ${searchModels.length} from search)`,
  );

  let written = 0;
  for (const name of allNames) {
    const entry: ModelEntry = {
      id: name,
      name,
      created_by: extractCreator(name),
      family: inferFamily(name),
      capabilities: { streaming: true },
    };

    written += upsertWithSnapshot("ollama", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
