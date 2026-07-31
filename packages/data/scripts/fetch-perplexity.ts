import {
  assertParsed,
  envOrNull,
  inferFamily,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Perplexity models from:
 * 1. Docs .md endpoint (model list + pricing, embedded as a PRICING literal)
 * 2. Sonar model detail pages (context window, description)
 * 3. /v1/models API (release dates, needs key)
 *
 * Source history: the model list came from /v1/models, which now answers 401
 * without a key. The docs page carries the same catalog plus rates in an
 * `export const PRICING` literal that the pricing widget reads, so the list is
 * derived from there and the API is optional enrichment.
 */

const sources = readSources("perplexity");
const API_URL = sources.api as string;
const DOCS_MD = sources.docs as string;

const PROVIDER_MAP: Record<string, string> = {
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  nvidia: "nvidia",
  "x-ai": "xai",
  xai: "xai",
  perplexity: "perplexity",
  "z-ai": "zai",
  zai: "zai",
  moonshotai: "moonshot",
  moonshot: "moonshot",
};

/**
 * Perplexity re-hosts third-party models under its own namespace
 * (`perplexity/glm-5.2`), so the id prefix names the host, not the creator.
 * The PRICING literal's `group` is the only place the real creator appears.
 */
const GROUP_MAP: Record<string, string> = {
  perplexity: "perplexity",
  anthropic: "anthropic",
  openai: "openai",
  google: "google",
  xai: "xai",
  "z.ai": "zai",
  "moonshot ai": "moonshot",
  nvidia: "nvidia",
};

/** One entry of the PRICING literal the docs pricing widget reads. */
interface EmbeddedModel {
  group: string | null;
  id: string;
  input?: number;
  output?: number;
  cache?: number;
}

/**
 * Pull the catalog out of `export const PRICING = { ... "models": [ ... ] }`.
 * The page carries more than one `models` array; only the grouped one is the
 * Agent API catalog, the other holds Sonar presets.
 */
function parseEmbeddedModels(md: string): EmbeddedModel[] {
  for (const m of md.matchAll(/"models":\s*\[/g)) {
    const start = md.indexOf("[", m.index);
    let depth = 0;
    let end = start;
    for (; end < md.length; end++) {
      if (md[end] === "[") depth++;
      else if (md[end] === "]" && --depth === 0) break;
    }
    try {
      const arr = JSON.parse(md.slice(start, end + 1)) as EmbeddedModel[];
      if (arr.length > 0 && arr.every((e) => e.group && e.id)) return arr;
    } catch {
      // not the array we want
    }
  }
  return [];
}

interface PPLXModel {
  id: string;
  object: string;
  created: number;
  owned_by: string;
}

interface DocsPricing {
  input: number;
  output: number;
  cached_input?: number;
}

function extractCreatedBy(id: string): string {
  const slash = id.indexOf("/");
  if (slash === -1) return "perplexity";
  const prefix = id.slice(0, slash);
  return PROVIDER_MAP[prefix] ?? prefix;
}

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

// ── Parse docs markdown for pricing ──

function parseDocsPricing(md: string): Map<string, DocsPricing> {
  const pricing = new Map<string, DocsPricing>();

  for (const line of md.split("\n")) {
    if (!line.startsWith("|")) continue;
    if (!line.includes("`")) continue;

    // Extract model ID from backticks: `perplexity/sonar`
    const idMatch = line.match(/`([^`]+)`/);
    if (!idMatch) continue;
    const id = idMatch[1];

    const cells = line.split("|").map((c) => c.trim());
    // cells: ["", model, input, output, cache, docs, ""]
    if (cells.length < 5) continue;

    const input = parseDollar(cells[2]);
    const output = parseDollar(cells[3]);
    if (input == null || output == null) continue;

    const cached = cells[4]?.includes("discount")
      ? undefined
      : parseDollar(cells[4]);

    pricing.set(id, { input, output, cached_input: cached });
  }

  return pricing;
}

// ── Main ──

async function main() {
  console.log("Fetching Perplexity models...");

  const docsMd = await fetch(DOCS_MD).then((r) => r.text());

  const embedded = parseEmbeddedModels(docsMd);
  const creators = new Map<string, string>();
  for (const e of embedded) {
    const creator = GROUP_MAP[(e.group ?? "").toLowerCase()];
    if (creator) creators.set(e.id, creator);
  }

  const docsPricing = parseDocsPricing(docsMd);
  for (const e of embedded) {
    if (docsPricing.has(e.id) || e.input == null || e.output == null) continue;
    docsPricing.set(e.id, {
      input: e.input,
      output: e.output,
      ...(e.cache != null ? { cached_input: e.cache } : {}),
    });
  }

  console.log(
    `Found ${embedded.length} models from docs, ${docsPricing.size} with pricing`,
  );
  assertParsed(docsPricing.size, "perplexity");

  // Optional: the API adds release dates but answers 401 without a key.
  let apiModels: PPLXModel[] = [];
  const apiKey = envOrNull("PERPLEXITY_API_KEY", "PPLX_API_KEY");
  if (apiKey) {
    const res = await fetch(API_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      apiModels = ((await res.json()) as { data?: PPLXModel[] }).data ?? [];
      console.log(`Found ${apiModels.length} models from API`);
    }
  }
  const apiRes = { data: apiModels };

  let written = 0;
  for (const m of apiRes.data) {
    const releaseDate =
      m.created > 1577836800
        ? new Date(m.created * 1000).toISOString().split("T")[0]
        : undefined;
    const isSearch = m.id.includes("search") || m.id.includes("sonar");
    const p = docsPricing.get(m.id);

    written += upsertWithSnapshot("perplexity", {
      id: m.id,
      name: m.id,
      created_by: creators.get(m.id) ?? extractCreatedBy(m.id),
      family: inferFamily(m.id),
      license: "proprietary",
      release_date: releaseDate,
      capabilities: {
        streaming: true,
        ...(isSearch ? { tool_call: true } : {}),
      },
      ...(p
        ? {
            pricing: {
              input: p.input,
              output: p.output,
              ...(p.cached_input != null
                ? { cached_input: p.cached_input }
                : {}),
            },
          }
        : {}),
    });
  }

  // Also write docs-only models not in API
  for (const [id, p] of docsPricing) {
    const alreadyWritten = apiRes.data.some((m) => m.id === id);
    if (alreadyWritten) continue;

    written += upsertWithSnapshot("perplexity", {
      id,
      name: id,
      created_by: creators.get(id) ?? extractCreatedBy(id),
      family: inferFamily(id),
      license: "proprietary",
      capabilities: { streaming: true },
      pricing: {
        input: p.input,
        output: p.output,
        ...(p.cached_input != null ? { cached_input: p.cached_input } : {}),
      },
    });
  }

  // Fetch Sonar models from detail pages
  const sonarPages = sources.sonar as string[];

  for (const url of sonarPages) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const md = await res.text();

      const id =
        md.match(/"model":\s*"(sonar[\w.-]*)"/)?.[1] ??
        url.split("/").pop()?.replace(".md", "");
      if (!id) continue;

      // Pricing: \$X ... Per 1M Tokens
      const prices = [
        ...md.matchAll(/\\?\$([\d.]+)[\s\S]*?Per 1M Tokens/g),
      ].map((m) => Number(m[1]));

      // Context window: "<h3 ...>128K context length</h3>"
      const ctxMatch = md.match(/(\d+)K\s+context\s+length/i);
      const contextWindow = ctxMatch ? Number(ctxMatch[1]) * 1000 : undefined;

      // Description: inside <p className="text-lg text-foreground leading-relaxed">...</p>
      const descMatch = md.match(
        /<p\s+className="text-lg[^"]*">\s*\n?\s*(.+?)\s*\n?\s*<\/p>/,
      );
      const description = descMatch ? descMatch[1].trim() : undefined;

      // Tagline: inside <p className="text-sm text-muted-foreground">...</p> after the h1
      const taglineMatch = md.match(
        /<h1[^>]*>.*?<\/h1>\s*\n\s*<p\s+className="text-sm text-muted-foreground">(.+?)<\/p>/,
      );
      const tagline = taglineMatch ? taglineMatch[1].trim() : undefined;

      const pageUrl = url.replace(/\.md$/, "");
      const entry = {
        id,
        name: id,
        created_by: "perplexity",
        family: "sonar",
        license: "proprietary",
        page_url: pageUrl,
        ...(description ? { description } : {}),
        ...(tagline ? { tagline } : {}),
        ...(contextWindow ? { context_window: contextWindow } : {}),
        capabilities: {
          streaming: true,
          tool_call: true,
          ...(id.includes("reasoning") ? { reasoning: true } : {}),
        },
        ...(prices.length >= 2
          ? { pricing: { input: prices[0], output: prices[1] } }
          : {}),
      };

      written += upsertWithSnapshot("perplexity", entry);
    } catch {}
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
