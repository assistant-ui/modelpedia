import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Ollama models from their API and search page.
 * No API key needed.
 */

const API_URL = "https://ollama.com/api/tags";
const SEARCH_URL = "https://ollama.com/search";

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
  const res = await fetch(API_URL);
  if (!res.ok) return [];
  const json = (await res.json()) as { models: OllamaModel[] };
  return json.models.map((m) => m.name.split(":")[0]);
}

async function fetchFromSearch(): Promise<string[]> {
  const res = await fetch(SEARCH_URL);
  if (!res.ok) return [];
  const html = await res.text();
  return [
    ...new Set(
      [...html.matchAll(/href="\/library\/([\w.-]+)"/g)].map((m) => m[1]),
    ),
  ];
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
