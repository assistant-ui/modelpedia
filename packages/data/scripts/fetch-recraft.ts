import { fetchMarkdown, parseMdTable } from "./parse.ts";
import {
  assertParsed,
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
if (!PRICING_URL) throw new Error("recraft _sources.json is missing pricing");

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

const AGENTS_URL = new URL("agents.md", PRICING_URL).href;

const RELEASE_DATES: Record<string, string> = {
  recraftv4_1: "2026-05-01",
  recraftv4_1_utility: "2026-05-01",
  recraftv4_styles: "2026-08-01",
  recraftv4_1_flash_v2: "2026-11-01",
};

const GENERATION_NAMES: Record<string, string> = {
  utility: "Utility",
  styles: "Styles",
  flash: "Flash",
  v2: "V2",
};

interface ApiModel {
  id: string;
  usd: number;
}

/** Parses the docs model list: `model` id, output kind, and per-image USD price. */
function parseModelList(md: string): ApiModel[] {
  const models: ApiModel[] = [];
  const section = md.split(/^## /m).find((s) => s.startsWith("Models"));
  for (const row of section ? parseMdTable(section) : []) {
    const id = row["`model`"]?.match(/^`(recraftv[\w]+)`/)?.[1];
    const usd = row.Price?.match(/^([\d.]+) USD/)?.[1];
    if (id && usd) models.push({ id, usd: Number(usd) });
  }
  return models;
}

function deriveMeta(id: string): ModelMeta {
  const known = MODELS[id];
  if (known) return known;
  const vector = id.endsWith("_vector");
  const pro = /_pro(_vector)?$/.test(id);
  const base = id.replace(/(_pro)?(_vector)?$/, "");
  const parts = base.replace(/^recraftv/, "").split("_");
  const version = parts[0] === "4" && parts[1] === "1" ? "4.1" : parts[0];
  const rest = parts.slice(version === "4.1" ? 2 : 1);
  const label = [
    `Recraft V${version}`,
    ...rest.map((p) => GENERATION_NAMES[p] ?? p.toUpperCase()),
    ...(pro ? ["Pro"] : []),
    ...(vector ? ["Vector"] : []),
  ].join(" ");
  return {
    name: label,
    family: `recraft-v${version.replace(".", "-")}`,
    description: `${label} image generation model in the Recraft API${vector ? ", outputting editable SVG vector graphics" : ""}${pro ? " at 2K resolution" : ""}.`,
    tagline: `${label}.`,
    release_date: RELEASE_DATES[base] ?? "",
    endpoints: ["images"],
    inputs: rest.includes("flash") ? ["text"] : ["text", "image"],
  };
}

async function main() {
  console.log("Fetching Recraft models...");

  const apiModels = parseModelList(await fetchMarkdown(AGENTS_URL));
  console.log(`Parsed pricing for ${apiModels.length} model ids from markdown`);
  assertParsed(apiModels.length, "Recraft pricing");

  let written = 0;
  for (const { id, usd } of apiModels) {
    const meta = deriveMeta(id);
    const entry: ModelEntry = {
      id,
      name: meta.name,
      created_by: "recraft",
      family: meta.family,
      description: meta.description,
      tagline: meta.tagline,
      status: "active",
      model_type: "image",
      ...(meta.release_date && { release_date: meta.release_date }),
      license: "proprietary",
      open_weight: false,
      modalities: { input: meta.inputs, output: ["image"] },
      endpoints: meta.endpoints,
    };
    entry.pricing = {
      tiers: [
        {
          label: "Image generation",
          unit: "Per image",
          columns: ["Price"],
          rows: [{ label: "Standard", values: [usd] }],
        },
      ],
    };
    const units = Math.round(usd * 1000);
    entry.pricing_notes = [
      `$${usd.toFixed(usd < 0.1 ? 3 : 2)} per image (${units} API units).`,
    ];
    if (upsertModel("recraft", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
