import { fetchText, stripHtml } from "./parse.ts";
import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Fireworks AI models from their website.
 * No API key needed — scrapes public model pages.
 */

const sources = readSources("fireworks");
const MODELS_PAGE = sources.docs as string;
const MODEL_BASE = `${(sources.docs as string).replace(/\/$/, "")}/`;

// ── Get model slugs ──

async function fetchModelSlugs(): Promise<string[]> {
  const html = await fetchText(MODELS_PAGE);
  return [
    ...new Set(
      [...html.matchAll(/href="\/models\/([\w/.-]+)"/g)].map((m) => m[1]),
    ),
  ];
}

// ── Fetch model detail ──

interface FireworksModel {
  slug: string;
  context_window?: number;
  pricing_input?: number;
  pricing_output?: number;
  created_by: string;
}

function inferCreator(slug: string): string {
  const s = slug.toLowerCase();
  if (s.includes("llama") || s.includes("maverick")) return "meta";
  if (s.includes("qwen")) return "qwen";
  if (s.includes("deepseek")) return "deepseek";
  if (s.includes("mistral") || s.includes("mixtral") || s.includes("ministral"))
    return "mistral";
  if (s.includes("gemma")) return "google";
  if (s.includes("gpt-oss")) return "openai";
  if (s.includes("glm")) return "zhipu";
  if (s.includes("kimi")) return "moonshot";
  if (s.includes("flux") || s.includes("ssd")) return "stability";
  if (s.includes("whisper")) return "openai";
  if (s.includes("cogito")) return "cogito";
  if (s.includes("minimax")) return "minimax";
  // publisher prefix: "fireworks/xxx" → fireworks
  const slash = slug.indexOf("/");
  if (slash > 0) return slug.slice(0, slash);
  return "fireworks";
}

async function fetchDetail(slug: string): Promise<FireworksModel | null> {
  try {
    const html = await fetchText(`${MODEL_BASE}${slug}`);
    const text = stripHtml(html);

    // Context window — match "Context Length 131.1k tokens" or "context length of 163,840"
    let contextWindow: number | undefined;
    const ctxK = text.match(/Context\s*Length\s*([\d.]+)\s*[kK]\s*tokens/i);
    const ctxNum = text.match(
      /context\s*length\s*(?:of\s*)?([\d,]+)\s*tokens/i,
    );
    if (ctxK) {
      contextWindow = Math.round(Number(ctxK[1]) * 1000);
    } else if (ctxNum) {
      contextWindow = Number(ctxNum[1].replace(/,/g, ""));
    }

    // Pricing - first few dollar values are usually input, cached, output
    const dollars = [...text.matchAll(/\$\s*([\d.]+)/g)]
      .map((m) => Number(m[1]))
      .filter((d) => d > 0 && d < 20);

    let pricingInput: number | undefined;
    let pricingOutput: number | undefined;
    if (dollars.length >= 3) {
      // Pattern: input, cached, output
      pricingInput = dollars[0];
      pricingOutput = dollars[2];
    } else if (dollars.length >= 2) {
      pricingInput = dollars[0];
      pricingOutput = dollars[1];
    }

    return {
      slug,
      context_window: contextWindow,
      pricing_input: pricingInput,
      pricing_output: pricingOutput,
      created_by: inferCreator(slug),
    };
  } catch {
    return null;
  }
}

// ── Main ──

async function main() {
  console.log("Fetching Fireworks AI models...");

  const allSlugs = await fetchModelSlugs();
  // Skip internal/test pages
  const slugs = allSlugs.filter((s) => {
    const l = s.toLowerCase();
    return !l.includes("playground");
  });
  console.log(`Found ${slugs.length} model slugs (from ${allSlugs.length})`);

  // Fetch details in batches of 10
  const details: FireworksModel[] = [];
  for (let i = 0; i < slugs.length; i += 10) {
    const batch = slugs.slice(i, i + 10);
    const results = await Promise.all(batch.map(fetchDetail));
    for (const r of results) {
      if (r) details.push(r);
    }
    if (i % 50 === 0 && i > 0) console.log(`  ...${i}/${slugs.length}`);
  }
  console.log(`Fetched ${details.length} model details`);

  let written = 0;
  for (const m of details) {
    // Use the part after the last "/" as the model name
    const parts = m.slug.split("/");
    const shortName = parts[parts.length - 1];

    const entry: ModelEntry = {
      id: m.slug,
      name: shortName,
      created_by: m.created_by,
      family: inferFamily(shortName),
      context_window: m.context_window,
      capabilities: { streaming: true },
    };

    if (m.pricing_input != null && m.pricing_output != null) {
      entry.pricing = {
        input: m.pricing_input,
        output: m.pricing_output,
      };
    }

    written += upsertWithSnapshot("fireworks", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
