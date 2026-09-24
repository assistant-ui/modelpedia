import {
  mergePricingSections,
  parseCatalog,
  parseDeprecations,
  parseModelPage,
  parsePricing,
  parsePricingSections,
  pricingFromSections,
} from "./openai-parser.ts";
import { readdirSync } from "node:fs";
import * as path from "node:path";
import { fetchText, pMap } from "./parse.ts";
import {
  assertParsed,
  buildPricing,
  inferFamily,
  inferParameters,
  type ModelEntry,
  PROVIDERS_DIR,
  readSources,
  runGenerate,
  upsertModel,
  upsertWithSnapshot,
} from "./shared.ts";

const MODEL_DOCS_BASE = "https://developers.openai.com/api/docs/models";
const PAGE_CONCURRENCY = 8;

function isRelevant(id: string): boolean {
  return !id.endsWith(" with data sharing");
}

function featuresToCapabilities(
  features: string[] | undefined,
  tools: string[] | undefined,
  reasoning: boolean,
  endpoints: string[] | undefined,
): Record<string, boolean> {
  const f = new Set(features ?? []);
  const t = new Set(tools ?? []);
  const caps: Record<string, boolean> = {};

  caps.streaming = f.has("streaming");
  caps.vision = f.has("image_input") || t.has("image_generation");
  caps.tool_call = f.has("function_calling") || t.has("function_calling");
  caps.structured_output = f.has("structured_outputs");
  caps.json_mode = f.has("json_mode");
  caps.fine_tuning = f.has("fine_tuning");
  caps.reasoning = reasoning;
  if (endpoints?.includes("batch")) caps.batch = true;

  if (!features) return {};

  return caps;
}

