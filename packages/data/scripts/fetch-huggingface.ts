import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Hugging Face Inference API models.
 * No API key needed — public API.
 */

const API_URL =
  "https://huggingface.co/api/models?pipeline_tag=text-generation&inference=warm&sort=downloads&direction=-1&limit=200";

interface HFModel {
  id: string;
  modelId: string;
  downloads: number;
  likes: number;
  pipeline_tag: string;
  tags: string[];
  library_name?: string;
  createdAt: string;
}

function extractCreator(id: string): string {
  const org = id.split("/")[0];
  const map: Record<string, string> = {
    "meta-llama": "meta",
    meta: "meta",
    Qwen: "qwen",
    mistralai: "mistral",
    google: "google",
    openai: "openai",
    "deepseek-ai": "deepseek",
    nvidia: "nvidia",
    microsoft: "microsoft",
    "zai-org": "zhipu",
    tiiuae: "tii",
    ibm: "ibm",
    NousResearch: "nousresearch",
    bigcode: "bigcode",
    bytedance: "bytedance",
    ai21labs: "ai21",
    "01-ai": "01-ai",
    allenai: "allenai",
    MiniMaxAI: "minimax",
    moonshotai: "moonshot",
  };
  return map[org] ?? org.toLowerCase();
}

function extractName(id: string): string {
  return id.split("/").pop() ?? id;
}

async function main() {
  console.log("Fetching Hugging Face models...");

  const res = await fetch(API_URL);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const models = (await res.json()) as HFModel[];

  console.log(`Found ${models.length} models`);

  // Filter to instruct/chat models (skip base models)
  const chatModels = models.filter((m) => {
    const name = m.id.toLowerCase();
    return (
      name.includes("instruct") ||
      name.includes("chat") ||
      name.includes("it") ||
      name.includes("gpt-oss") ||
      name.includes("glm") ||
      name.includes("coder") ||
      name.includes("codex") ||
      name.includes("qwen3") ||
      name.includes("thinking")
    );
  });

  console.log(`Filtered to ${chatModels.length} chat/instruct models`);

  let written = 0;
  for (const m of chatModels) {
    const shortName = extractName(m.id);

    const entry: ModelEntry = {
      id: m.id,
      name: shortName,
      created_by: extractCreator(m.id),
      family: inferFamily(shortName),
      capabilities: { streaming: true },
    };

    written += upsertWithSnapshot("huggingface", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
