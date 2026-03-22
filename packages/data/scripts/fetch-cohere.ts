import { fetchText, stripHtml } from "./parse.ts";
import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Cohere models from docs.cohere.com/docs/models.
 * No API key required — scrapes the public docs page.
 */

const sources = readSources("cohere");

// ── Fetch pricing from cohere.com/pricing ──

async function fetchPricing(): Promise<
  Map<string, { input: number; output: number }>
> {
  const map = new Map<string, { input: number; output: number }>();
  if (!sources.pricing) return map;

  const html = await fetchText(sources.pricing as string);
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Extract "Model pricing is $X/1M tokens for input and $Y/1M tokens for output"
  const matches = [
    ...text.matchAll(
      /([\w\s+-]+?)(?:pricing is|charged at|costs?) \$([\d.]+)\/1M tokens for input and \$([\d.]+)\/1M tokens for output/gi,
    ),
  ];

  for (const m of matches) {
    const name = m[1].trim();
    const input = Number(m[2]);
    const output = Number(m[3]);
    if (!name || name === "on the API are") continue;

    // Normalize name to model ID format
    const id = name
      .toLowerCase()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "");
    map.set(id, { input, output });
  }

  return map;
}

/** Match a model ID to a pricing entry */
function lookupPricing(
  pricing: Map<string, { input: number; output: number }>,
  modelId: string,
): { input: number; output: number } | undefined {
  // Direct match
  if (pricing.has(modelId)) return pricing.get(modelId);
  // Model ID starts with pricing key (e.g. "command-r-plus-08-2024" starts with "command-r+-08-2024")
  // Sort by key length descending so longer (more specific) keys match first
  const sorted = [...pricing.entries()].sort(
    (a, b) => b[0].length - a[0].length,
  );
  for (const [key, val] of sorted) {
    if (modelId.startsWith(key)) return val;
  }
  // Aya models share pricing
  if (modelId.includes("aya-expanse") || modelId.includes("aya-vision")) {
    for (const [key, val] of pricing) {
      if (key.includes("aya")) return val;
    }
  }
  return undefined;
}
const DOCS_URL = sources.docs as string;

function parseTokenCount(s: string): number | undefined {
  const m = s.match(/(\d+)[kK]/);
  if (m) return parseInt(m[1], 10) * 1000;
  const n = parseInt(s.replace(/,/g, ""), 10);
  return Number.isNaN(n) ? undefined : n;
}

function parseModels(html: string) {
  const models: ModelEntry[] = [];

  // Parse all HTML tables and process each row
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];

  for (const table of tables) {
    // We need raw cell HTML to extract <code> tags, so parse rows manually
    // but use parseHtmlTable for stripped-text cells
    const rowMatches = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

    for (const rowMatch of rowMatches) {
      const row = rowMatch[1];

      // Extract raw <td> contents (need HTML for <code> extraction)
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

      // Skip alias models (unversioned names that point to a dated variant)
      if (
        id === "command-r" ||
        id === "command-r-plus" ||
        id === "command" ||
        id === "command-light"
      )
        continue;

      // Table columns vary but typically:
      // Model Name | Status | Description | Modality | Context Length | Max Output | Endpoints
      const status = stripHtml(tds[1]).toLowerCase();
      const description = stripHtml(tds[2]);
      const modality = stripHtml(tds[3]).toLowerCase();
      const contextStr = stripHtml(tds[4]);
      const maxOutputStr = tds[5] ? stripHtml(tds[5]) : "";
      const endpointStr = tds[6] ? stripHtml(tds[6]) : "";

      const context_window = parseTokenCount(contextStr);
      const max_output_tokens = parseTokenCount(maxOutputStr);

      const isDeprecated =
        status.includes("deprecated") || status.includes("end-of-life");

      // Extract deprecation date from status (e.g. "Deprecated on September 15, 2025")
      let deprecation_date: string | undefined;
      if (isDeprecated) {
        const dateMatch = status.match(
          /(?:on|by)\s+([a-z]+\s+\d{1,2},?\s+\d{4})/i,
        );
        if (dateMatch) deprecation_date = dateMatch[1];
      }

      // Extract endpoints
      const endpoints: string[] = [];
      const epLower = endpointStr.toLowerCase();
      if (epLower.includes("chat")) endpoints.push("chat");
      if (epLower.includes("embed")) endpoints.push("embed");
      if (epLower.includes("rerank")) endpoints.push("rerank");
      if (epLower.includes("classify")) endpoints.push("classify");

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

      // Successor for deprecated models
      let successor: string | undefined;
      if (isDeprecated) {
        if (id.includes("command-r-plus")) successor = "command-r-plus-08-2024";
        else if (id.includes("command-r-0")) successor = "command-r-08-2024";
        else if (id === "command-nightly" || id === "command-light-nightly")
          successor = "command-a-03-2025";
      }

      models.push({
        id,
        name: id,
        family: inferFamily(id),
        description: description || undefined,
        status: isDeprecated ? "deprecated" : "active",
        deprecation_date: deprecation_date,
        successor,
        capabilities,
        modalities: { input: inputMods, output: ["text"] },
        context_window,
        max_output_tokens,
        ...(endpoints.length > 0 ? { endpoints } : {}),
      });
    }
  }

  return models;
}

async function main() {
  console.log("Fetching Cohere models from docs...");

  const html = await fetchText(DOCS_URL);
  console.log(`Page size: ${(html.length / 1024).toFixed(0)}KB`);

  const models = parseModels(html);
  console.log(`Parsed ${models.length} models`);

  // Fetch pricing from pricing page
  const pricing = await fetchPricing();
  console.log(`Fetched ${pricing.size} pricing entries`);

  let written = 0;
  for (const m of models) {
    const price = lookupPricing(pricing, m.id);
    if (price) {
      m.pricing = { input: price.input, output: price.output };
    }
    if (upsertWithSnapshot("cohere", m)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
