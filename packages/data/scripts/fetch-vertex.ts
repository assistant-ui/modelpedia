import * as fs from "node:fs";
import * as path from "node:path";
import { fetchText } from "./parse.ts";
import {
  buildPricing,
  inferParameters,
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

function cellText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Model names in the first column carry footnote stars, validity windows
 * ("through <date>", "(Starting <date>)") and several comma separated models
 * sharing one price row. Returns the keys of the models priced right now.
 */
function resolveModelKeys(cell: string, now = Date.now()): string[] {
  let name = cell.replace(/\[\d+\]/g, "").replace(/\*+/g, "");
  const through = name.match(/through\s+([A-Z][a-z]+ \d{1,2}, \d{4})/);
  if (through) {
    if (now > Date.parse(through[1]) + 86_400_000) return [];
    name = name.replace(through[0], "");
  }
  const starting = name.match(/\(?Starting\s+([A-Z][a-z]+ \d{1,2}, \d{4})\)?/);
  if (starting) {
    if (now < Date.parse(starting[1])) return [];
    name = name.replace(starting[0], "");
  }
  return name
    .replace(/\([^)]*\)/g, "")
    .split(",")
    .map((n) => n.trim())
    .filter((n) => /^Gemini/i.test(n))
    .map(normalizeModelKey);
}

/**
 * Extract Gemini pricing rows from a table. Columns are
 * Model | Type | [Region] | price columns; the model, type and region cells
 * are blank on continuation rows. Global prices win over non-global ones.
 */
function parseGeminiTable(
  tableHtml: string,
): Map<string, { type: string; price: number }[]> {
  const models = new Map<string, { type: string; price: number }[]>();
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map(
    (row) =>
      [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) =>
        cellText(c[1]),
      ),
  );
  const header = rows[0];
  if (!header || !/^Model$/i.test(header[0]) || !/^Type$/i.test(header[1]))
    return models;

  const regionIdx = header.findIndex((h) => /^Region$/i.test(h));
  const firstPrice = Math.max(1, regionIdx) + 1;
  const priceIdx = header.findIndex(
    (h, i) => i >= firstPrice && !h.includes(">"),
  );
  const cachedIdx = header.findIndex(
    (h, i) =>
      i >= firstPrice &&
      /cach/i.test(h) &&
      !/write/i.test(h) &&
      !h.includes(">"),
  );
  if (priceIdx === -1) return models;

  const priceOf = (cell: string | undefined) => {
    const m = cell?.match(/\$([\d.]+)/);
    return m ? Number(m[1]) : undefined;
  };

  const tagged = new Map<
    string,
    { type: string; price: number; global: boolean }[]
  >();
  let current: string[] = [];
  let type = "";
  let region = "";
  for (const cells of rows.slice(1)) {
    if (cells.length !== header.length) continue;
    if (cells[0]) current = resolveModelKeys(cells[0]);
    if (cells[1]) type = cells[1];
    if (regionIdx !== -1 && cells[regionIdx]) region = cells[regionIdx];
    const price = priceOf(cells[priceIdx]);
    if (price == null || current.length === 0) continue;

    const global = regionIdx === -1 || !/non-global/i.test(region);
    const cached = cachedIdx === -1 ? undefined : priceOf(cells[cachedIdx]);
    for (const key of current) {
      const list = tagged.get(key) ?? [];
      list.push({ type, price, global });
      if (cached != null)
        list.push({ type: "Cache read", price: cached, global });
      tagged.set(key, list);
    }
  }

  for (const [key, list] of tagged) {
    const preferred = list.some((r) => r.global)
      ? list.filter((r) => r.global)
      : list;
    models.set(
      key,
      preferred.map(({ type, price }) => ({ type, price })),
    );
  }
  return models;
}

async function fetchVertexPricing(): Promise<Map<string, VertexPricing>> {
  if (!sources.pricing) return new Map();
  const html = await fetchText(sources.pricing as string);
  const map = new Map<string, VertexPricing>();

  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];

  // Each pricing block has a tab group (Standard / Priority / Flex or Batch)
  // above its tables, one table per tab in order. Tables beyond the tab count
  // (grounding, tooling) and tabs for other pricing modes are skipped.
  const tabs = [
    ...html.matchAll(
      /track-name="pricing table tab"[^>]*?track-metadata-eventdetail="([^"]*)"/g,
    ),
  ].map((m) => ({ idx: m.index!, label: m[1] }));
  const groups: { idx: number; labels: string[] }[] = [];
  for (const [i, tab] of tabs.entries()) {
    const prev = tabs[i - 1];
    const sameGroup =
      prev && !tables.some((t) => t.index! > prev.idx && t.index! < tab.idx);
    if (sameGroup) groups[groups.length - 1].labels.push(tab.label);
    else groups.push({ idx: tab.idx, labels: [tab.label] });
  }

  const tierTables: { tier: string; table: string }[] = [];
  for (const [g, group] of groups.entries()) {
    const end = groups[g + 1]?.idx ?? Infinity;
    const inGroup = tables.filter(
      (t) => t.index! > group.idx && t.index! < end,
    );
    for (const [k, table] of inGroup.entries()) {
      const label = group.labels[k];
      if (!label) break;
      let tier: string;
      if (/priority/i.test(label)) tier = "Priority";
      else if (/flex|batch/i.test(label)) tier = "Flex";
      else if (/standard|token-based/i.test(label)) tier = "Standard";
      else continue;
      tierTables.push({ tier, table: table[1] });
    }
  }

  // Parse each tier table
  for (const { tier, table } of tierTables) {
    const parsed = parseGeminiTable(table);
    for (const [modelKey, rows] of parsed) {
      const info = map.get(modelKey) || { tiers: [] };

      const inputRow = rows.find((r) => /input/i.test(r.type));
      const outputRow = rows.find((r) => /output/i.test(r.type));
      const cachedRow = rows.find(
        (r) => /cach/i.test(r.type) && !/storage/i.test(r.type),
      );

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

      if (!inputRow && !outputRow && !cachedRow) continue;

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
  let best: string | undefined;
  for (const key of pricing.keys()) {
    if (modelId.startsWith(key) && (!best || key.length > best.length))
      best = key;
  }
  return best === undefined ? undefined : pricing.get(best);
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
  if (pricing.size === 0) {
    throw new Error(
      "vertex: parsed 0 pricing entries; the pricing page structure likely changed",
    );
  }
  if (![...pricing.keys()].some((k) => k.startsWith("gemini"))) {
    throw new Error(
      "vertex: parsed 0 Gemini pricing entries; the Gemini pricing table structure likely changed",
    );
  }
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
      const params = inferParameters(google.id);
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
        license: google.license,
        parameters: google.parameters ?? params?.parameters,
        active_parameters:
          google.active_parameters ?? params?.active_parameters,
        architecture: google.architecture,
        open_weight: google.open_weight,
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
    const params = inferParameters(entry.id);
    if (params) {
      entry.parameters = params.parameters;
      if (params.active_parameters)
        entry.active_parameters = params.active_parameters;
    }
    written += upsertWithSnapshot("vertex", entry);
  }

  console.log(`Wrote ${written} total models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
