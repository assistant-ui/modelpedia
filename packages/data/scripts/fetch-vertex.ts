import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildPricing,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Google Vertex AI models.
 * Syncs Google Gemini models + adds partner models + Vertex-specific pricing.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const GOOGLE_DIR = path.join(ROOT, "providers", "google", "models");
const VERTEX_DIR = path.join(ROOT, "providers", "vertex", "models");
const sources = readSources("vertex");

// ── Vertex pricing parser ──

interface VertexPricing {
  input?: number;
  output?: number;
  cached_input?: number;
  batch_input?: number;
  batch_output?: number;
  tiers?: {
    label: string;
    unit: string;
    columns: string[];
    rows: { label: string; values: (number | null)[] }[];
  }[];
}

function normalizeModelKey(name: string): string {
  return name
    .replace(/\s+/g, "-")
    .replace(/Preview$/i, "preview")
    .replace(/Lite$/i, "lite")
    .toLowerCase();
}

/** Extract Gemini pricing rows from a table for a given tier label */
function parseGeminiTable(
  tableHtml: string,
): Map<string, { type: string; price: number }[]> {
  const models = new Map<string, { type: string; price: number }[]>();
  let current = "";

  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  for (const row of rows) {
    const cells = [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(
      (c) =>
        c[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
    );
    if (cells.length === 0) continue;

    // Model name row
    if (
      cells.length === 1 &&
      /^Gemini/i.test(cells[0]) &&
      !cells[0].includes("$")
    ) {
      current = normalizeModelKey(cells[0]);
      if (!models.has(current)) models.set(current, []);
      continue;
    }

    if (!current || cells.length < 2) continue;
    const price = cells[1]?.match(/\$([\d.]+)/);
    if (!price) continue;
    models.get(current)?.push({ type: cells[0], price: Number(price[1]) });
  }
  return models;
}

async function fetchVertexPricing(): Promise<Map<string, VertexPricing>> {
  if (!sources.pricing) return new Map();
  const res = await fetch(sources.pricing as string);
  const html = await res.text();
  const map = new Map<string, VertexPricing>();

  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];

  // Classify tables by tier heading
  const tierTables: { tier: string; table: string }[] = [];
  for (const table of tables) {
    const tableIdx = html.indexOf(table[0]);
    const before = html.slice(Math.max(0, tableIdx - 500), tableIdx);
    const headings = [...before.matchAll(/<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/g)];
    const heading =
      headings.length > 0
        ? headings[headings.length - 1][1].replace(/<[^>]+>/g, "").trim()
        : "";

    const text = table[1].replace(/<[^>]+>/g, " ").trim();
    if (!text.includes("Gemini") || !text.includes("$")) continue;
    if (/Grounding|Search|Cache Storage|fine-tuning|Embedding/i.test(heading))
      continue;

    let tier = "Standard";
    if (/Priority/i.test(heading)) tier = "Priority";
    else if (/Flex|Batch/i.test(heading)) tier = "Flex";
    else if (/Token-based/i.test(heading)) tier = "Standard";

    tierTables.push({ tier, table: table[1] });
  }

  // Parse each tier table
  for (const { tier, table } of tierTables) {
    const parsed = parseGeminiTable(table);
    for (const [modelKey, rows] of parsed) {
      const info = map.get(modelKey) || { tiers: [] };

      const inputRow = rows.find((r) => /input/i.test(r.type));
      const outputRow = rows.find((r) => /output/i.test(r.type));
      const cachedRow = rows.find((r) => /cach/i.test(r.type));

      // Set flat fields from Standard tier
      if (tier === "Standard") {
        if (inputRow) info.input = inputRow.price;
        if (outputRow) info.output = outputRow.price;
        if (cachedRow) info.cached_input = cachedRow.price;
      }
      if (tier === "Flex") {
        if (inputRow) info.batch_input = inputRow.price;
        if (outputRow) info.batch_output = outputRow.price;
      }

      // Build tier row
      if (!info.tiers) info.tiers = [];
      const existingSection = info.tiers.find((t) => t.label === "Text tokens");
      const tierRow = {
        label: tier,
        values: [
          inputRow?.price ?? null,
          cachedRow?.price ?? null,
          outputRow?.price ?? null,
        ],
      };

      if (existingSection) {
        if (!existingSection.rows.some((r) => r.label === tier)) {
          existingSection.rows.push(tierRow);
        }
      } else {
        info.tiers.push({
          label: "Text tokens",
          unit: "Per 1M tokens",
          columns: ["Input", "Cached input", "Output"],
          rows: [tierRow],
        });
      }

      map.set(modelKey, info);
    }
  }

  // Process Claude/Llama/Mistral tables (all-in-one cells)
  for (const table of tables) {
    const text = table[1].replace(/<[^>]+>/g, " ").trim();
    if (!/Claude|Llama|Mistral|Jamba/i.test(text)) continue;

    const rows = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    for (const row of rows) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
        (c) =>
          c[1]
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim(),
      );

      if (cells.length < 2) continue;
      const modelName = cells[0].trim();
      if (!modelName || /Model/i.test(modelName)) continue;

      const priceText = cells[1];
      const inputMatch = priceText.match(/Input:\s*\$([\d.]+)/i);
      const outputMatch = priceText.match(/Output:\s*\$([\d.]+)/i);
      const batchInMatch = priceText.match(/Batch Input:\s*\$([\d.]+)/i);
      const batchOutMatch = priceText.match(/Batch Output:\s*\$([\d.]+)/i);
      const cacheMatch = priceText.match(/Cache Hit:\s*\$([\d.]+)/i);

      if (!inputMatch && !outputMatch) continue;

      const id = modelName.replace(/\s+/g, "-").toLowerCase();
      const info: VertexPricing = {};
      if (inputMatch) info.input = Number(inputMatch[1]);
      if (outputMatch) info.output = Number(outputMatch[1]);
      if (batchInMatch) info.batch_input = Number(batchInMatch[1]);
      if (batchOutMatch) info.batch_output = Number(batchOutMatch[1]);
      if (cacheMatch) info.cached_input = Number(cacheMatch[1]);

      // Build tiers for partner models
      const tierRows: { label: string; values: (number | null)[] }[] = [];
      tierRows.push({
        label: "Standard",
        values: [
          info.input ?? null,
          info.cached_input ?? null,
          info.output ?? null,
        ],
      });
      if (info.batch_input != null || info.batch_output != null) {
        tierRows.push({
          label: "Batch",
          values: [info.batch_input ?? null, null, info.batch_output ?? null],
        });
      }
      info.tiers = [
        {
          label: "Text tokens",
          unit: "Per 1M tokens",
          columns: ["Input", "Cached input", "Output"],
          rows: tierRows,
        },
      ];

      map.set(id, info);
    }
  }

  return map;
}

