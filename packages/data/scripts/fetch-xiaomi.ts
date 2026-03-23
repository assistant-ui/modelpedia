import { fetchText } from "./parse.ts";
import {
  buildPricing,
  envOrNull,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Xiaomi MiMo models from:
 * 1. platform.xiaomimimo.com/llms-full.txt (public docs — pricing, context, capabilities)
 * 2. api.xiaomimimo.com/v1/models (optional, needs key — for model list validation)
 *
 * Models: MiMo-V2-Pro, MiMo-V2-Flash, MiMo-V2-Omni, MiMo-V2-TTS
 */

const sources = readSources("xiaomi");
const DOCS_URL = sources.docs as string;

// ── Types ──

interface ParsedModel {
  id: string;
  name: string;
  context_window: number;
  max_output_tokens: number;
  model_type: "chat" | "reasoning" | "tts" | "audio";
  capabilities: Record<string, boolean>;
  modalities: { input: string[]; output: string[] };
  pricing?: { input: number; output: number; cached_input?: number };
  pricing_tiers?: {
    label: string;
    unit: string;
    columns: string[];
    rows: { label: string; values: (number | null)[] }[];
  }[];
  parameters?: number;
  active_parameters?: number;
  architecture?: string;
  license?: string;
  open_weight?: boolean;
  release_date?: string;
  knowledge_cutoff?: string | null;
  description?: string;
  page_url?: string;
}

// ── Fallback model definitions ──
// Used when docs page cannot be fetched or parsed.

const FALLBACK_MODELS: ParsedModel[] = [
  {
    id: "MiMo-V2-Pro",
    name: "MiMo-V2-Pro",
    context_window: 1000000,
    max_output_tokens: 128000,
    model_type: "reasoning",
    capabilities: {
      streaming: true,
      reasoning: true,
      tool_call: true,
      json_mode: true,
    },
    modalities: { input: ["text"], output: ["text"] },
    pricing: { input: 1, output: 3, cached_input: 0.2 },
    pricing_tiers: [
      {
        label: "Text tokens",
        unit: "Per 1M tokens",
        columns: ["Input", "Output", "Cache Read", "Cache Write"],
        rows: [
          {
            label: "Up to 256K context",
            values: [1, 3, 0.2, null],
          },
          {
            label: "256K–1M context",
            values: [2, 6, 0.4, null],
          },
        ],
      },
    ],
    parameters: 1000,
    active_parameters: 42,
    architecture: "moe",
    license: "proprietary",
    open_weight: false,
    release_date: "2026-03-18",
    description:
      "Flagship foundation model with 1M-token context and top-tier agentic capabilities.",
    page_url: "https://mimo.xiaomi.com/mimo-v2-pro",
  },
  {
    id: "MiMo-V2-Flash",
    name: "MiMo-V2-Flash",
    context_window: 256000,
    max_output_tokens: 64000,
    model_type: "reasoning",
    capabilities: {
      streaming: true,
      reasoning: true,
      tool_call: true,
      json_mode: true,
    },
    modalities: { input: ["text"], output: ["text"] },
    pricing: { input: 0.1, output: 0.3 },
    parameters: 309,
    active_parameters: 15,
    architecture: "moe",
    license: "mit",
    open_weight: true,
    release_date: "2025-12-16",
    knowledge_cutoff: "2024-12",
    description:
      "309B MoE reasoning model with 15B active parameters. Fast inference at 150 tokens/s.",
    page_url: "https://mimo.xiaomi.com/mimo-v2-flash",
  },
  {
    id: "MiMo-V2-Omni",
    name: "MiMo-V2-Omni",
    context_window: 256000,
    max_output_tokens: 128000,
    model_type: "chat",
    capabilities: {
      streaming: true,
      reasoning: true,
      vision: true,
      tool_call: true,
      json_mode: true,
    },
    modalities: {
      input: ["text", "image", "audio", "video"],
      output: ["text"],
    },
    pricing: { input: 0.4, output: 2.0 },
    license: "proprietary",
    open_weight: false,
    release_date: "2026-03-18",
    description:
      "Omni-modal agentic model that understands text, image, audio, and video inputs.",
    page_url: "https://mimo.xiaomi.com/mimo-v2-omni",
  },
  {
    id: "MiMo-V2-TTS",
    name: "MiMo-V2-TTS",
    context_window: 8000,
    max_output_tokens: 8000,
    model_type: "tts",
    capabilities: { streaming: true },
    modalities: { input: ["text"], output: ["audio"] },
    license: "proprietary",
    open_weight: false,
    release_date: "2026-03-18",
    description:
      "Versatile speech synthesis with emotion control, dialect support, and singing.",
    page_url: "https://mimo.xiaomi.com/mimo-v2-tts",
  },
];

// ── Docs parser ──

function parseNumber(s: string): number | undefined {
  // Handle "1M", "256K", "128K", "8K", plain numbers
  const cleaned = s.replace(/,/g, "").trim();
  const m = cleaned.match(/([\d.]+)\s*([KkMm])?/);
  if (!m) return undefined;
  const num = Number(m[1]);
  if (m[2] === "K" || m[2] === "k") return num * 1000;
  if (m[2] === "M" || m[2] === "m") return num * 1_000_000;
  return num;
}

/**
 * Parse llms-full.txt for model data.
 * The file is markdown with model sections containing specs and pricing.
 */
function parseDocs(text: string): ParsedModel[] {
  const parsed: ParsedModel[] = [];

  for (const fallback of FALLBACK_MODELS) {
    const model = { ...fallback };

    // Try to find and parse updated pricing from the text
    const nameEscaped = fallback.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const section = text.match(
      new RegExp(`\\*\\*${nameEscaped}\\*\\*([\\s\\S]*?)(?=\\*\\*MiMo-V2-|$)`),
    );

    if (section) {
      const block = section[1];

      // Context window
      const ctxMatch = block.match(
        /[Cc]ontext[:\s]*(\d[\d,]*[KkMm]?)\s*tokens/,
      );
      if (ctxMatch) {
        const ctx = parseNumber(ctxMatch[1]);
        if (ctx) model.context_window = ctx;
      }

      // Output capacity
      const outMatch = block.match(/[Oo]utput[:\s]*(\d[\d,]*[KkMm]?)\s*tokens/);
      if (outMatch) {
        const out = parseNumber(outMatch[1]);
        if (out) model.max_output_tokens = out;
      }

      // Pricing: "$X.XX/million input tokens" or "$X.XX per 1M tokens"
      const inputPrice = block.match(
        /\$([\d.]+)(?:\/million|\s*(?:per|\/)\s*1?[Mm](?:illion)?)\s*input/i,
      );
      const outputPrice = block.match(
        /\$([\d.]+)(?:\/million|\s*(?:per|\/)\s*1?[Mm](?:illion)?)\s*output/i,
      );

      if (inputPrice && outputPrice) {
        model.pricing = {
          input: Number(inputPrice[1]),
          output: Number(outputPrice[1]),
          ...(model.pricing?.cached_input != null
            ? { cached_input: model.pricing.cached_input }
            : {}),
        };
      }

      // Also try table-format pricing: | $X | $Y |
      const priceRow = block.match(
        /\|\s*\$([\d.]+)[^|]*\|\s*\$([\d.]+)[^|]*\|/,
      );
      if (priceRow && !inputPrice) {
        model.pricing = {
          input: Number(priceRow[1]),
          output: Number(priceRow[2]),
          ...(model.pricing?.cached_input != null
            ? { cached_input: model.pricing.cached_input }
            : {}),
        };
      }

      // Cache read pricing
      const cacheMatch = block.match(/[Cc]ache\s*[Rr]ead[:\s]*\$([\d.]+)/);
      if (cacheMatch && model.pricing) {
        model.pricing.cached_input = Number(cacheMatch[1]);
      }
    }

    parsed.push(model);
  }

  return parsed;
}

// ── Main ──

async function main() {
  console.log("Fetching Xiaomi MiMo models...");

  // 1. Parse docs for model specs + pricing
  let parsed: ParsedModel[] = [];
  try {
    const text = await fetchText(DOCS_URL);
    parsed = parseDocs(text);
    console.log(`Parsed ${parsed.length} models from docs`);
  } catch (err) {
    console.warn("Could not fetch docs:", err);
  }
  if (parsed.length === 0) {
    console.log("Using fallback model definitions");
    parsed = FALLBACK_MODELS;
  }

  // 2. Optional: validate model list against API
  const apiKey = envOrNull("XIAOMI_API_KEY", "MIMO_API_KEY");
  if (apiKey) {
    try {
      const res = await fetch(sources.api as string, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data: { id: string; created?: number }[];
        };
        console.log(`Found ${json.data.length} models from API`);
      }
    } catch {}
  }

  // 3. Write models
  let written = 0;

  for (const m of parsed) {
    const entry: ModelEntry = {
      id: m.id,
      name: m.name,
      family: "mimo",
      description: m.description,
      model_type: m.model_type,
      status: "active",
      release_date: m.release_date,
      knowledge_cutoff: m.knowledge_cutoff,
      context_window: m.context_window,
      max_output_tokens: m.max_output_tokens,
      capabilities: m.capabilities,
      modalities: m.modalities,
      reasoning_tokens: m.capabilities.reasoning === true ? true : undefined,
      tools: m.capabilities.tool_call ? ["function_calling"] : undefined,
      page_url: m.page_url,
      license: m.license,
      open_weight: m.open_weight,
    };

    if (m.parameters) entry.parameters = m.parameters;
    if (m.active_parameters) entry.active_parameters = m.active_parameters;
    if (m.architecture) entry.architecture = m.architecture;

    if (m.pricing) {
      entry.pricing = buildPricing({
        input: m.pricing.input,
        output: m.pricing.output,
        cached_input: m.pricing.cached_input,
      });
    }

    if (m.pricing_tiers && entry.pricing) {
      (entry.pricing as Record<string, unknown>).tiers = m.pricing_tiers;
    }

    if (upsertModel("xiaomi", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
