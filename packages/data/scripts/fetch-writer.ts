import {
  buildPricing,
  envOrNull,
  fetchCached,
  type ModelEntry,
  parseMarkdownTable,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Writer Palmyra models.
 *
 * Source: dev.writer.com publishes a clean markdown mirror of the model
 * comparison page at /home/models.md. The table is comparison-style — one
 * column per model — so we transpose it into per-model entries.
 *
 * The /v1/models REST endpoint exists but only returns id+name, so we use it
 * (when an API key is set) just as a sanity check on the live id list.
 */

const sources = readSources("writer");
const MODELS_MD = sources.models as string;
const LIST_API = sources.list_models_api as string | undefined;

interface ParsedModel {
  api_id: string;
  display_name: string;
  description?: string;
  bedrock_id?: string;
  context_window?: number;
  max_output_tokens?: number;
  pricing_input?: number;
  pricing_output?: number;
  pricing_notes?: string;
}

function parseTokenCount(s: string): number | undefined {
  const cleaned = s.replace(/<[^>]+>/g, "").trim();
  const m = cleaned.match(/([\d,.]+)\s*([MmKk])/);
  if (!m) return undefined;
  const num = Number(m[1].replace(/,/g, ""));
  return m[2].toLowerCase() === "m" ? num * 1_000_000 : num * 1_000;
}

function parseTokenLimit(s: string): number | undefined {
  const cleaned = s.replace(/<[^>]+>/g, "").trim();
  const m = cleaned.match(/([\d,]+)/);
  return m ? Number(m[1].replace(/,/g, "")) : undefined;
}

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

function unbacktick(s: string): string {
  return s.replace(/`/g, "").trim();
}

function parseModelsMarkdown(md: string): ParsedModel[] {
  const lines = md.split("\n");
  const tableLines: string[] = [];
  let inTable = false;
  for (const line of lines) {
    if (line.startsWith("| Feature")) inTable = true;
    if (inTable) {
      if (line.startsWith("|")) tableLines.push(line);
      else if (tableLines.length > 0) break;
    }
  }
  if (tableLines.length === 0) return [];

  const rows = parseMarkdownTable(tableLines);
  if (rows.length < 2) return [];

  const header = rows[0];
  const colCount = header.length - 1;
  const cols: ParsedModel[] = Array.from({ length: colCount }, (_, j) => ({
    api_id: "",
    display_name: header[j + 1].trim(),
  }));

  for (const row of rows.slice(1)) {
    const feature = row[0].trim();
    for (let j = 0; j < colCount; j++) {
      const val = row[j + 1] ?? "";
      const m = cols[j];
      if (!val || val === "N/A") continue;

      if (feature === "Description") {
        m.description = val;
      } else if (feature.includes("API model ID")) {
        m.api_id = unbacktick(val);
      } else if (feature.includes("Bedrock model ID")) {
        m.bedrock_id = unbacktick(val);
      } else if (feature.includes("Pricing (Input)")) {
        m.pricing_input = parseDollar(val);
      } else if (feature.includes("Pricing (Output)")) {
        const dollars = parseDollar(val);
        if (dollars != null) m.pricing_output = dollars;
        else m.pricing_notes = val;
      } else if (feature.includes("Context window")) {
        m.context_window = parseTokenCount(val);
      } else if (feature.includes("Max output")) {
        m.max_output_tokens = parseTokenLimit(val);
      }
    }
  }

  return cols.filter((c) => c.api_id);
}

const FAMILY: Record<string, string> = {
  "palmyra-x5": "palmyra-x",
  "palmyra-x4": "palmyra-x",
  "palmyra-x-003-instruct": "palmyra-x",
  "palmyra-vision": "palmyra-vision",
  "palmyra-med": "palmyra-med",
  "palmyra-fin": "palmyra-fin",
  "palmyra-creative": "palmyra-creative",
};

const RELEASE_DATE: Record<string, string> = {
  "palmyra-x5": "2025-04-28",
  "palmyra-x4": "2024-10-09",
  "palmyra-med": "2024-07-31",
  "palmyra-fin": "2024-07-31",
  "palmyra-creative": "2024-12-17",
};

const ACTIVE_IDS = new Set(["palmyra-x5", "palmyra-x4"]);
const DEPRECATION_DATE = "2026-07-13";

function buildEntry(m: ParsedModel): ModelEntry {
  const isActive = ACTIVE_IDS.has(m.api_id);
  const isVision = m.api_id === "palmyra-vision";
  const hasVision = isVision || m.api_id === "palmyra-x5";

  const capabilities: Record<string, boolean> = { streaming: true };
  if (hasVision) capabilities.vision = true;
  if (m.api_id === "palmyra-x5" || m.api_id === "palmyra-x4") {
    capabilities.tool_call = true;
    capabilities.structured_output = true;
    capabilities.json_mode = true;
  }

  const modalities = isVision
    ? {
        input: ["text", "image", "video"] as string[],
        output: ["text"] as string[],
      }
    : hasVision
      ? { input: ["text", "image"] as string[], output: ["text"] as string[] }
      : { input: ["text"] as string[], output: ["text"] as string[] };

  const entry: ModelEntry = {
    id: m.api_id,
    name: m.display_name,
    family: FAMILY[m.api_id] ?? "palmyra-x",
    description: m.description,
    status: isActive ? "active" : "deprecated",
    model_type: "chat",
    license: "proprietary",
    open_weight: false,
    capabilities,
    modalities,
    endpoints: isVision ? ["vision"] : ["chat_completions"],
    context_window: m.context_window,
    max_output_tokens: m.max_output_tokens,
    page_url: "https://dev.writer.com/home/models",
  };

  if (RELEASE_DATE[m.api_id]) entry.release_date = RELEASE_DATE[m.api_id];
  if (!isActive) {
    entry.deprecation_date = DEPRECATION_DATE;
    entry.successor = "palmyra-x5";
  }
  if (m.bedrock_id) entry.bedrock_id = m.bedrock_id;
  if (m.api_id === "palmyra-x5" || m.api_id === "palmyra-x4") {
    entry.tools = ["function_calling"];
  }

  if (m.pricing_input != null && m.pricing_output != null) {
    entry.pricing = buildPricing({
      input: m.pricing_input,
      output: m.pricing_output,
    });
  } else if (isVision) {
    entry.pricing_notes = [
      "$0.005 per image, $0.005 per second of video, $7.50 per 1M output tokens",
    ];
  } else if (m.pricing_input != null) {
    entry.pricing = buildPricing({ input: m.pricing_input });
    if (m.pricing_notes) entry.pricing_notes = [m.pricing_notes];
  }

  return entry;
}

async function main() {
  console.log("Fetching Writer models...");

  const md = await fetchCached(MODELS_MD, {
    scope: "writer",
    label: "models",
  });
  const parsed = parseModelsMarkdown(md);
  console.log(`Parsed ${parsed.length} models from models.md`);

  const apiKey = envOrNull("WRITER_API_KEY");
  if (apiKey && LIST_API) {
    try {
      const res = await fetch(LIST_API, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const json = (await res.json()) as { models?: { id: string }[] };
        const live = new Set((json.models ?? []).map((m) => m.id));
        console.log(`Live model ids: ${[...live].join(", ")}`);
      }
    } catch {
      // ignore — the markdown is the source of truth
    }
  }

  let written = 0;
  for (const m of parsed) {
    if (upsertModel("writer", buildEntry(m))) written++;
  }
  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