/** Try to match a pricing entry to a model ID */
function lookupPricing(
  pricing: Map<string, VertexPricing>,
  modelId: string,
): VertexPricing | undefined {
  // Direct match
  if (pricing.has(modelId)) return pricing.get(modelId);
  // Fuzzy: strip version suffixes, try partial match
  for (const [key, val] of pricing) {
    if (modelId.startsWith(key) || key.startsWith(modelId)) return val;
  }
  return undefined;
}

// Partner models available on Vertex AI
const PARTNER_MODELS: ModelEntry[] = [
  {
    id: "claude-opus-4-6@vertex",
    name: "Claude Opus 4.6",
    created_by: "anthropic",
    family: "claude-opus",
    context_window: 1000000,
    max_output_tokens: 128000,
    capabilities: {
      streaming: true,
      vision: true,
      tool_call: true,
      reasoning: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: "claude-sonnet-4-6@vertex",
    name: "Claude Sonnet 4.6",
    created_by: "anthropic",
    family: "claude-sonnet",
    context_window: 1000000,
    max_output_tokens: 64000,
    capabilities: {
      streaming: true,
      vision: true,
      tool_call: true,
      reasoning: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: "claude-haiku-4-5@vertex",
    name: "Claude Haiku 4.5",
    created_by: "anthropic",
    family: "claude-haiku",
    context_window: 200000,
    max_output_tokens: 64000,
    capabilities: {
      streaming: true,
      vision: true,
      tool_call: true,
      reasoning: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: "mistral-medium-3@vertex",
    name: "Mistral Medium 3",
    created_by: "mistral",
    family: "mistral-medium",
    capabilities: { streaming: true, tool_call: true },
    modalities: { input: ["text"], output: ["text"] },
  },
  {
    id: "jamba-1.5-large@vertex",
    name: "Jamba 1.5 Large",
    created_by: "ai21",
    capabilities: { streaming: true },
    modalities: { input: ["text"], output: ["text"] },
  },
  {
    id: "jamba-1.5-mini@vertex",
    name: "Jamba 1.5 Mini",
    created_by: "ai21",
    capabilities: { streaming: true },
    modalities: { input: ["text"], output: ["text"] },
  },
];

async function main() {
  console.log("Syncing Vertex AI models...");
  fs.mkdirSync(VERTEX_DIR, { recursive: true });

  // Fetch Vertex-specific pricing
  const pricing = await fetchVertexPricing();
  console.log(`Fetched ${pricing.size} Vertex pricing entries`);

  let written = 0;

  // Sync Google Gemini models with Vertex pricing
  if (fs.existsSync(GOOGLE_DIR)) {
    const files = fs.readdirSync(GOOGLE_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const google = JSON.parse(
        fs.readFileSync(path.join(GOOGLE_DIR, file), "utf-8"),
      );

      // Build entry from Google model data (without Google pricing)
      const entry: ModelEntry = {
        id: google.id,
        name: google.name,
        created_by: google.created_by ?? "google",
        family: google.family,
        description: google.description,
        tagline: google.tagline,
        status: google.status,
        model_type: google.model_type,
        context_window: google.context_window,
        max_output_tokens: google.max_output_tokens,
        knowledge_cutoff: google.knowledge_cutoff,
        release_date: google.release_date,
        deprecation_date: google.deprecation_date,
        successor: google.successor,
        capabilities: google.capabilities,
        modalities: google.modalities,
        tools: google.tools,
        endpoints: google.endpoints,
        reasoning_tokens: google.reasoning_tokens,
        performance: google.performance,
        reasoning: google.reasoning,
        speed: google.speed,
      };

      // Add Vertex-specific pricing
      const vertexPrice = lookupPricing(pricing, google.id);
      if (vertexPrice) entry.pricing = buildPricing(vertexPrice);

      if (upsertModel("vertex", entry)) written++;
    }
    console.log(`Synced ${written} Gemini models from google provider`);
  }

  // Add partner models with Vertex pricing
  for (const entry of PARTNER_MODELS) {
    const vertexPrice = lookupPricing(
      pricing,
      entry.name.toLowerCase().replace(/\s+/g, "-"),
    );
    if (vertexPrice) entry.pricing = buildPricing(vertexPrice);
    written += upsertWithSnapshot("vertex", entry);
  }

  console.log(`Wrote ${written} total models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
