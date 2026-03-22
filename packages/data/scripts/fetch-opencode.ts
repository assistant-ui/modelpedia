import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch OpenCode Zen models from their docs .md endpoint.
 * No API key needed.
 */

const sources = readSources("opencode");
const DOCS_MD = sources.docs as string;

const CREATOR_MAP: Record<string, string> = {
  gpt: "openai",
  claude: "anthropic",
  gemini: "google",
  minimax: "minimax",
  glm: "zhipu",
  kimi: "moonshot",
  mimo: "xiaomi",
  nemotron: "nvidia",
  qwen: "qwen",
  "big-pickle": "opencode",
};

function extractCreator(id: string): string {
  for (const [prefix, creator] of Object.entries(CREATOR_MAP)) {
    if (id.startsWith(prefix)) return creator;
  }
  return "unknown";
}

async function main() {
  console.log("Fetching OpenCode Zen models...");

  const res = await fetch(DOCS_MD);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const md = await res.text();

  // Parse the endpoints table (first table with Model | Model ID | Endpoint)
  const lines = md.split("\n");
  const models: { name: string; id: string }[] = [];
  const pricing: Map<string, { input?: number; output?: number }> = new Map();
  const deprecated = new Set<string>();

  let section = "";
  for (const line of lines) {
    // Detect section headers
    if (line.includes("## Pricing")) section = "pricing";
    else if (line.includes("## Deprecated") || line.includes("## Sunset"))
      section = "deprecated";
    else if (line.includes("## Endpoints")) section = "endpoints";

    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .map((c) => c.replace(/`/g, "").trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    // Skip header/separator rows
    if (cells[0] === "Model" || cells[0].startsWith("-")) continue;

    if (section === "endpoints" && cells.length >= 2) {
      const name = cells[0];
      const id = cells[1];
      if (id && !id.startsWith("http") && !id.startsWith("@")) {
        models.push({ name, id });
      }
    }

    if (section === "pricing" && cells.length >= 2) {
      const idOrName = cells[0];
      const priceStr = cells[1];
      // Match model name to ID
      const model = models.find(
        (m) => m.name === idOrName || m.id === idOrName,
      );
      if (model && priceStr.startsWith("$")) {
        const price = Number(priceStr.replace("$", ""));
        const existing = pricing.get(model.id) ?? {};
        if (!existing.input) {
          existing.input = price;
        } else if (!existing.output) {
          existing.output = price;
        }
        pricing.set(model.id, existing);
      }
    }

    if (section === "deprecated") {
      const id = cells[0];
      const model = models.find((m) => m.name === id || m.id === id);
      if (model) deprecated.add(model.id);
    }
  }

  // Deduplicate models
  const seen = new Set<string>();
  const unique = models.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  console.log(
    `Parsed ${unique.length} models, ${pricing.size} with pricing, ${deprecated.size} deprecated`,
  );

  let written = 0;
  for (const m of unique) {
    if (m.id === "Free") continue;

    const p = pricing.get(m.id);
    const entry: ModelEntry = {
      id: m.id,
      name: m.name,
      created_by: extractCreator(m.id),
      family: inferFamily(m.id),
      status: deprecated.has(m.id) ? "deprecated" : "active",
      capabilities: { streaming: true },
    };

    if (p?.input != null) {
      entry.pricing = {
        input: p.input,
        ...(p.output != null ? { output: p.output } : {}),
      };
    }

    written += upsertWithSnapshot("opencode", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
