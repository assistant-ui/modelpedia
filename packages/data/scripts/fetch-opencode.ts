import {
  inferFamily,
  inferParameters,
  type ModelEntry,
  normalizeDate,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch OpenCode Zen models from their docs .md endpoint.
 * No API key needed.
 *
 * Extracts:
 *   - model name + ID from endpoints table
 *   - pricing (input, output, cached_read, cached_write) from pricing table
 *   - deprecation dates from deprecated models table
 *   - parameters via inferParameters
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

interface PricingInfo {
  input?: number;
  output?: number;
  cached_input?: number;
  cache_write?: number;
}

function parseDollar(s: string): number | undefined {
  if (!s || s === "-" || s === "—" || s.toLowerCase() === "free")
    return undefined;
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

async function main() {
  console.log("Fetching OpenCode Zen models...");

  const res = await fetch(DOCS_MD);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const md = await res.text();

  // Parse the endpoints table (first table with Model | Model ID | Endpoint)
  const lines = md.split("\n");
  const models: { name: string; id: string }[] = [];
  const pricing: Map<string, PricingInfo> = new Map();
  const deprecatedDates = new Map<string, string>();

  let section = "";
  const pricingCols: Record<string, number> = {};

  for (const line of lines) {
    // Detect section headers
    if (line.includes("## Pricing")) section = "pricing";
    else if (line.includes("## Deprecated") || line.includes("## Sunset"))
      section = "deprecated";
    else if (line.includes("## Endpoints") || line.includes("## Models"))
      section = "endpoints";
    else if (line.startsWith("## ") && section) {
      // New section that isn't one we track — reset
      if (
        !line.includes("Pricing") &&
        !line.includes("Deprecated") &&
        !line.includes("Sunset") &&
        !line.includes("Endpoints") &&
        !line.includes("Models")
      ) {
        section = "";
      }
    }

    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .map((c) => c.replace(/`/g, "").trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    // Skip separator rows
    if (cells[0].startsWith("-")) continue;

    // Detect pricing table headers
    if (section === "pricing" && cells[0].toLowerCase() === "model") {
      for (let i = 0; i < cells.length; i++) {
        const h = cells[i].toLowerCase();
        if (h === "model") pricingCols.model = i;
        else if (h === "input") pricingCols.input = i;
        else if (h === "output") pricingCols.output = i;
        else if (h.includes("cached read") || h.includes("cache read"))
          pricingCols.cachedRead = i;
        else if (h.includes("cached write") || h.includes("cache write"))
          pricingCols.cacheWrite = i;
      }
      continue;
    }

    // Skip header rows
    if (cells[0] === "Model" || cells[0] === "model") continue;

    if (section === "endpoints" && cells.length >= 2) {
      const name = cells[0];
      const id = cells[1];
      if (id && !id.startsWith("http") && !id.startsWith("@")) {
        models.push({ name, id });
      }
    }

    if (section === "pricing" && cells.length >= 2) {
      const idOrName = cells[pricingCols.model ?? 0];
      // Match model name to ID
      const model = models.find(
        (m) => m.name === idOrName || m.id === idOrName,
      );
      if (model) {
        const info: PricingInfo = {};
        if (pricingCols.input != null)
          info.input = parseDollar(cells[pricingCols.input] ?? "");
        if (pricingCols.output != null)
          info.output = parseDollar(cells[pricingCols.output] ?? "");
        if (pricingCols.cachedRead != null)
          info.cached_input = parseDollar(cells[pricingCols.cachedRead] ?? "");
        if (pricingCols.cacheWrite != null)
          info.cache_write = parseDollar(cells[pricingCols.cacheWrite] ?? "");
        // Fallback: if no column headers were detected, use positional
        if (Object.keys(pricingCols).length === 0 && cells.length >= 2) {
          info.input = parseDollar(cells[1] ?? "");
          if (cells.length >= 3) info.output = parseDollar(cells[2] ?? "");
        }
        pricing.set(model.id, info);
      }
    }

    if (section === "deprecated") {
      const id = cells[0];
      const model = models.find((m) => m.name === id || m.id === id);
      if (model) {
        deprecatedDates.set(model.id, cells[1] ?? "");
      } else {
        // Model might not be in endpoints table; record by raw name
        deprecatedDates.set(id, cells[1] ?? "");
      }
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
    `Parsed ${unique.length} models, ${pricing.size} with pricing, ${deprecatedDates.size} deprecated`,
  );

  let written = 0;
  for (const m of unique) {
    if (m.id === "Free") continue;

    const p = pricing.get(m.id);
    const params = inferParameters(m.id);
    const isDeprecated = deprecatedDates.has(m.id);
    const deprecationDateRaw = deprecatedDates.get(m.id);
    const deprecationDate = deprecationDateRaw
      ? normalizeDate(deprecationDateRaw)
      : undefined;

    const entry: ModelEntry = {
      id: m.id,
      name: m.name,
      created_by: extractCreator(m.id),
      family: inferFamily(m.id),
      status: isDeprecated ? "deprecated" : "active",
      deprecation_date: deprecationDate ?? undefined,
      capabilities: { streaming: true },
      parameters: params?.parameters,
      active_parameters: params?.active_parameters,
    };

    if (p) {
      const pricingData: Record<string, number> = {};
      if (p.input != null) pricingData.input = p.input;
      if (p.output != null) pricingData.output = p.output;
      if (p.cached_input != null) pricingData.cached_input = p.cached_input;
      if (p.cache_write != null) pricingData.cache_write = p.cache_write;
      if (Object.keys(pricingData).length > 0) entry.pricing = pricingData;
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
