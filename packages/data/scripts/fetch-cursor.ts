import {
  inferFamily,
  inferParameters,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Cursor models from two sources:
 * 1. Pricing page (.md) — pricing table with per-token rates
 * 2. JS bundle — structured model specs (speed, intelligence, context, capabilities)
 * No API key needed.
 */

const sources = readSources("cursor");
const PRICING_MD = sources.pricing as string;
const PAGE_URL = sources.page as string;

// ── Types ──

interface BundleModel {
  id: string;
  slug: string;
  name: string;
  provider: string;
  speedTier: string | null;
  intelligenceTier: string | null;
  costTier: string | null;
  contextWindow: string | null;
  maxContextWindow: string | null;
  isAgent: boolean | null;
  supportsImage: boolean | null;
  thinking: boolean | null;
}

interface PricingRow {
  model: string;
  provider: string;
  input: number | undefined;
  output: number | undefined;
  cacheWrite: number | undefined;
  cacheRead: number | undefined;
  notes: string | undefined;
}

// ── Helpers ──

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

function stripMdLinks(s: string): string {
  return s.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function parseContextTokens(s: string | null): number | undefined {
  if (!s || s === "-") return undefined;
  const m = s.match(/([\d.]+)\s*([MKk])/);
  if (!m) return undefined;
  const num = Number(m[1]);
  return m[2] === "M" || m[2] === "m" ? num * 1_000_000 : num * 1_000;
}

const PROVIDER_MAP: Record<string, string> = {
  anthropic: "anthropic",
  google: "google",
  openai: "openai",
  xai: "xai",
  moonshot: "moonshot",
  cursor: "cursor",
};

function normalizeProvider(raw: string): string {
  return PROVIDER_MAP[raw.toLowerCase()] ?? raw.toLowerCase();
}

function toModelId(name: string): string {
  return name
    .replace(/\(Fast mode\)/gi, "Fast")
    .replace(/\(Fast\)/gi, "Fast")
    .replace(/[()]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// ── Tier → 1-5 scale mapping ──

function speedTierToNumber(tier: string | null): number | undefined {
  if (!tier) return undefined;
  const map: Record<string, number> = {
    fast: 4,
    medium: 3,
    slow: 2,
  };
  return map[tier];
}

function intelligenceTierToNumber(tier: string | null): number | undefined {
  if (!tier) return undefined;
  const map: Record<string, number> = {
    frontier: 5,
    high: 4,
    moderate: 3,
    low: 2,
  };
  return map[tier];
}

// ── Parse JS bundle for structured model data ──

async function fetchBundleModels(): Promise<Map<string, BundleModel>> {
  const models = new Map<string, BundleModel>();

  console.log("Fetching page HTML for JS bundle...");
  const pageRes = await fetch(PAGE_URL);
  if (!pageRes.ok) {
    console.warn(`Failed to fetch page HTML: ${pageRes.status}`);
    return models;
  }
  const html = await pageRes.text();

  // Find the component chunk URL containing model data
  const componentMatch = html.match(/52:I\[\d+,\[([^\]]+)\]/);
  if (!componentMatch) {
    console.warn("Could not find model component reference in page");
    return models;
  }

  const urls =
    componentMatch[1].match(/"([^"]+)"/g)?.map((s) => s.replace(/"/g, "")) ??
    [];

  for (const url of urls) {
    const fullUrl = `https://cursor.com${url}`;
    const res = await fetch(fullUrl);
    if (!res.ok) continue;
    const js = await res.text();

    // Look for the MODELS array
    const arrayStart = js.indexOf('[{id:"');
    if (arrayStart === -1) continue;

    // Verify it contains model data
    if (!js.includes("speedTier") || !js.includes("intelligenceTier")) continue;

    console.log(`Found model data in bundle (${js.length} bytes)`);

    // Extract individual model objects by splitting on boundaries
    // Each model starts with {id:" (except the first which starts with [{id:")
    const raw = js.slice(arrayStart);
    const entries = raw.split(/\{id:"/).filter(Boolean);

    for (const entry of entries) {
      // Skip long-context pricing variants
      if (entry.startsWith("claude-") && entry.includes('name:"Long Context'))
        continue;
      if (entry.startsWith("gpt-") && entry.includes('name:"Long Context'))
        continue;

      const get = (key: string): string | null => {
        const m = entry.match(new RegExp(`${key}:"([^"]*?)"`));
        return m ? m[1] : null;
      };
      const getBool = (key: string): boolean | null => {
        const m = entry.match(new RegExp(`${key}:(!?[01])`));
        if (!m) return null;
        return m[1] === "!0";
      };

      const id = entry.match(/^([^"]+)/)?.[1];
      const slug = get("slug");
      if (!id || !slug) continue;

      models.set(toModelId(get("name") ?? id), {
        id,
        slug,
        name: get("name") ?? id,
        provider: get("provider") ?? "",
        speedTier: get("speedTier"),
        intelligenceTier: get("intelligenceTier"),
        costTier: get("costTier"),
        contextWindow: get("contextWindow"),
        maxContextWindow: get("maxContextWindow"),
        isAgent: getBool("isAgent"),
        supportsImage: getBool("supportsImage"),
        thinking: getBool("thinking"),
      });
    }

    break; // Found what we need
  }

  return models;
}

// ── Parse pricing from .md ──

function parsePricingTable(md: string): Map<string, PricingRow> {
  const rows = new Map<string, PricingRow>();
  const lines = md.split("\n");

  let inModelTable = false;
  const colMap: Record<string, number> = {};

  for (const line of lines) {
    if (!line.startsWith("|")) {
      if (inModelTable) break;
      continue;
    }

    const header = line.toLowerCase();
    if (header.includes("model") && header.includes("provider")) {
      inModelTable = true;
      const cells = line
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      for (let i = 0; i < cells.length; i++) {
        const h = cells[i].toLowerCase();
        if (h.includes("model")) colMap.model = i;
        else if (h.includes("provider")) colMap.provider = i;
        else if (h === "input") colMap.input = i;
        else if (h.includes("cache write")) colMap.cacheWrite = i;
        else if (h.includes("cache read")) colMap.cacheRead = i;
        else if (h === "output") colMap.output = i;
        else if (h.includes("note")) colMap.notes = i;
      }
      continue;
    }

    if (/^\|\s*[-:]+/.test(line)) continue;
    if (!inModelTable) continue;

    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter(Boolean);
    if (cells.length < 4) continue;

    const name = stripMdLinks(cells[colMap.model] ?? "").trim();
    if (!name || name === "-") continue;

    const id = toModelId(name);
    const notesRaw = colMap.notes != null ? cells[colMap.notes] : undefined;
    const notes =
      notesRaw && notesRaw !== "—" && notesRaw !== "-"
        ? stripMdLinks(notesRaw).trim()
        : undefined;
    rows.set(id, {
      model: name,
      provider: cells[colMap.provider] ?? "",
      input: parseDollar(cells[colMap.input] ?? ""),
      output: parseDollar(cells[colMap.output] ?? ""),
      cacheWrite: parseDollar(cells[colMap.cacheWrite] ?? ""),
      cacheRead: parseDollar(cells[colMap.cacheRead] ?? ""),
      notes,
    });
  }

  // Auto pricing mini-table
  const autoSection = md.match(
    /### Auto pricing\s*\n([\s\S]*?)(?=\n###|\n## )/,
  );
  if (autoSection) {
    const autoLines = autoSection[1]
      .split("\n")
      .filter((l) => l.startsWith("|"));
    let input = 0;
    let output = 0;
    let cacheRead = 0;
    for (const l of autoLines) {
      const cells = l
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      if (cells.length < 2) continue;
      const type = cells[0].toLowerCase();
      const price = parseDollar(cells[1]);
      if (!price) continue;
      if (type.includes("input") || type.includes("cache write")) input = price;
      if (type.includes("output")) output = price;
      if (type.includes("cache read")) cacheRead = price;
    }
    if (input || output) {
      rows.set("auto", {
        model: "Auto",
        provider: "Cursor",
        input,
        output,
        cacheWrite: undefined,
        cacheRead,
        notes: undefined,
      });
    }
  }

  return rows;
}

// ── Main ──

async function main() {
  console.log("Fetching Cursor models...");

  // Fetch both sources in parallel
  const [mdRes, bundleModels] = await Promise.all([
    fetch(PRICING_MD).then((r) => {
      if (!r.ok) throw new Error(`Failed to fetch pricing: ${r.status}`);
      return r.text();
    }),
    fetchBundleModels(),
  ]);

  const pricingMap = parsePricingTable(mdRes);

  console.log(
    `Parsed: ${pricingMap.size} from pricing, ${bundleModels.size} from bundle`,
  );

  // Merge: pricing is the primary source (has all models), bundle enriches
  let written = 0;
  const seen = new Set<string>();

  for (const [id, pricing] of pricingMap) {
    if (seen.has(id)) continue;
    seen.add(id);

    const bundle = bundleModels.get(id);
    const createdBy = normalizeProvider(pricing.provider);
    const params = inferParameters(id);

    // Capabilities from bundle data
    const caps: Record<string, boolean> = { streaming: true };
    if (bundle?.isAgent) caps.tool_call = true;
    else if (["anthropic", "openai", "google", "xai"].includes(createdBy)) {
      caps.tool_call = true;
    }
    if (bundle?.supportsImage) caps.vision = true;
    else if (["anthropic", "openai", "google"].includes(createdBy)) {
      caps.vision = true;
    }
    if (bundle?.thinking) caps.reasoning = true;
    else if (
      /codex/.test(id) ||
      /gpt-5/.test(id) ||
      /claude.*(opus|sonnet)/.test(id) ||
      /grok/.test(id)
    ) {
      caps.reasoning = true;
    }

    // Modalities
    const input: string[] = ["text"];
    const output: string[] = ["text"];
    if (caps.vision) input.push("image");
    if (id.includes("image")) output.push("image");

    // Context windows
    const contextWindow = parseContextTokens(bundle?.contextWindow ?? null);
    const maxContextWindow = parseContextTokens(
      bundle?.maxContextWindow ?? null,
    );

    // Pricing
    const pricingData: Record<string, number> = {};
    if (pricing.input != null) pricingData.input = pricing.input;
    if (pricing.output != null) pricingData.output = pricing.output;
    if (pricing.cacheWrite != null)
      pricingData.cache_write = pricing.cacheWrite;
    if (pricing.cacheRead != null) pricingData.cached_input = pricing.cacheRead;

    const entry: ModelEntry = {
      id,
      name: bundle?.name ?? pricing.model,
      created_by: createdBy,
      family: inferFamily(id),
      context_window: contextWindow,
      ...(maxContextWindow && maxContextWindow !== contextWindow
        ? { max_context_window: maxContextWindow }
        : {}),
      speed: speedTierToNumber(bundle?.speedTier ?? null),
      performance: intelligenceTierToNumber(bundle?.intelligenceTier ?? null),
      capabilities: caps,
      modalities: { input, output },
      parameters: params?.parameters,
      active_parameters: params?.active_parameters,
      page_url: `${PAGE_URL}#${bundle?.slug ?? id}`,
    };

    if (Object.keys(pricingData).length > 0) entry.pricing = pricingData;
    if (pricing.notes) entry.pricing_notes = [pricing.notes];

    if (upsertModel("cursor", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
