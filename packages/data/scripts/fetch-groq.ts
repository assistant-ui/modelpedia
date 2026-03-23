import { fetchText, findHtmlTables, stripHtml } from "./parse.ts";
import {
  inferFamily,
  inferParameters,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Groq models from public docs pages (no API key needed).
 * 1. Models page — specs, pricing, context windows
 * 2. Deprecations page — shutdown dates
 *
 * Groq is an inference platform hosting models from various providers.
 */

const sources = readSources("groq");
const MODELS_URL = sources.models as string;
const DEPRECATIONS_URL = sources.deprecations as string;

// ── HTML parsing helpers ──

function parseNumber(s: string): number | undefined {
  const n = Number.parseInt(s.replace(/,/g, ""), 10);
  return Number.isNaN(n) ? undefined : n;
}

function parsePricing(
  s: string,
): { input: number; output: number } | undefined {
  // "$0.05 input$0.08 output"
  const m = s.match(/\$([\d.]+)\s*input\s*\$([\d.]+)\s*output/);
  if (m) return { input: Number(m[1]), output: Number(m[2]) };
  return undefined;
}

interface DocsModel {
  id: string;
  name: string;
  speed?: number;
  pricing?: { input: number; output: number };
  context_window?: number;
  max_output_tokens?: number;
  category: "production" | "system" | "preview";
}

// ── Parse models from docs HTML tables ──

const SECTION_CATEGORIES: Record<string, DocsModel["category"]> = {
  "Production Models": "production",
  "Production Systems": "system",
  "Preview Models": "preview",
};

function parseModelTables(html: string): DocsModel[] {
  const models: DocsModel[] = [];

  const tables = findHtmlTables(html);

  for (const table of tables) {
    // Find position of table in original HTML for heading lookup
    const tablePos = html.indexOf(table.raw);

    // Look back for section heading
    const headingChunk = html.slice(Math.max(0, tablePos - 2000), tablePos);
    const headings = [
      ...headingChunk.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g),
    ];
    const heading =
      headings.length > 0 ? stripHtml(headings[headings.length - 1][1]) : "";
    const category = SECTION_CATEGORIES[heading];
    if (!category) continue; // Not a model table

    // Parse rows from raw HTML (need raw cell HTML for font-mono extraction)
    const rowMatches = [...table.raw.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];

    for (const row of rowMatches.slice(1)) {
      // skip header
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
        (m) => m[1],
      );
      if (cells.length < 6) continue;

      // Model ID from font-mono element
      const idMatch = cells[0].match(/font-mono[^>]*>([^<]+)</);
      if (!idMatch) continue;
      const id = idMatch[1].trim();

      // Display name: full cell text minus the model ID
      const fullText = stripHtml(cells[0]);
      const name = fullText.replace(id, "").trim() || id;

      const speed = parseNumber(stripHtml(cells[1]));
      const pricing = parsePricing(stripHtml(cells[2]));
      const context_window = parseNumber(stripHtml(cells[4]));
      const max_output_tokens = parseNumber(stripHtml(cells[5]));

      models.push({
        id,
        name,
        speed,
        pricing,
        context_window,
        max_output_tokens,
        category,
      });
    }
  }

  return models;
}

// ── Parse deprecations ──

function parseDate(s: string): string | undefined {
  // "03/09/26" → "2026-03-09", "12/18/24" → "2024-12-18", "1/6/25" → "2025-01-06"
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return undefined;
  const mm = m[1].padStart(2, "0");
  const dd = m[2].padStart(2, "0");
  const yy = m[3].length === 4 ? m[3] : `20${m[3]}`;
  return `${yy}-${mm}-${dd}`;
}

function parseDeprecations(html: string): Map<string, string> {
  const deprecations = new Map<string, string>();

  for (const table of findHtmlTables(html)) {
    for (const row of table.rows.slice(1)) {
      if (row.length < 2) continue;

      const modelId = row[0];
      const shutdownDate = parseDate(row[1]);
      if (modelId && shutdownDate) {
        deprecations.set(modelId, shutdownDate);
      }
    }
  }

  return deprecations;
}

// ── Inference helpers ──

const CREATOR_PREFIXES: [RegExp, string][] = [
  [/^meta-llama\//, "meta"],
  [/^openai\//, "openai"],
  [/^groq\//, "groq"],
  [/^moonshotai\//, "moonshot"],
  [/^canopylabs\//, "canopy-labs"],
  [/^qwen\//, "alibaba"],
  [/^llama/i, "meta"],
  [/^gpt-oss|^whisper|^distil-whisper/i, "openai"],
  [/^compound/i, "groq"],
  [/^gemma/i, "google"],
  [/^mistral|^mixtral/i, "mistral"],
  [/^deepseek/i, "deepseek"],
  [/^qwen/i, "alibaba"],
];

function inferCreatedBy(id: string): string {
  for (const [re, creator] of CREATOR_PREFIXES) {
    if (re.test(id)) return creator;
  }
  return "groq";
}

function inferModelType(id: string): string {
  if (/whisper|distil-whisper/i.test(id)) return "transcription";
  if (/tts|orpheus/i.test(id)) return "tts";
  if (/guard|safeguard|prompt-guard/i.test(id)) return "moderation";
  if (/embed/i.test(id)) return "embed";
  return "chat";
}

function inferModalities(id: string): { input: string[]; output: string[] } {
  if (/whisper|distil-whisper/i.test(id))
    return { input: ["audio"], output: ["text"] };
  if (/tts|orpheus/i.test(id)) return { input: ["text"], output: ["audio"] };
  if (/vision|scout/i.test(id))
    return { input: ["text", "image"], output: ["text"] };
  return { input: ["text"], output: ["text"] };
}

function inferCapabilities(id: string): Record<string, boolean> {
  const type = inferModelType(id);
  if (type !== "chat") return {};

  const caps: Record<string, boolean> = { streaming: true };

  if (!/preview|guard|safeguard|prompt-guard/i.test(id)) {
    caps.tool_call = true;
    caps.json_mode = true;
  }

  return caps;
}

// ── Main ──

async function main() {
  console.log("Fetching Groq models from docs...");

  const [modelsHtml, deprecationsHtml] = await Promise.all([
    fetchText(MODELS_URL),
    fetchText(DEPRECATIONS_URL),
  ]);

  const models = parseModelTables(modelsHtml);
  const deprecations = parseDeprecations(deprecationsHtml);
  console.log(
    `Parsed ${models.length} models, ${deprecations.size} deprecations`,
  );

  let written = 0;
  for (const m of models) {
    const deprecationDate = deprecations.get(m.id);

    const params = inferParameters(m.id);

    const entry: ModelEntry = {
      id: m.id,
      name: m.name,
      created_by: inferCreatedBy(m.id),
      family: inferFamily(m.id),
      model_type: inferModelType(m.id),
      status: m.category === "preview" ? "preview" : "active",
      context_window: m.context_window,
      max_output_tokens: m.max_output_tokens,
      modalities: inferModalities(m.id),
      capabilities: inferCapabilities(m.id),
      speed: m.speed,
      parameters: params?.parameters,
      active_parameters: params?.active_parameters,
      page_url: `${MODELS_URL}#${m.id}`,
    };

    if (deprecationDate) {
      entry.status = "deprecated";
      entry.deprecation_date = deprecationDate;
    }

    if (m.pricing) {
      entry.pricing = m.pricing;
    }

    written += upsertWithSnapshot("groq", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
