import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Cohere models from docs.cohere.com/docs/models.
 * No API key required — scrapes the public docs page.
 */

const DOCS_URL = "https://docs.cohere.com/docs/models";

function stripHtml(s: string): string {
  return s.replace(/<[^>]*>/g, "").trim();
}

function parseTokenCount(s: string): number | undefined {
  const m = s.match(/(\d+)[kK]/);
  if (m) return parseInt(m[1], 10) * 1000;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isNaN(n) ? undefined : n;
}

function parseModels(html: string) {
  const models: ModelEntry[] = [];

  // Find all table rows: <tr>...<td>...</td>...</tr>
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const row = rowMatch[1];

    // Extract all <td> contents
    const tds: string[] = [];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let tdMatch;
    while ((tdMatch = tdRegex.exec(row)) !== null) {
      tds.push(tdMatch[1]);
    }

    if (tds.length < 5) continue;

    // Find model ID in <code> tag in first column
    const codeMatch = tds[0].match(/<code[^>]*>([^<]+)<\/code>/);
    if (!codeMatch) continue;

    const id = codeMatch[1].trim();

    // Skip non-chat models (embed, rerank) and alias models
    if (id.startsWith("embed") || id.startsWith("rerank")) continue;
    if (
      id === "command-r" ||
      id === "command-r-plus" ||
      id === "command" ||
      id === "command-light"
    )
      continue;

    // Table: Model Name | Status | Description | Modality | Context Length | Max Output | Endpoints
    const status = stripHtml(tds[1]).toLowerCase();
    const description = stripHtml(tds[2]);
    const modality = stripHtml(tds[3]).toLowerCase();
    const contextStr = stripHtml(tds[4]);
    const maxOutputStr = tds[5] ? stripHtml(tds[5]) : "";

    const context_window = parseTokenCount(contextStr);
    const max_output_tokens = parseTokenCount(maxOutputStr);

    const isDeprecated =
      status.includes("deprecated") || status.includes("end-of-life");

    // Capabilities from description
    const descLower = description.toLowerCase();
    const capabilities: Record<string, boolean> = { streaming: true };
    if (descLower.includes("tool")) capabilities.tool_call = true;
    if (descLower.includes("vision") || descLower.includes("image"))
      capabilities.vision = true;
    if (descLower.includes("reason")) capabilities.reasoning = true;
    if (descLower.includes("structured") || descLower.includes("json"))
      capabilities.structured_output = true;

    // Modalities
    const inputMods: string[] = ["text"];
    if (
      capabilities.vision ||
      modality.includes("image") ||
      modality.includes("vision")
    ) {
      inputMods.push("image");
    }

    models.push({
      id,
      name: id,
      family: inferFamily(id),
      description: description || undefined,
      status: isDeprecated ? "deprecated" : "active",
      capabilities,
      modalities: { input: inputMods, output: ["text"] },
      context_window,
      max_output_tokens,
    });
  }

  return models;
}

async function main() {
  console.log("Fetching Cohere models from docs...");

  const res = await fetch(DOCS_URL);
  if (!res.ok) throw new Error(`Failed to fetch Cohere docs: ${res.status}`);

  const html = await res.text();
  console.log(`Page size: ${(html.length / 1024).toFixed(0)}KB`);

  const models = parseModels(html);
  console.log(`Parsed ${models.length} models`);

  let written = 0;
  for (const m of models) {
    if (upsertWithSnapshot("cohere", m)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
