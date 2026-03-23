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
 * Fetch Alibaba Cloud Model Studio (Qwen) models from docs.
 * No API key needed — .md endpoint.
 */

const sources = readSources("alibaba");
const DOCS_MD = sources.docs as string;
// Derive the HTML page URL from the .md endpoint
const PAGE_URL = DOCS_MD.replace(/\.md$/, "");

async function main() {
  console.log("Fetching Alibaba Cloud models from docs...");

  const md = await fetchText(DOCS_MD);

  // Split by ### headings to get per-model sections
  const parts = md.split(/^###\s+/m);
  let written = 0;
  const seen = new Set<string>();

  for (const part of parts) {
    const tableMatch = part.match(/<table>([\s\S]*?)<\/table>/);
    if (!tableMatch) continue;

    // Extract section description: text between heading and first table
    const beforeTable = part.slice(0, tableMatch.index);
    const descriptionText = beforeTable
      .replace(/^[^\n]*\n/, "") // drop heading title line
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const sectionDescription =
      descriptionText.length > 10 ? descriptionText : undefined;

    const rows = [...tableMatch[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)];

    for (const row of rows) {
      const cells = [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map((c) =>
        c[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      );

      if (cells.length < 3) continue;

      // Find model ID (starts with qwen, qwq, wan, wanx)
      const modelId = cells[0].match(
        /(qwen[\w.-]+|qwq[\w.-]*|wanx?[\w.-]+)/i,
      )?.[1];
      if (!modelId) continue;
      // Skip snapshots and latest pointers
      if (
        modelId.includes("latest") ||
        /-\d{4}-\d{2}-\d{2}/.test(modelId) ||
        seen.has(modelId)
      )
        continue;
      seen.add(modelId);

      // Extract pricing (columns with exactly "$X.XX" format)
      const prices = cells
        .map((c) => c.match(/^\$([\d.]+)$/)?.[1])
        .filter(Boolean)
        .map(Number);
      const input = prices.length >= 2 ? prices[0] : undefined;
      const output = prices.length >= 2 ? prices[1] : undefined;

      // Extract context window (large number in a cell)
      let context_window: number | undefined;
      for (const c of cells) {
        const num = Number(c.replace(/,/g, ""));
        if (num >= 1000 && !c.includes("$")) {
          context_window = num;
          break;
        }
      }

      // Extract max output tokens
      let max_output_tokens: number | undefined;
      // Usually the column after context window
      const ctxIdx = cells.findIndex(
        (c) => Number(c.replace(/,/g, "")) >= 1000 && !c.includes("$"),
      );
      if (ctxIdx >= 0 && ctxIdx + 2 < cells.length) {
        // Skip max input column, get max output
        const outVal = Number(cells[ctxIdx + 2]?.replace(/,/g, ""));
        if (outVal > 0 && outVal < 1_000_000) max_output_tokens = outVal;
      }

      // Detect capabilities from model ID and cell text
      const allText = cells.join(" ").toLowerCase();
      const capabilities: Record<string, boolean> = { streaming: true };
      if (allText.includes("tool") || allText.includes("agent"))
        capabilities.tool_call = true;
      if (
        allText.includes("vision") ||
        allText.includes("image") ||
        modelId.includes("vl") ||
        modelId.includes("vision")
      )
        capabilities.vision = true;
      if (allText.includes("thinking") || modelId.includes("qwq"))
        capabilities.reasoning = true;

      // Detect modalities
      const inputMods: string[] = ["text"];
      if (capabilities.vision) inputMods.push("image");
      if (modelId.includes("omni") || allText.includes("audio"))
        inputMods.push("audio");
      if (modelId.includes("vl") || allText.includes("video"))
        inputMods.push("video");
      const outputMods: string[] = ["text"];
      if (allText.includes("audio output")) outputMods.push("audio");

      // Infer parameter counts from model ID (e.g. 72b, 235b-a22b)
      const params = inferParameters(modelId);

      const entry: ModelEntry = {
        id: modelId,
        name: modelId,
        created_by: "qwen",
        family: inferFamily(modelId),
        description: sectionDescription,
        page_url: PAGE_URL,
        license:
          /^qwen-(max|plus|turbo|vl-max|vl-plus|long|math|omni-turbo)/i.test(
            modelId,
          ) || /^qwen3\.5-(plus|max)/i.test(modelId)
            ? "proprietary"
            : /^(qwen|qwq)/i.test(modelId)
              ? "apache-2.0"
              : "proprietary",
        context_window,
        max_output_tokens,
        ...(params ?? {}),
        capabilities,
        modalities: { input: inputMods, output: outputMods },
        endpoints: ["chat"],
      };

      if (input != null && output != null) {
        entry.pricing = { input, output };
      }

      written += upsertWithSnapshot("alibaba", entry);
    }
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
