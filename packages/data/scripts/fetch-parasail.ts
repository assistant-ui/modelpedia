import { fetchText, pMap, snapBinaryTokens, stripHtml } from "./parse.ts";
import {
  assertParsed,
  buildPricing,
  inferFamily,
  type ModelEntry,
  normalizeDate,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";
import {
  createdByFromModelId,
  displayNameFromId,
  enrichEntry,
} from "./provider-fetch-utils.ts";

/**
 * Parasail has no key-free API. The public catalog at /models links one
 * server-rendered page per model, each carrying a spec block with the real
 * API endpoint id, context window, license, release month and USD pricing.
 */

const CATALOG_URL = readSources("parasail").models as string;

const LABELS = [
  "Developed by",
  "Model family",
  "Library categories",
  "Use case",
  "Agent support",
  "Modality",
  "Context window",
  "Architecture",
  "Version",
  "License",
  "Pricing",
  "Released",
  "Endpoint",
];

const CREATORS: Record<string, string> = {
  "z.ai": "zai",
  moonshot: "moonshot",
  baai: "baai",
};

function decode(text: string): string {
  return text
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'");
}

function pageText(html: string): string {
  return decode(
    stripHtml(
      html
        .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
        .replace(/<!--[\s\S]*?-->/g, " "),
    ),
  );
}

function parseSpecs(text: string): Record<string, string> | undefined {
  const start = text.indexOf("Model details Specs & substance");
  if (start < 0) return undefined;
  const after = text.slice(start);
  const last = after.match(/ Endpoint \S+/);
  if (!last) return undefined;
  const block = after.slice(0, last.index! + last[0].length);
  const marks = LABELS.map((label) => ({
    label,
    at: block.indexOf(` ${label} `),
  }))
    .filter((mark) => mark.at >= 0)
    .sort((a, b) => a.at - b.at);
  const specs: Record<string, string> = {};
  marks.forEach((mark, i) => {
    const from = mark.at + mark.label.length + 2;
    const to = marks[i + 1]?.at ?? block.length;
    specs[mark.label] = block.slice(from, to).trim();
  });
  const endpoint = specs.Endpoint?.match(/^\S+/)?.[0];
  if (!endpoint) return undefined;
  specs.Endpoint = endpoint;
  return specs;
}

function parseContext(value: string | undefined): number | undefined {
  const match = value?.match(/^([\d.]+)([KM])/);
  if (!match) return undefined;
  return snapBinaryTokens(
    Number(match[1]) * (match[2] === "M" ? 1_000_000 : 1_000),
  );
}

function parsePricing(value: string | undefined) {
  const price = (kind: string) => {
    const match = value?.match(new RegExp(`\\$([\\d.]+) ${kind}`));
    return match ? Number(match[1]) : undefined;
  };
  return buildPricing({
    input: price("in"),
    output: price("out"),
    cached_input: price("cache read"),
  });
}

function parseModel(slug: string, html: string): ModelEntry | undefined {
  const specs = parseSpecs(pageText(html));
  if (!specs) return undefined;

  const title = html.match(/<meta property="og:title" content="([^"]+)"/)?.[1];
  const name = title ? decode(title).split(" — ")[0].trim() : undefined;
  const rawDescription = html.match(
    /<meta name="description" content="([^"]+)"/,
  )?.[1];
  const description = rawDescription
    ? decode(rawDescription).split(" Explore pricing")[0]
    : undefined;
  const developer = (specs["Developed by"] ?? "").toLowerCase();
  const createdBy = developer
    ? (CREATORS[developer] ??
      createdByFromModelId(
        `${developer.replaceAll(" ", "-")}/${slug}`,
        "parasail",
      ))
    : createdByFromModelId(specs.Endpoint, "parasail");
  const modality = (specs.Modality ?? "").toLowerCase();
  const isEmbedding = modality.includes("embedding");
  const vision = modality.includes("vision");
  const input = ["text"];
  if (vision) input.push("image");
  if (modality.includes("video")) input.push("video");
  const contextWindow = parseContext(specs["Context window"]);
  const releaseDate = normalizeDate(specs.Released);
  const pricing = parsePricing(specs.Pricing);

  const entry = enrichEntry(
    {
      id: specs.Endpoint,
      name: name || displayNameFromId(slug),
      created_by: createdBy || "parasail",
      family: inferFamily(slug),
      page_url: `${CATALOG_URL}/${slug}`,
      status: "active",
      model_type: isEmbedding ? "embed" : "chat",
      ...(specs.License ? { license: specs.License } : {}),
      ...(contextWindow ? { context_window: contextWindow } : {}),
      ...(releaseDate ? { release_date: releaseDate } : {}),
      ...(pricing ? { pricing } : {}),
      modalities: { input: isEmbedding ? ["text"] : input, output: ["text"] },
      ...(isEmbedding ? {} : { capabilities: { vision } }),
    },
    { description },
  );
  if (isEmbedding) delete entry.capabilities;
  return entry;
}

async function main() {
  console.log("Fetching Parasail model catalog...");
  const catalog = await fetchText(CATALOG_URL);
  const slugs = [
    ...new Set(
      [...catalog.matchAll(/href="\/models\/([a-z0-9][a-z0-9.-]*)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  console.log(`Found ${slugs.length} model pages`);

  const pages = await pMap(
    slugs,
    async (slug) => {
      const model = parseModel(slug, await fetchText(`${CATALOG_URL}/${slug}`));
      if (!model) console.warn(`Skipping ${slug}: no spec block`);
      return model;
    },
    6,
  );
  const models = pages.filter((model) => model != null);
  console.log(`Parsed ${models.length} models`);
  assertParsed(models.length, "parasail");

  let written = 0;
  for (const model of models) {
    if (upsertModel("parasail", model)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
