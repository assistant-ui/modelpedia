import { fetchText } from "./parse.ts";
import {
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch MiniMax models from their docs .md endpoints.
 * No API key needed.
 */

const sources = readSources("minimax");
const PRICING_MD = sources.pricing as string;

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

async function main() {
  console.log("Fetching MiniMax models from docs...");

  const md = await fetchText(PRICING_MD);

  // Parse pricing tables
  const lines = md.split("\n");
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

    if (input == null || output == null) continue;

    const id = name.toLowerCase().replace(/\s+/g, "-");

    const entry: ModelEntry = {
      id,
      name,
      family: "minimax",
      capabilities: { streaming: true, tool_call: true },
      pricing: {
        input,
        output,
        ...(cachedRead != null ? { cached_input: cachedRead } : {}),
      },
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