async function main() {
  const sources = readSources("openai");
  const [catalogMarkdown, pricingMarkdown, deprecationsMarkdown] =
    await Promise.all([
      fetchText(sources.models as string),
      fetchText(sources.pricing as string),
      fetchText(sources.deprecations as string),
    ]);
  const catalog = parseCatalog(catalogMarkdown);
  const deprecations = parseDeprecations(deprecationsMarkdown);
  const pricing = parsePricing(pricingMarkdown);
  const pricingSections = parsePricingSections(pricingMarkdown);
  assertParsed(catalog.size, "OpenAI model catalog");
  console.log(
    `Catalog: ${catalog.size} model pages, ${pricing.size} priced models, ${deprecations.size} deprecations`,
  );

  const pages = await pMap(
    [...catalog.values()],
    async (catalogEntry) => {
      const url = `${MODEL_DOCS_BASE}/${catalogEntry.slug}`;
      const [markdown, html] = await Promise.all([
        fetchText(`${url}.md`),
        fetchText(url),
      ]);
      return {
        catalogEntry,
        page: parseModelPage(markdown, html, catalogEntry.slug!),
      };
    },
    PAGE_CONCURRENCY,
  );
  assertParsed(pages.length, "OpenAI model pages");

  const detail = new Map();
  const compare = new Map();
  const snapshotAliases = new Map<string, string>();
  for (const { catalogEntry, page } of pages) {
    const pageDetail = {
      ...catalogEntry,
      ...page.detail,
      name: page.detail.name,
      tagline: page.detail.tagline ?? catalogEntry.tagline,
    };
    const ids = new Set([page.detail.name, ...(page.detail.snapshots ?? [])]);
    let pageSections = page.pricing;
    for (const id of ids) {
      pageSections = mergePricingSections(
        pageSections,
        pricingSections.get(id),
      );
    }
    for (const id of ids) {
      if (id !== page.detail.name) snapshotAliases.set(id, page.detail.name);
      detail.set(
        id,
        id === page.detail.name
          ? pageDetail
          : { name: id, slug: page.detail.slug },
      );
      compare.set(id, { ...page.compare, name: id });
      const sections = mergePricingSections(
        pricingSections.get(id),
        pageSections,
      );
      pricingSections.set(id, sections);
      const price = pricingFromSections(id, sections);
      if (price) pricing.set(id, price);
    }
  }

  // A family entry (`gpt-4o-audio`) covers its preview and dated snapshots,
  // never every id that shares its prefix: gpt-realtime-2 and gpt-audio-1.5
  // are separate models, one of them the recommended replacement.
  const familyDeprecation = (id: string) => {
    const alias = snapshotAliases.get(id);
    return [...deprecations.values()].find(
      (deprecation) =>
        deprecation.family &&
        (deprecation.id === alias ||
          (id.startsWith(deprecation.id) &&
            /^(?:-preview)?(?:-\d{4}-\d{2}-\d{2})?$/.test(
              id.slice(deprecation.id.length),
            ))),
    );
  };

  const existingModelIds = new Set(
    readdirSync(path.join(PROVIDERS_DIR, "openai", "models"))
      .filter((file) => file.endsWith(".json"))
      .map((file) => file.slice(0, -".json".length)),
  );
  for (const id of existingModelIds) {
    if (!detail.has(id) && (deprecations.has(id) || familyDeprecation(id))) {
      detail.set(id, { name: id });
    }
  }

  assertParsed(detail.size, "OpenAI model and snapshot entries");
  console.log(
    `Fetched ${pages.length} pages and parsed ${detail.size} model IDs`,
  );

  const names = [...detail.keys()];
  const deprecationFor = (id: string) =>
    deprecations.get(id) ?? familyDeprecation(id);
  const excluded = names.filter((name) => !isRelevant(name));
  if (excluded.length > 0) {
    console.log(
      `Excluded ${excluded.length} irrelevant IDs: ${excluded.join(", ")}`,
    );
  }
  const entries: ModelEntry[] = [];

  for (const name of names) {
    if (!isRelevant(name)) continue;

    const p = pricing.get(name);
    const d = detail.get(name);
    const c = compare.get(name);
    const deprecation = deprecationFor(name);
    const isOss = inferFamily(name) === "gpt-oss";
    const slugBase = d?.slug ?? name.replace(/-\d{4}-\d{2}-\d{2}$/, "");

    const entry: ModelEntry = {
      id: name,
      name: d?.display_name ?? name,
      family: inferFamily(name),
      description: d?.description,
      tagline: d?.tagline,
      license: isOss ? "apache-2.0" : "proprietary",
      open_weight: isOss,
    };

    if (d?.slug) {
      entry.page_url =
        slugBase === name
          ? `${MODEL_DOCS_BASE}/${name}`
          : `${MODEL_DOCS_BASE}/${slugBase}?snapshot=${name}`;
    }

    if (d?.deprecated || deprecation) entry.status = "deprecated";
    if (deprecation) {
      entry.deprecation_date = deprecation.deprecation_date;
      if (deprecation.retirement_date) {
        entry.retirement_date = deprecation.retirement_date;
      }
      if (deprecation.successor) entry.successor = deprecation.successor;
    }

    if (c?.context_window) entry.context_window = c.context_window;
    if (c?.max_output_tokens) entry.max_output_tokens = c.max_output_tokens;
    if (c?.max_input_tokens) entry.max_input_tokens = c.max_input_tokens;
    if (c?.modalities) entry.modalities = c.modalities;
    if (c?.knowledge_cutoff) {
      const cutoff = c.knowledge_cutoff;
      entry.knowledge_cutoff = `${cutoff.getUTCFullYear()}-${String(
        cutoff.getUTCMonth() + 1,
      ).padStart(2, "0")}`;
    }

    const caps = featuresToCapabilities(
      c?.supported_features,
      d?.supported_tools,
      c?.reasoning_tokens ?? false,
      c?.supported_endpoints,
    );
    if (Object.keys(caps).length > 0) entry.capabilities = caps;

    if (p) {
      entry.pricing = buildPricing({
        input: p.main.input,
        output: p.main.output,
        cached_input: p.main.cached_input,
        batch_input: p.batch.input,
        batch_output: p.batch.output,
      });
    }

    const tiers = pricingSections.get(name);
    if (tiers && tiers.length > 0) {
      if (!entry.pricing) entry.pricing = {};
      entry.pricing.tiers = tiers;
    }

    if (d?.supported_tools) {
      entry.tools = d.supported_tools;
    } else if (caps.tool_call) {
      entry.tools = ["function_calling"];
    }
    if (c?.supported_endpoints) entry.endpoints = c.supported_endpoints;
    if (c?.reasoning_tokens) entry.reasoning_tokens = true;
    if (c?.performance) entry.performance = c.performance;
    if (c?.latency) entry.speed = c.latency;
    if (c?.reasoning_tokens && c?.performance) entry.reasoning = c.performance;
    if (d?.snapshots) entry.snapshots = d.snapshots;
    const alias = snapshotAliases.get(name);
    if (alias) entry.alias = alias;
    if (d?.point_to) entry.successor = d.point_to;
    if (d?.pricing_notes) entry.pricing_notes = d.pricing_notes;

    const dateMatch = name.match(/(\d{4}-\d{2}-\d{2})$/);
    if (dateMatch) entry.release_date = dateMatch[1];

    const params = inferParameters(name);
    if (params) {
      entry.parameters = params.parameters;
      if (params.active_parameters) {
        entry.active_parameters = params.active_parameters;
      }
    }

    entries.push(entry);
  }

  assertParsed(entries.length, "OpenAI model entries");
  console.log(`Writing ${entries.length} models...`);
  let written = 0;
  for (const entry of entries) {
    written += entry.alias
      ? upsertModel("openai", entry)
        ? 1
        : 0
      : upsertWithSnapshot("openai", entry);
  }
  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
