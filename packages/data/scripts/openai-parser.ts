/**
 * Parsers for OpenAI's developers.openai.com JS bundle.
 * Extracts pricing, compare (technical specs), and detail (metadata) entries.
 */

const MODELS_PAGE = "https://developers.openai.com/api/docs/models/all";

// ── Types ──

export interface PricingEntry {
  name: string;
  main: Record<string, number>;
  batch: Record<string, number>;
}

export interface CompareEntry {
  name: string;
  context_window?: number;
  max_output_tokens?: number;
  modalities?: { input: string[]; output: string[] };
  knowledge_cutoff?: Date;
  supported_features?: string[];
  reasoning_tokens?: boolean;
  performance?: number;
  latency?: number;
}

export interface DetailEntry {
  name: string;
  slug?: string;
  display_name?: string;
  description?: string;
  type?: string;
  supported_tools?: string[];
  deprecated?: boolean;
}

// ── Bundle discovery ──

export async function fetchBundle(): Promise<string> {
  console.log("Fetching models page...");
  const res = await fetch(MODELS_PAGE);
  if (!res.ok) throw new Error(`Failed to fetch models page: ${res.status}`);
  const html = await res.text();

  const islandMatch = html.match(
    /component-url="(\/_astro\/AllModels\.[^"]+\.js)"/,
  );
  if (!islandMatch) throw new Error("Could not find AllModels component URL");

  const allModelsUrl = `https://developers.openai.com${islandMatch[1]}`;
  console.log("Found AllModels bundle:", islandMatch[1]);

  const jsRes = await fetch(allModelsUrl);
  if (!jsRes.ok)
    throw new Error(`Failed to fetch AllModels bundle: ${jsRes.status}`);
  const allModelsJs = await jsRes.text();

  const dataMatch = allModelsJs.match(
    /from"(\.\/models-page-data\.react\.[^"]+\.js)"/,
  );
  if (!dataMatch)
    throw new Error(
      "Could not find models-page-data import in AllModels bundle",
    );

  const base = allModelsUrl.replace(/\/[^/]+$/, "/");
  const bundleUrl = base + dataMatch[1].replace("./", "");
  console.log("Fetching JS bundle:", bundleUrl);

  const bundleRes = await fetch(bundleUrl);
  if (!bundleRes.ok)
    throw new Error(`Failed to fetch bundle: ${bundleRes.status}`);
  const js = await bundleRes.text();
  console.log(`Bundle size: ${(js.length / 1024).toFixed(0)}KB`);

  return js;
}

// ── Parsers ──

function parseKV(s: string): Record<string, number> {
  const obj: Record<string, number> = {};
  for (const pair of s.split(",")) {
    const [k, v] = pair.split(":");
    const key = k.replace(/"/g, "");
    const num = Number(v?.replace(/"/g, ""));
    if (!Number.isNaN(num)) obj[key] = num;
  }
  return obj;
}

function parseArr(s: string): string[] {
  return s
    ? s
        .split(",")
        .map((x) => x.replace(/"/g, "").trim())
        .filter(Boolean)
    : [];
}

export function parsePricing(js: string): Map<string, PricingEntry> {
  const map = new Map<string, PricingEntry>();
  const regex =
    /\{"name":"([^"]+)"(?:,"current_snapshot":"[^"]*")?(?:,"description":"[^"]*")?(?:,"units":\{[^}]*\})?,"values":\{"main":\{([^}]+)\}(?:,"batch":\{([^}]+)\})?/g;

  let match;
  while ((match = regex.exec(js)) !== null) {
    const name = match[1];
    if (map.has(name) || /\d{4}-\d{2}-\d{2}/.test(name)) continue;
    map.set(name, {
      name,
      main: parseKV(match[2]),
      batch: parseKV(match[3] ?? ""),
    });
  }
  return map;
}

export function parseCompareEntries(js: string): Map<string, CompareEntry> {
  const map = new Map<string, CompareEntry>();
  const regex =
    /\{name:"([^"]+)",slug:"([^"]+)",performance:(\d+),latency:(\d+),modalities:\{input:\[([^\]]*)\],output:\[([^\]]*)\]\}(?:,supported_endpoints:\[[^\]]*\])?(?:,context_window:([\de.]+))?(?:,max_output_tokens:([\de.]+))?(?:,knowledge_cutoff:new Date\((\d+)\))?(?:,supported_features:\[([^\]]*)\])?[^}]*?(?:,reasoning_tokens:(!?[01]))?/g;

  let match;
  while ((match = regex.exec(js)) !== null) {
    const name = match[1];
    if (map.has(name)) continue;
    map.set(name, {
      name,
      performance: Number(match[3]),
      latency: Number(match[4]),
      context_window: match[7] ? Number(match[7]) : undefined,
      max_output_tokens: match[8] ? Number(match[8]) : undefined,
      modalities: { input: parseArr(match[5]), output: parseArr(match[6]) },
      knowledge_cutoff: match[9] ? new Date(Number(match[9])) : undefined,
      supported_features: match[10] ? parseArr(match[10]) : undefined,
      reasoning_tokens: match[11] === "!0",
    });
  }
  return map;
}

export function parseDetailEntries(js: string): Map<string, DetailEntry> {
  const map = new Map<string, DetailEntry>();
  const regex =
    /\{name:"([^"]+)",slug:"([^"]+)",display_name:"([^"]+)",current_snapshot:"[^"]*",tagline:"[^"]*",description:`([^`]*)`[^}]*?type:"([^"]*)"[^}]*?(?:supported_tools:\[([^\]]*)\])?/g;

  let match;
  while ((match = regex.exec(js)) !== null) {
    map.set(match[1], {
      name: match[1],
      slug: match[2],
      display_name: match[3],
      description: match[4].split("\n")[0].trim(),
      type: match[5],
      supported_tools: match[6] ? parseArr(match[6]) : undefined,
    });
  }

  const deprecatedRegex = /\{name:"([^"]+)"[^}]*?deprecated:(!?[01])/g;
  while ((match = deprecatedRegex.exec(js)) !== null) {
    const existing = map.get(match[1]);
    if (existing) existing.deprecated = match[2] === "!0";
  }
  return map;
}
