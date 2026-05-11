import { fetchText } from "./parse.ts";
import { displayNameFromId } from "./provider-fetch-utils.ts";
import {
  buildPricing,
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

const sources = readSources("voyage");

function cleanModelId(raw: string) {
  return raw
    .replace(/-(\d)-(\d)(?=-|$)/, "-$1.$2")
    .replace(/\\u003c.*/, "")
    .replace(/<.*/, "");
}

function isUsableModelId(id: string) {
  if (!/^(voyage|rerank)-/.test(id)) return false;
  if (!/\d/.test(id)) return false;
  if (
    /(api|readme|python|package|elevate|instruction-tuned|multilingual-embedding|large32)/i.test(
      id,
    )
  )
    return false;
  if (id.startsWith("voyage-ai-")) return false;
  if (id.length > 40) return false;
  return true;
}

function extractIds(text: string) {
  const ids = new Set<string>();
  for (const match of text.matchAll(
    /\b(?:voyage|rerank)-[a-z0-9][a-z0-9._-]*/gi,
  )) {
    const id = cleanModelId(match[0].toLowerCase());
    if (isUsableModelId(id)) ids.add(id);
  }
  return ids;
}

function parsePricing(html: string) {
  const map = new Map<string, number>();
  const rows = html.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
  for (const row of rows) {
    const ids = [...extractIds(row)];
    if (ids.length === 0) continue;
    const prices = [...row.matchAll(/\$([0-9]+(?:\.[0-9]+)?)/g)].map((m) =>
      Number(m[1]),
    );
    if (prices.length === 0) continue;
    const perMillion =
      prices[0] < 0.01 && prices[1] != null ? prices[1] : prices[0];
    for (const id of ids) map.set(id, perMillion);
  }
  return map;
}

function contextWindow(id: string) {
  if (id.startsWith("rerank-2.5")) return 32_000;
  if (id.startsWith("rerank-2")) return 16_000;
  if (id.startsWith("rerank-1")) return 8_000;
  if (id.startsWith("voyage-4")) return 32_000;
  return undefined;
}

async function main() {
  console.log("Fetching Voyage AI docs...");
  const pages = await Promise.all([
    fetchText(sources.embeddings as string),
    fetchText(sources.multimodal_embeddings as string),
    fetchText(sources.reranker as string),
    fetchText(sources.pricing as string),
  ]);
  const pricing = parsePricing(pages[3]);
  const ids = new Set<string>();
  for (const page of pages) {
    for (const id of extractIds(page)) ids.add(id);
  }

  console.log(`Parsed ${ids.size} Voyage model IDs from official docs`);

  let written = 0;
  for (const id of [...ids].sort()) {
    const isRerank = id.startsWith("rerank-");
    const isMultimodal = id.includes("multimodal");
    const price = pricing.get(id);
    const entry: ModelEntry = {
      id,
      name: displayNameFromId(id),
      created_by: "voyage",
      family: inferFamily(id),
      status: "active",
      model_type: isRerank ? "rerank" : "embed",
      context_window: contextWindow(id),
      modalities: {
        input: isMultimodal ? ["text", "image"] : ["text"],
        output: ["text"],
      },
      capabilities: {},
      endpoints: [isRerank ? "rerank" : "embeddings"],
      pricing: buildPricing({ input: price }),
    };
    if (!entry.pricing) delete entry.pricing;
    written += upsertModel("voyage", entry) ? 1 : 0;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
