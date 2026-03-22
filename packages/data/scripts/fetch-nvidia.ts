import { fetchJson } from "./parse.ts";
import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch NVIDIA NIM models from the integrate API.
 * No API key needed — public OpenAI-compatible endpoint.
 */

const sources = readSources("nvidia");
const API_URL = sources.api as string;

interface NvidiaModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

const OWNER_MAP: Record<string, string> = {
  nvidia: "nvidia",
  meta: "meta",
  google: "google",
  microsoft: "microsoft",
  mistralai: "mistral",
  "nv-mistralai": "mistral",
  openai: "openai",
  "deepseek-ai": "deepseek",
  qwen: "qwen",
  "01-ai": "01-ai",
  ai21labs: "ai21",
  "baichuan-inc": "baichuan",
  tiiuae: "tii",
  thudm: "zhipu",
  "z-ai": "zhipu",
  writer: "writer",
  ibm: "ibm",
  upstage: "upstage",
  databricks: "databricks",
  snowflake: "snowflake",
  bytedance: "bytedance",
  minimaxai: "minimax",
  moonshotai: "moonshot",
  "stepfun-ai": "stepfun",
  mediatek: "mediatek",
};

function extractCreatedBy(ownedBy: string): string {
  return OWNER_MAP[ownedBy] ?? ownedBy;
}

function extractName(id: string): string {
  // "nvidia/nemotron-3-super-120b-a12b" → "nemotron-3-super-120b-a12b"
  const slash = id.indexOf("/");
  return slash !== -1 ? id.slice(slash + 1) : id;
}

function inferCaps(id: string): Record<string, boolean> {
  const caps: Record<string, boolean> = { streaming: true };
  const name = id.toLowerCase();
  if (
    name.includes("instruct") ||
    name.includes("chat") ||
    name.includes("nemotron")
  )
    caps.tool_call = true;
  if (name.includes("vision") || name.includes("vl")) caps.vision = true;
  if (name.includes("reason") || name.includes("-r1")) caps.reasoning = true;
  return caps;
}

async function main() {
  console.log("Fetching NVIDIA NIM models...");

  const json = await fetchJson<{ data: NvidiaModel[] }>(API_URL);

  console.log(`Found ${json.data.length} models`);

  let written = 0;
  for (const m of json.data) {
    const name = extractName(m.id);
    const releaseDate =
      m.created > 1577836800
        ? new Date(m.created * 1000).toISOString().split("T")[0]
        : undefined;

    const entry: ModelEntry = {
      id: m.id,
      name,
      created_by: extractCreatedBy(m.owned_by),
      family: inferFamily(name),
      release_date: releaseDate,
      capabilities: inferCaps(m.id),
    };

    written += upsertWithSnapshot("nvidia", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
