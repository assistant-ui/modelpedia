import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Together AI models from their website.
 * No API key needed — scrapes public pages.
 */

const MODELS_PAGE = "https://www.together.ai/models";
const MODEL_DETAIL_BASE = "https://www.together.ai/models/";

interface TogetherModel {
  slug: string;
  id?: string;
  name: string;
  created_by: string;
  context_window?: number;
  pricing_input?: number;
  pricing_output?: number;
}

// ── Get model slugs from listing page ──

async function fetchModelSlugs(): Promise<string[]> {
  const res = await fetch(MODELS_PAGE);
  const html = await res.text();
  return [
    ...new Set(
      [...html.matchAll(/href="\/models\/([\w.-]+)"/g)].map((m) => m[1]),
    ),
  ];
}

// ── Fetch model detail page ──

async function fetchDetail(slug: string): Promise<TogetherModel | null> {
  const res = await fetch(`${MODEL_DETAIL_BASE}${slug}`);
  if (!res.ok) return null;
  const html = await res.text();
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Find API model ID — pattern like "Qwen/Qwen3.5-397B-A17B"
  const apiIdMatch = html.match(
    /(?:model|api)[_\s-]*(?:id|name)?[":\s]*["']?([\w-]+\/[\w.-]+)["']?/i,
  );

  // Find pricing — "$0.60" patterns
  const dollars = [...text.matchAll(/\$([\d.]+)/g)].map((m) => Number(m[1]));
  // Typically first 2 dollar values for a model are: some other price, then input, output
  // Or they appear as pairs. Find the most likely input/output pair.
  let pricingInput: number | undefined;
  let pricingOutput: number | undefined;
  if (dollars.length >= 2) {
    // Filter reasonable per-M-token prices (< $20)
    const reasonable = dollars.filter((d) => d > 0 && d < 20);
    if (reasonable.length >= 2) {
      // Last pair is usually the model's own pricing
      pricingInput = reasonable[reasonable.length - 2];
      pricingOutput = reasonable[reasonable.length - 1];
    }
  }

  // Find context window
  const ctxMatch = text.match(/Context\s*(?:length|window)?\s*(\d[\d,]*)\s*K/i);
  const contextWindow = ctxMatch
    ? Number(ctxMatch[1].replace(/,/g, "")) * 1000
    : undefined;

  // Infer creator from slug or page content
  const _nameMatch = text.match(
    /(?:by|from|created by|publisher)\s+([\w\s]+?)(?:\s*[·|,]|\s+\d)/i,
  );

  // Simple creator inference from slug
  let createdBy = "unknown";
  const s = slug.toLowerCase();
  if (s.includes("qwen")) createdBy = "qwen";
  else if (s.includes("llama") || s.includes("maverick")) createdBy = "meta";
  else if (s.includes("deepseek")) createdBy = "deepseek";
  else if (s.includes("mistral") || s.includes("ministral"))
    createdBy = "mistral";
  else if (s.includes("gemma")) createdBy = "google";
  else if (s.includes("nemotron")) createdBy = "nvidia";
  else if (s.includes("minimax")) createdBy = "minimax";
  else if (s.includes("glm")) createdBy = "zhipu";
  else if (s.includes("kimi")) createdBy = "moonshot";
  else if (s.includes("gpt-oss") || s.includes("gpt-image"))
    createdBy = "openai";
  else if (s.includes("flux")) createdBy = "black-forest-labs";
  else if (s.includes("lfm")) createdBy = "liquid";

  // Build display name from slug
  const displayName = slug
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  return {
    slug,
    id: apiIdMatch?.[1],
    name: displayName,
    created_by: createdBy,
    context_window: contextWindow,
    pricing_input: pricingInput,
    pricing_output: pricingOutput,
  };
}

// ── Main ──

async function main() {
  console.log("Fetching Together AI models...");

  const slugs = await fetchModelSlugs();
  console.log(`Found ${slugs.length} model slugs`);

  // Filter out non-model slugs
  const modelSlugs = slugs.filter(
    (s) =>
      !["pricing", "docs", "blog", "about", "contact", "terms"].includes(s),
  );

  // Fetch details in parallel batches
  const details: TogetherModel[] = [];
  for (let i = 0; i < modelSlugs.length; i += 5) {
    const batch = modelSlugs.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchDetail));
    for (const r of results) {
      if (r) details.push(r);
    }
  }
  console.log(`Fetched ${details.length} model details`);

  let written = 0;
  for (const m of details) {
    const modelId = m.id ?? m.slug;

    const entry: ModelEntry = {
      id: modelId,
      name: m.name,
      created_by: m.created_by,
      family: inferFamily(modelId),
      context_window: m.context_window,
      capabilities: { streaming: true },
    };

    if (m.pricing_input != null && m.pricing_output != null) {
      entry.pricing = {
        input: m.pricing_input,
        output: m.pricing_output,
      };
    }

    written += upsertWithSnapshot("together", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
