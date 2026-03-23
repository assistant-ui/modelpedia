import { fetchText } from "./parse.ts";
import {
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch MiniMax models from their docs .md endpoints.
 * - Pricing from pricing-paygo.md (input, output, cached_input, cache_write)
 * - Context window & description from text-anthropic-api.md model table
 * No API key needed.
 */

const sources = readSources("minimax");
const PRICING_MD = sources.pricing as string;
const MODELS_MD = sources.models as string;

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

/** Normalize model name to lowercase ID. */
function toId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

interface ModelSpec {
  context_window?: number;
  description?: string;
}

/**
 * Parse the model table from the Anthropic API reference page.
 * Table columns: Model Name | Context Window | Description
 */
function parseModelSpecs(md: string): Map<string, ModelSpec> {
  const specs = new Map<string, ModelSpec>();
  const lines = md.split("\n");

  for (const line of lines) {
    if (!line.trimStart().startsWith("|")) continue;
    // Skip headers and separators
    if (line.includes("Model") && line.includes("Context")) continue;
    if (/^\|\s*:?-/.test(line)) continue;

    const cells = line
      .split("|")
      .map((c) => c.replace(/\*\*/g, "").trim())
      .filter(Boolean);
    if (cells.length < 2) continue;

    const name = cells[0];
    if (!name.startsWith("MiniMax") && !name.startsWith("M2")) continue;

    const id = toId(name);
    const spec: ModelSpec = {};

    // Context window (column 2)
    if (cells[1]) {
      const cwText = cells[1].replace(/,/g, "");
      const cwNum = Number.parseInt(cwText, 10);
      if (!Number.isNaN(cwNum) && cwNum > 0) {
        spec.context_window = cwNum;
      }
    }

    // Description (column 3) — strip surrounding quotes and tps info
    if (cells[2]) {
      let desc = cells[2]
        .replace(/^[""]|[""]$/g, "")
        .replace(/\s*\(.*?tps\)$/i, "")
        .trim();
      // Remove trailing period artifacts
      desc = desc.replace(/\.\s*$/, "").trim();
      if (desc) {
        spec.description = desc;
      }
    }

    specs.set(id, spec);
  }

  return specs;
}

async function main() {
  console.log("Fetching MiniMax models from docs...");

  // Fetch both sources in parallel
  const [pricingMd, modelsMd] = await Promise.all([
    fetchText(PRICING_MD),
    MODELS_MD ? fetchText(MODELS_MD) : Promise.resolve(""),
  ]);

  // Build model specs lookup from Anthropic API docs
  const modelSpecs = parseModelSpecs(modelsMd);

  // Parse pricing tables
  const lines = pricingMd.split("\n");
  let written = 0;

  for (const line of lines) {
    if (!line.trimStart().startsWith("|")) continue;
    // Skip headers/separators
    if (line.includes("Model") && line.includes("Input")) continue;
    if (/^\|\s*:?-/.test(line)) continue;

    const cells = line
      .split("|")
      .map((c) => c.replace(/\*\*/g, "").trim())
      .filter(Boolean);
    if (cells.length < 3) continue;

    const name = cells[0];
    if (!name.startsWith("MiniMax") && !name.startsWith("M2")) continue;

    const input = parseDollar(cells[1]);
    const output = parseDollar(cells[2]);
    const cachedRead = parseDollar(cells[3]);
    const cacheWrite = parseDollar(cells[4]);

    if (input == null || output == null) continue;

    const id = toId(name);
    const spec = modelSpecs.get(id);

    const entry: ModelEntry = {
      id,
      name,
      family: "minimax",
      license:
        /m2\.?[0-7]($|-)/i.test(id) && !/m2\.?7/i.test(id)
          ? "mit"
          : "proprietary",
      capabilities: { streaming: true, tool_call: true },
      pricing: {
        input,
        output,
        ...(cachedRead != null ? { cached_input: cachedRead } : {}),
        ...(cacheWrite != null ? { cache_write: cacheWrite } : {}),
      },
      ...(spec?.context_window != null
        ? { context_window: spec.context_window }
        : {}),
      ...(spec?.description ? { description: spec.description } : {}),
    };

    written += upsertWithSnapshot("minimax", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
