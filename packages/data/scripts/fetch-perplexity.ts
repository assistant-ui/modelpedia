import {
  inferFamily,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Perplexity models from:
 * 1. /v1/models API (model list + release dates)
 * 2. Docs .md endpoint (pricing)
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
};

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

  const [apiRes, docsMd] = await Promise.all([
    fetch(API_URL).then((r) => r.json()) as Promise<{ data: PPLXModel[] }>,
    fetch(DOCS_MD).then((r) => r.text()),
  ]);

  const docsPricing = parseDocsPricing(docsMd);
  console.log(
    `Found ${apiRes.data.length} models from API, ${docsPricing.size} with pricing from docs`,
  );

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
      created_by: extractCreatedBy(m.id),
      family: inferFamily(m.id),
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
      created_by: extractCreatedBy(id),
      family: inferFamily(id),
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

      const entry = {
        id,
        name: id,
        created_by: "perplexity",
        family: "sonar",
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
