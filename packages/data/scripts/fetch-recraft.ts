import { fetchText, parseMdTable } from "./parse.ts";
import {
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Recraft models from their docs site. Model coverage is stable
 * across the v2/v3/v4 generations so the model set is hard-coded; the
 * pricing markdown table is parsed live to keep per-image USD costs fresh.
 */

const sources = readSources("recraft");
const PRICING_URL = sources.pricing as string;

interface ModelMeta {
  name: string;
  family: string;
  description: string;
  tagline: string;
  release_date: string;
  endpoints: string[];
  inputs: ("text" | "image")[];
}

const MODELS: Record<string, ModelMeta> = {
  recraftv4: {
    name: "Recraft V4",
    family: "recraft-v4",
    description:
      "Latest Recraft raster model with strong design sensibility, readable text, and consistent composition. Default model in the API.",
    tagline: "Design-forward raster image model.",
    release_date: "2026-02-01",
    endpoints: ["images"],
    inputs: ["text", "image"],
  },
  recraftv4_vector: {
    name: "Recraft V4 Vector",
    family: "recraft-v4",
    description: "Recraft V4 model that outputs editable SVG vector graphics.",
    tagline: "V4 vector / SVG output.",
    release_date: "2026-02-01",
    endpoints: ["images"],
    inputs: ["text", "image"],
  },
  recraftv4_pro: {
    name: "Recraft V4 Pro",
    family: "recraft-v4",
    description:
      "High-fidelity 2048x2048 raster tier of Recraft V4 with improved anatomy and realism for print-grade output.",
    tagline: "Print-grade raster Recraft V4.",
    release_date: "2026-02-01",
    endpoints: ["images"],
    inputs: ["text", "image"],
  },
  recraftv4_pro_vector: {
    name: "Recraft V4 Pro Vector",
    family: "recraft-v4",
    description:
      "Top-tier vector model in the V4 family for production-ready SVG illustrations.",
    tagline: "Top-tier Recraft V4 vector model.",
    release_date: "2026-02-01",
    endpoints: ["images"],
    inputs: ["text", "image"],
  },
  recraftv3: {
    name: "Recraft V3",
    family: "recraft-v3",
    description:
      "Previously codenamed Red Panda; raster model with strong text rendering and brand-style preservation. Used for image-to-image, inpainting, and background editing endpoints.",
    tagline: "Recraft V3 raster (formerly Red Panda).",
    release_date: "2024-10-30",
    endpoints: ["images", "image-to-image", "inpaint", "replace-background"],
    inputs: ["text", "image"],
  },
  recraftv3_vector: {
    name: "Recraft V3 Vector",
    family: "recraft-v3",
    description:
      "Vector / SVG output variant of Recraft V3 for editable scalable graphics.",
    tagline: "Recraft V3 vector / SVG.",
    release_date: "2024-10-30",
    endpoints: ["images", "image-to-image", "inpaint", "replace-background"],
    inputs: ["text", "image"],
  },
  recraftv2: {
    name: "Recraft V2",
    family: "recraft-v2",
    description: "First-generation Recraft raster model.",
    tagline: "Legacy Recraft V2 raster.",
    release_date: "2024-02-01",
    endpoints: ["images"],
    inputs: ["text"],
  },
  recraftv2_vector: {
    name: "Recraft V2 Vector",
    family: "recraft-v2",
    description: "First-generation vector / SVG output model.",
    tagline: "Legacy Recraft V2 vector.",
    release_date: "2024-02-01",
    endpoints: ["images"],
    inputs: ["text"],
  },
};

// fallback per-image USD costs if the markdown table can't be reached.
const FALLBACK_PRICING: Record<string, number> = {
  recraftv4: 0.04,
  recraftv4_vector: 0.08,
  recraftv4_pro: 0.25,
  recraftv4_pro_vector: 0.3,
  recraftv3: 0.04,
  recraftv3_vector: 0.08,
  recraftv2: 0.022,
  recraftv2_vector: 0.044,
};

function parseUsd(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

function parsePricingMd(md: string): Record<string, number> {
  const rows = parseMdTable(md);
  const map: Record<string, number> = {};
  for (const row of rows) {
    // Each table has at least a model id column and a USD column. The
    // exact header text varies across the page, so we scan all cells.
    let foundId: string | undefined;
    let foundUsd: number | undefined;
    for (const v of Object.values(row)) {
      const idMatch = v.match(/recraftv[234](?:_pro)?(?:_vector)?/i);
      if (idMatch && !foundId) foundId = idMatch[0].toLowerCase();
      const usd = parseUsd(v);
      if (usd != null && (foundUsd == null || usd < foundUsd)) foundUsd = usd;
    }
    if (foundId && foundUsd != null) {
      map[foundId] = foundUsd;
    }
  }
  return map;
}

async function main() {
  console.log("Fetching Recraft models...");

  let pricing = FALLBACK_PRICING;
  if (PRICING_URL) {
    try {
      const md = await fetchText(PRICING_URL);
      const parsed = parsePricingMd(md);
      console.log(
        `Parsed pricing for ${Object.keys(parsed).length} model ids from markdown`,
      );
      pricing = { ...FALLBACK_PRICING, ...parsed };
    } catch (err) {
      console.warn(
        `Could not fetch pricing markdown (${(err as Error).message}); using fallback.`,
      );
    }
  }

  let written = 0;
  for (const [id, meta] of Object.entries(MODELS)) {
    const usd = pricing[id];
    const entry: ModelEntry = {
      id,
      name: meta.name,
      created_by: "recraft",
      family: meta.family,
      description: meta.description,
      tagline: meta.tagline,
      status: "active",
      model_type: "image",
      release_date: meta.release_date,
      license: "proprietary",
      open_weight: false,
      modalities: { input: meta.inputs, output: ["image"] },
      endpoints: meta.endpoints,
    };
    if (usd != null) {
      const units = Math.round(usd * 1000);
      entry.pricing_notes = [
        `$${usd.toFixed(usd < 0.1 ? 3 : 2)} per image (${units} API units).`,
      ];
    }
    if (upsertModel("recraft", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
