import {
  assertParsed,
  envOrNull,
  inferFamily,
  type ModelEntry,
  normalizeDate,
  parseMarkdownTable,
  readSources,
  runGenerate,
  upsertModel,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch xAI models from:
 * 1. /developers/models.md (pricing, context window, aliases, knowledge cutoff)
 * 2. /v1/models API (release dates, needs key)
 *
 * Source history: the docs briefly rendered pricing client-side from a registry
 * embedded in the HTML (auth_mgmt.LanguageModel and friends), and this script
 * walked that JSON. As of 2026-07 the page is a React Server Components payload
 * and those anchors are gone, but models.md carries the tables again. Markdown
 * tables survive a site rewrite; a serialized component tree does not.
 */

const sources = readSources("xai");
const DOCS_URL = sources.docs as string;
const API_URL = sources.api as string;
const FULL_DOCS_URL = sources.full_docs as string;

interface DocsModel {
  id: string;
  modalities?: { input: string[]; output: string[] };
  context_window?: number;
  model_type?: string;
  pricing?: {
    input?: number;
    output?: number;
    cached_input?: number;
  };
  pricing_notes?: string[];
}

interface ApiModel {
  id: string;
  created: number;
}

// ── Cell parsing ──

/** "500k" → 500000, "1M" → 1000000 */
function parseTokens(cell: string): number | undefined {
  const m = cell.trim().match(/^([\d.]+)\s*([kKmM])?$/);
  if (!m) return undefined;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return undefined;
  const mult = m[2]?.toLowerCase() === "m" ? 1e6 : m[2] ? 1e3 : 1;
  return Math.round(n * mult);
}

/** "$2.00" → 2 */
function parseUsd(cell: string): number | undefined {
  const m = cell.match(/\$\s*([\d.]+)/);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Split a pricing-table model cell into its id and any tier qualifier.
 * "grok-4.5 (< 200k prompt tokens)" → { id: "grok-4.5", tier: "< 200k prompt tokens" }
 */
function splitModelCell(cell: string): { id: string; tier?: string } {
  const m = cell.trim().match(/^`?([^\s(`]+)`?\s*(?:\(([^)]*)\))?$/);
  if (!m) return { id: cell.trim() };
  return { id: m[1], tier: m[2]?.trim() };
}

/** Lines of the section introduced by `heading`, up to the next heading. */
function section(md: string, heading: string): string[] {
  const lines = md.split("\n");
  const start = lines.findIndex(
    (l) => l.trim().toLowerCase() === heading.toLowerCase(),
  );
  if (start === -1) return [];
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^#{1,6}\s/.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

// ── Table parsers ──

/**
 * Text API pricing. A model billed with long-context uplift occupies two rows
 * that differ only by the parenthetical threshold; the lower tier is the
 * headline price and the upper one becomes a note.
 */
function parseTextPricing(md: string): Map<string, DocsModel> {
  const out = new Map<string, DocsModel>();
  const rows = parseMarkdownTable(section(md, "### Text API Pricing"));
  if (rows.length === 0) return out;

  const header = rows[0].map((h) => h.toLowerCase());
  const col = (needle: string) => header.findIndex((h) => h.includes(needle));
  const iCtx = col("context");
  const iIn = header.findIndex((h) => h.startsWith("input"));
  const iCached = col("cached");
  const iOut = header.findIndex((h) => h.startsWith("output"));

  for (const cells of rows.slice(1)) {
    const { id, tier } = splitModelCell(cells[0] ?? "");
    if (!id || !id.startsWith("grok")) continue;

    const existing = out.get(id);
    if (existing) {
      // Second row for the same model: record the uplift, keep the base price.
      const price = iIn >= 0 ? parseUsd(cells[iIn] ?? "") : undefined;
      if (tier && price != null) {
        existing.pricing_notes = [
          ...(existing.pricing_notes ?? []),
          `${tier}: $${price} input / $${iOut >= 0 ? parseUsd(cells[iOut] ?? "") : "?"} output per 1M tokens.`,
        ];
      }
      continue;
    }

    const pricing: DocsModel["pricing"] = {};
    if (iIn >= 0) pricing.input = parseUsd(cells[iIn] ?? "");
    if (iOut >= 0) pricing.output = parseUsd(cells[iOut] ?? "");
    if (iCached >= 0) pricing.cached_input = parseUsd(cells[iCached] ?? "");

    out.set(id, {
      id,
      // The pricing table says nothing about modalities; leaving them unset
      // preserves richer values already on disk (grok-4.5 accepts images).
      context_window: iCtx >= 0 ? parseTokens(cells[iCtx] ?? "") : undefined,
      model_type: "chat",
      pricing: Object.values(pricing).some((v) => v != null)
        ? pricing
        : undefined,
      pricing_notes:
        tier && Object.values(pricing).some((v) => v != null)
          ? [`Base rate applies ${tier}.`]
          : undefined,
    });
  }
  return out;
}

/** Imagine (image and video generation) models, priced per image or per second. */
function parseImaginePricing(md: string): Map<string, DocsModel> {
  const out = new Map<string, DocsModel>();
  for (const cells of parseMarkdownTable(section(md, "### Imagine Pricing"))) {
    const { id } = splitModelCell(cells[0] ?? "");
    if (!id.startsWith("grok") || /^model$/i.test(id)) continue;
    const cost = (cells[1] ?? "").trim();
    if (!cost) continue;
    const video = id.includes("video");
    out.set(id, {
      id,
      modalities: { input: ["text"], output: [video ? "video" : "image"] },
      model_type: video ? "video" : "image",
      pricing_notes: [`${cost.replace(/\s+/g, " ")}.`],
    });
  }
  return out;
}

/** Voice models, whose ids appear inside the mode label. */
function parseVoicePricing(md: string): Map<string, DocsModel> {
  const out = new Map<string, DocsModel>();
  for (const cells of parseMarkdownTable(section(md, "### Voice Pricing"))) {
    const label = cells[0] ?? "";
    const id = label.match(/\(([a-z0-9.-]*grok[a-z0-9.-]*)\)/i)?.[1];
    if (!id) continue;
    const cost = (cells[1] ?? "").replace(/<br\s*\/?>/g, "; ").trim();
    out.set(id, {
      id,
      modalities: { input: ["audio", "text"], output: ["audio"] },
      model_type: "audio",
      pricing_notes: cost ? [`${cost.replace(/\s+/g, " ")}.`] : undefined,
    });
  }
  return out;
}

/**
 * Extract knowledge cutoff from prose like:
 *   "The knowledge cut-off date of Grok 4.5 is February 1, 2026."
 * Returns a map of model-prefix → normalised date (e.g. "grok-4.5" → "2026-02-01").
 */
function parseKnowledgeCutoffs(md: string): Map<string, string> {
  const cutoffs = new Map<string, string>();
  const re =
    /knowledge\s+cut[- ]?off\s+(?:date\s+)?of\s+(.+?)\s+is\s+([A-Z][a-z]+\s+\d{1,2},?\s+\d{4}|[A-Z][a-z]+,?\s+\d{4})/gi;
  for (const m of md.matchAll(re)) {
    const date = normalizeDate(m[2].replace(/,/g, ""));
    if (!date) continue;
    const names = m[1]
      .split(/\s+and\s+|,\s*/i)
      .map((n) => n.trim().toLowerCase().replace(/\s+/g, "-"))
      .filter(Boolean);
    for (const name of names) cutoffs.set(name, date);
  }
  return cutoffs;
}

/**
 * Recover the undated aliases (`grok-4.20`, `grok-4.20-multi-agent`).
 *
 * The pricing table only carries dated releases, but the docs state that
 * `<modelname>` resolves to the latest stable build and reference the bare ids
 * throughout the guides. Specs come from the longest dated sibling that shares
 * the prefix; no alias link is asserted, because which snapshot a bare id
 * currently points at is nowhere stated and guessing it would produce a wrong
 * alias relationship rather than a missing one.
 */
function recoverAliases(
  fullDocs: string,
  priced: Map<string, DocsModel>,
): Map<string, DocsModel> {
  const out = new Map<string, DocsModel>();
  const mentioned = new Set(
    [...fullDocs.matchAll(/`(grok-[a-z0-9.-]+)`/g)].map((m) => m[1]),
  );

  for (const id of mentioned) {
    if (priced.has(id) || out.has(id)) continue;
    // The convention is `<modelname>-<date>`, so require a dated sibling. Any
    // longer id would also promote product lines: `grok-imagine-image` would
    // make `grok-imagine` a model, and `grok-build-0.1` would make `grok-build`
    // one, neither of which is orderable.
    const dated = new RegExp(`^${id.replace(/[.\\]/g, "\\$&")}-\\d{4}(?:-|$)`);
    const sibling = [...priced.entries()]
      .filter(([other]) => dated.test(other))
      .sort(([a], [b]) => b.length - a.length)[0]?.[1];
    if (!sibling) continue;
    out.set(id, { ...sibling, id });
  }
  return out;
}

async function main() {
  console.log("Fetching xAI models from docs...");

  const md = await fetch(DOCS_URL).then((r) => r.text());

  const docsModels = parseTextPricing(md);
  for (const [id, m] of parseImaginePricing(md)) docsModels.set(id, m);
  for (const [id, m] of parseVoicePricing(md)) docsModels.set(id, m);

  const fullDocs = await fetch(FULL_DOCS_URL)
    .then((r) => (r.ok ? r.text() : ""))
    .catch(() => "");
  if (fullDocs) {
    const aliases = recoverAliases(fullDocs, docsModels);
    for (const [id, m] of aliases) docsModels.set(id, m);
    if (aliases.size > 0) {
      console.log(
        `Recovered ${aliases.size} undated alias(es): ${[...aliases.keys()].join(", ")}`,
      );
    }
  }

  console.log(`Parsed ${docsModels.size} models from docs`);
  assertParsed(docsModels.size, "xai");

  const knowledgeCutoffs = parseKnowledgeCutoffs(md);
  if (knowledgeCutoffs.size > 0) {
    console.log(
      `Found knowledge cutoffs: ${[...knowledgeCutoffs.entries()].map(([k, v]) => `${k}=${v}`).join(", ")}`,
    );
  }

  // Optional: API for release dates
  const apiKey = envOrNull("XAI_API_KEY");
  const apiModels = new Map<string, ApiModel>();
  if (apiKey) {
    console.log("Fetching from API...");
    const res = await fetch(API_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const json = (await res.json()) as { data: ApiModel[] };
      for (const m of json.data) {
        if (m.id.startsWith("grok")) apiModels.set(m.id, m);
      }
      console.log(`Found ${apiModels.size} models from API`);
    }
  }

  let written = 0;
  for (const [id, doc] of docsModels) {
    const apiModel = apiModels.get(id);
    const releaseDate = apiModel
      ? new Date(apiModel.created * 1000).toISOString().split("T")[0]
      : undefined;

    // Match knowledge cutoff by prefix (e.g. "grok-4" matches "grok-4-1-fast-reasoning")
    let knowledgeCutoff: string | undefined;
    for (const [prefix, date] of knowledgeCutoffs) {
      if (
        id === prefix ||
        id.startsWith(`${prefix}-`) ||
        id.startsWith(`${prefix}.`)
      ) {
        knowledgeCutoff = date;
        break;
      }
    }

    const entry: ModelEntry = {
      id,
      name: id,
      family: inferFamily(id),
      license: "proprietary",
      page_url: "https://docs.x.ai/developers/models",
      context_window: doc.context_window,
      modalities: doc.modalities,
      model_type: doc.model_type,
      release_date: releaseDate,
      knowledge_cutoff: knowledgeCutoff,
      // A model the docs still list is active. Without this a model that was
      // wrongly retired (a broken run marks everything deprecated) stays
      // retired forever, because upsert never clears a field it is not given.
      status: "active",
    };

    if (doc.pricing) entry.pricing = doc.pricing;
    if (doc.pricing_notes?.length) entry.pricing_notes = doc.pricing_notes;

    written += upsertWithSnapshot("xai", entry);
  }

  // Mark models no longer listed as deprecated (skips ones already deprecated).
  const activeIds = new Set(docsModels.keys());
  const modelsDir = new URL("../providers/xai/models/", import.meta.url);
  for (const file of await Array.fromAsync(
    new Bun.Glob("*.json").scan(modelsDir.pathname),
  )) {
    const id = file.replace(".json", "");
    if (activeIds.has(id)) continue;
    const existing = await Bun.file(`${modelsDir.pathname}/${file}`).json();
    if (existing.status === "deprecated") continue;
    upsertModel("xai", { id, name: id, status: "deprecated" } as ModelEntry);
    written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
