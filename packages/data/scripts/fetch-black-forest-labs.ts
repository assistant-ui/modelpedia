import { fetchText } from "./parse.ts";
import {
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Black Forest Labs (FLUX) models from the public OpenAPI spec.
 * The OpenAPI document at /openapi.json enumerates every callable model as a
 * POST /v1/<model-id> path. We extract those, then enrich with manual
 * per-model metadata (license, family, release_date) the spec does not carry.
 *
 * Pricing comes from a markdown page that lists per-image USD costs. We do
 * not synthesize per-token pricing for image models; instead we surface the
 * per-image cost via pricing_notes.
 */

const sources = readSources("black-forest-labs");
const OPENAPI_URL = sources.openapi as string;
const PRICING_URL = sources.pricing as string;

interface OpenApiSpec {
  paths?: Record<string, unknown>;
  info?: { version?: string; title?: string };
}

interface ModelMeta {
  name: string;
  family: string;
  description: string;
  tagline: string;
  status?: "active" | "preview" | "deprecated";
  release_date?: string;
  license: string;
  open_weight: boolean;
  inputs: ("text" | "image")[];
}

const META: Record<string, ModelMeta> = {
  "flux-2-pro": {
    name: "FLUX.2 [pro]",
    family: "flux-2",
    description:
      "Production-grade default model for FLUX.2 text-to-image generation and image editing. Supports up to 10 reference images and 4MP output.",
    tagline: "Recommended default for image generation and editing.",
    status: "active",
    release_date: "2025-11-25",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-2-pro-preview": {
    name: "FLUX.2 [pro] Preview",
    family: "flux-2",
    description:
      "Latest [pro] improvements and optimizations promoted ahead of the stable [pro] snapshot.",
    tagline: "Preview channel for FLUX.2 [pro].",
    status: "preview",
    release_date: "2026-03-03",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-2-flex": {
    name: "FLUX.2 [flex]",
    family: "flux-2",
    description:
      "FLUX.2 variant with adjustable steps and guidance, tuned for typography and editing workflows. Up to 8 references via API.",
    tagline: "Flexible FLUX.2 for typography and editing.",
    status: "active",
    release_date: "2025-11-25",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-2-max": {
    name: "FLUX.2 [max]",
    family: "flux-2",
    description:
      "Highest-quality FLUX.2 model with web grounding search, up to 8 references via API and 10 in playground.",
    tagline: "Highest quality FLUX.2.",
    status: "active",
    release_date: "2025-12-16",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-2-klein-4b": {
    name: "FLUX.2 [klein] 4B",
    family: "flux-2",
    description:
      "Lightweight 4B-parameter FLUX.2 flow model for sub-second inference; ~13 GB VRAM. Open base weights under Apache 2.0.",
    tagline: "Fastest, most lightweight FLUX.2.",
    status: "active",
    release_date: "2026-01-15",
    license: "apache-2.0",
    open_weight: true,
    inputs: ["text", "image"],
  },
  "flux-2-klein-9b": {
    name: "FLUX.2 [klein] 9B",
    family: "flux-2",
    description:
      "Balanced 9B FLUX.2 flow model with 8B text embedder; sub-second inference at ~24 GB VRAM. Open base weights under FLUX non-commercial license.",
    tagline: "Balanced quality and speed for [klein].",
    status: "active",
    release_date: "2026-01-15",
    license: "flux-1-dev-non-commercial",
    open_weight: true,
    inputs: ["text", "image"],
  },
  "flux-2-klein-9b-preview": {
    name: "FLUX.2 [klein] 9B Preview",
    family: "flux-2",
    description:
      "Latest [klein] 9B with KV caching improvements for faster editing workflows.",
    tagline: "[klein] 9B with KV caching.",
    status: "preview",
    license: "flux-1-dev-non-commercial",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-pro-1.1": {
    name: "FLUX 1.1 [pro]",
    family: "flux-1.1",
    description:
      "Fast and reliable text-to-image baseline with strong prompt adherence. Sometimes called FLUX1.1 [pro].",
    tagline: "Fast and reliable FLUX 1.1 baseline.",
    status: "active",
    release_date: "2024-10-02",
    license: "proprietary",
    open_weight: false,
    inputs: ["text"],
  },
  "flux-pro-1.1-ultra": {
    name: "FLUX 1.1 [pro] Ultra",
    family: "flux-1.1",
    description:
      "FLUX 1.1 [pro] with up to 4MP resolution and optional Raw mode for photographic authenticity. Supports image-to-image.",
    tagline: "FLUX 1.1 [pro] up to 4MP with raw mode.",
    status: "active",
    release_date: "2024-11-06",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-pro-1.1-ultra-finetuned": {
    name: "FLUX 1.1 [pro] Ultra Finetuned",
    family: "flux-1.1",
    description:
      "Inference endpoint for user-finetuned FLUX 1.1 [pro] Ultra models created via the BFL finetune API.",
    tagline: "Inference for finetuned FLUX 1.1 [pro] Ultra.",
    status: "active",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-pro-1.0-fill": {
    name: "FLUX.1 Fill [pro]",
    family: "flux-1-tools",
    description:
      "Text-driven inpainting and outpainting using an input image and mask.",
    tagline: "Inpainting and outpainting for FLUX.1.",
    status: "active",
    release_date: "2024-11-01",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-pro-1.0-fill-finetuned": {
    name: "FLUX.1 Fill [pro] Finetuned",
    family: "flux-1-tools",
    description:
      "Inference endpoint for user-finetuned FLUX.1 Fill [pro] models with input image and mask.",
    tagline: "Inference for finetuned FLUX.1 Fill [pro].",
    status: "active",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-pro-1.0-expand": {
    name: "FLUX.1 Expand [pro]",
    family: "flux-1-tools",
    description:
      "Expands an image by adding pixels on any side while maintaining context.",
    tagline: "Outpainting by side for FLUX.1.",
    status: "active",
    release_date: "2024-11-01",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-dev": {
    name: "FLUX.1 [dev]",
    family: "flux-1",
    description:
      "12B-parameter FLUX.1 [dev] model for text-to-image generation. Open weights for non-commercial use; also exposed via BFL API for hosted inference.",
    tagline: "FLUX.1 12B open-weight dev model.",
    status: "active",
    release_date: "2024-08-01",
    license: "flux-1-dev-non-commercial",
    open_weight: true,
    inputs: ["text"],
  },
  "flux-kontext-pro": {
    name: "FLUX.1 Kontext [pro]",
    family: "flux-kontext",
    description:
      "Context-aware image editing and text-to-image. Legacy FLUX.1 line; BFL recommends FLUX.2 [pro] for new projects.",
    tagline: "Legacy FLUX.1 Kontext [pro].",
    status: "deprecated",
    release_date: "2025-05-29",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
  "flux-kontext-max": {
    name: "FLUX.1 Kontext [max]",
    family: "flux-kontext",
    description:
      "Higher-quality variant of Kontext with stronger editing fidelity. Legacy; superseded by FLUX.2 [max] for new projects.",
    tagline: "Legacy FLUX.1 Kontext [max].",
    status: "deprecated",
    release_date: "2025-05-29",
    license: "proprietary",
    open_weight: false,
    inputs: ["text", "image"],
  },
};

// open-weight models that are not callable through the BFL API but should
// remain in the catalog (Hugging Face downloads only).
const OPEN_WEIGHT_ONLY: Record<string, ModelMeta> = {
  "flux-2-dev": {
    name: "FLUX.2 [dev]",
    family: "flux-2",
    description:
      "Local development variant of FLUX.2 with full customization for non-commercial use. Not exposed via the BFL API; available on Hugging Face.",
    tagline: "Local-only FLUX.2 for non-commercial development.",
    status: "active",
    license: "flux-1-dev-non-commercial",
    open_weight: true,
    inputs: ["text", "image"],
  },
  "flux-1-kontext-dev": {
    name: "FLUX.1 Kontext [dev]",
    family: "flux-kontext",
    description:
      "Open-weights image editing model from the FLUX.1 Kontext line. Hugging Face only; not callable via the BFL API.",
    tagline: "Open-weight FLUX.1 Kontext.",
    status: "active",
    release_date: "2025-06-26",
    license: "flux-1-dev-non-commercial",
    open_weight: true,
    inputs: ["text", "image"],
  },
  "flux-1-schnell": {
    name: "FLUX.1 [schnell]",
    family: "flux-1",
    description:
      "12B distilled sibling of FLUX.1 [dev] generating near-quality images in 1 to 4 sampling steps. Apache 2.0 open weights with no commercial restrictions.",
    tagline: "Fast 12B Apache-2.0 FLUX.1.",
    status: "active",
    release_date: "2024-08-01",
    license: "apache-2.0",
    open_weight: true,
    inputs: ["text"],
  },
  "flux-1-dev": {
    name: "FLUX.1 [dev] (open weights)",
    family: "flux-1",
    description:
      "Open-weight 12B FLUX.1 [dev] checkpoint distributed on Hugging Face for non-commercial use. Hosted inference is exposed via /v1/flux-dev.",
    tagline: "Open-weight FLUX.1 [dev] 12B.",
    status: "active",
    release_date: "2024-08-01",
    license: "flux-1-dev-non-commercial",
    open_weight: true,
    inputs: ["text"],
  },
};

// Per-image USD pricing pulled from docs.bfl.ml/quick_start/pricing.md.
// Stored as plain strings under pricing_notes (image models are not
// per-token).
const PRICING_NOTES: Record<string, string[]> = {
  "flux-2-pro": [
    "From $0.03/image (text-to-image), from $0.045/image (editing); megapixel-scaled.",
  ],
  "flux-2-pro-preview": ["From $0.03/image; megapixel-scaled."],
  "flux-2-flex": ["From $0.06/image; megapixel-scaled."],
  "flux-2-max": ["From $0.07/image; megapixel-scaled."],
  "flux-2-klein-4b": ["From $0.014/image + $0.001/MP."],
  "flux-2-klein-9b": ["From $0.015/image + $0.002/MP."],
  "flux-2-klein-9b-preview": ["From $0.015/image + $0.002/MP."],
  "flux-pro-1.1": ["$0.04/image (4 credits)."],
  "flux-pro-1.1-ultra": ["$0.06/image (6 credits) for ultra and raw modes."],
  "flux-pro-1.1-ultra-finetuned": ["$0.06/image (6 credits)."],
  "flux-pro-1.0-fill": ["$0.05/image (5 credits)."],
  "flux-pro-1.0-fill-finetuned": ["$0.05/image (5 credits)."],
  "flux-pro-1.0-expand": ["Per BFL pricing page; megapixel-scaled."],
  "flux-dev": [
    "$0.025/image via API (per docs); weights free for non-commercial use.",
  ],
  "flux-kontext-pro": ["$0.04/image (4 credits)."],
  "flux-kontext-max": ["$0.08/image (8 credits)."],
  "flux-2-dev": ["Free local use under non-commercial license."],
  "flux-1-kontext-dev": ["Local use; non-commercial license."],
  "flux-1-schnell": ["Free open weights; not exposed via BFL API."],
  "flux-1-dev": ["Free local use under non-commercial license."],
};

function extractApiModelIds(spec: OpenApiSpec): string[] {
  const ids: string[] = [];
  for (const p of Object.keys(spec.paths ?? {})) {
    const m = p.match(/^\/v1\/([a-z0-9.-]+)$/i);
    if (!m) continue;
    // /v1/get_result is the polling endpoint, not a model.
    if (m[1].includes("_")) continue;
    ids.push(m[1]);
  }
  return ids;
}

async function main() {
  console.log("Fetching Black Forest Labs models...");

  let apiIds: string[] = [];
  try {
    const text = await fetchText(OPENAPI_URL);
    const spec = JSON.parse(text) as OpenApiSpec;
    apiIds = extractApiModelIds(spec);
    console.log(`OpenAPI spec listed ${apiIds.length} model paths`);
  } catch (err) {
    console.warn(
      `Could not fetch ${OPENAPI_URL}: ${(err as Error).message}. Falling back to known model list.`,
    );
    apiIds = Object.keys(META);
  }

  // Pricing markdown is fetched for cache warmth but we use the canonical
  // PRICING_NOTES table above (the markdown layout is brittle).
  if (PRICING_URL) {
    try {
      await fetchText(PRICING_URL);
    } catch {}
  }

  let written = 0;
  const all = new Map<string, ModelMeta>();
  for (const id of apiIds) {
    const meta = META[id];
    if (!meta) {
      console.warn(`  no metadata for OpenAPI model ${id}, skipping`);
      continue;
    }
    all.set(id, meta);
  }
  for (const [id, meta] of Object.entries(OPEN_WEIGHT_ONLY)) {
    all.set(id, meta);
  }

  for (const [id, meta] of all) {
    const apiOnly = !OPEN_WEIGHT_ONLY[id];
    const entry: ModelEntry = {
      id,
      name: meta.name,
      created_by: "black-forest-labs",
      family: meta.family,
      description: meta.description,
      tagline: meta.tagline,
      status: meta.status,
      model_type: "image",
      release_date: meta.release_date,
      license: meta.license,
      open_weight: meta.open_weight,
      modalities: { input: meta.inputs, output: ["image"] },
    };
    if (apiOnly) entry.endpoints = [`/v1/${id}`];
    if (PRICING_NOTES[id]) entry.pricing_notes = PRICING_NOTES[id];
    if (upsertModel("black-forest-labs", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
