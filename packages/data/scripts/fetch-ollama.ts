import { fetchJson, fetchText } from "./parse.ts";
import {
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Ollama models from their API and library pages.
 * No API key needed.
 */

const sources = readSources("ollama");
const API_URL = sources.api as string;
const SEARCH_URL = sources.search as string;
const CONCURRENCY = 8;

// ── Types ──

interface OllamaApiModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
}

interface SearchModelInfo {
  capabilities: string[];
  paramSizes: number[];
}

// ── Helpers ──

function extractCreator(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("llama") || n.includes("maverick") || n.includes("scout"))
    return "meta";
  if (n.includes("qwen")) return "qwen";
  if (n.includes("gemma") || n.includes("gemini")) return "google";
  if (
    n.includes("mistral") ||
    n.includes("ministral") ||
    n.includes("devstral") ||
    n.includes("codestral") ||
    n.includes("pixtral") ||
    n.includes("magistral")
  )
    return "mistral";
  if (n.includes("deepseek")) return "deepseek";
  if (n.includes("nemotron")) return "nvidia";
  if (n.includes("glm")) return "zhipu";
  if (n.includes("kimi")) return "moonshot";
  if (n.includes("minimax")) return "minimax";
  if (n.includes("gpt-oss")) return "openai";
  if (n.includes("phi")) return "microsoft";
  if (n.includes("granite")) return "ibm";
  if (n.includes("mimo")) return "xiaomi";
  if (n.includes("lfm")) return "liquid";
  if (n.includes("falcon")) return "tii";
  if (n.includes("rnj")) return "essentialai";
  if (n.includes("cogito")) return "deepcogito";
  return "unknown";
}

/** Extract parameter count (billions) from an API tag like ":70b", ":235b", ":1t". */
function parseTagParams(modelName: string): number | undefined {
  const tag = modelName.split(":")[1];
  if (!tag) return undefined;
  const bMatch = tag.match(/^(\d+(?:\.\d+)?)b\b/i);
  if (bMatch) return Number.parseFloat(bMatch[1]);
  const tMatch = tag.match(/^(\d+(?:\.\d+)?)t\b/i);
  if (tMatch) return Number.parseFloat(tMatch[1]) * 1000;
  return undefined;
}

/** Map Ollama search-page capability tags to ModelEntry capabilities. */
function mapCapabilities(tags: string[]): Record<string, boolean> {
  const caps: Record<string, boolean> = { streaming: true };
  for (const tag of tags) {
    if (tag === "vision") caps.vision = true;
    if (tag === "tools") caps.tool_call = true;
    if (tag === "thinking") caps.reasoning = true;
  }
  return caps;
}

/** Extract description from Ollama model page meta tags. */
function extractPageDescription(html: string): string | undefined {
  for (const re of [
    /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
    /<meta\s+property=["']og:description["']\s+content=["']([^"']+)["']/i,
  ]) {
    const m = html.match(re);
    if (m?.[1]) {
      const desc = m[1].trim();
      // Skip generic Ollama tagline
      if (desc.length > 30 && !desc.startsWith("Get up and running"))
        return desc;
    }
  }
  return undefined;
}

/** Extract license from model page text. */
function extractLicense(html: string): string | undefined {
  const patterns: [RegExp, string][] = [
    [/apache[\s-]*2\.0/i, "apache-2.0"],
    [/mit\s+license/i, "mit"],
    [/llama\s+[\d.]+\s+community\s+license/i, "llama-community"],
    [/gemma\s+terms\s+of\s+use/i, "gemma"],
    [/cc-by-nc-4\.0/i, "cc-by-nc-4.0"],
    [/cc-by-sa-4\.0/i, "cc-by-sa-4.0"],
    [/cc-by-4\.0/i, "cc-by-4.0"],
    [/deepseek\s+license/i, "deepseek"],
    [/nvidia\s+open\s+model\s+license/i, "nvidia-open"],
    [/qwen\s+license/i, "qwen"],
    [/tongyi\s+qianwen\s+license/i, "qwen"],
  ];
  for (const [re, license] of patterns) {
    if (re.test(html)) return license;
  }
  return undefined;
}

/** Extract context window from model page (first "XK context" match). */
function extractContextWindow(html: string): number | undefined {
  const m = html.match(/(\d+)[Kk]\s+context/i);
  if (m) {
    const k = Number.parseInt(m[1], 10);
    if (k >= 2 && k <= 2048) return k * 1024;
  }
  return undefined;
}

/** Extract parameters for the default variant from model page. */
function extractPageParams(
  html: string,
  modelName: string,
): { parameters: number; active_parameters?: number } | undefined {
  const escaped = modelName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // Look for a size tag followed by "latest" within nearby HTML
  // e.g., /library/llama3.3:70b" ... latest
  const tagLatest = html.match(
    new RegExp(
      `/library/${escaped}:(\\d+(?:\\.\\d+)?)b[^"]*"[\\s\\S]{0,300}?latest`,
      "i",
    ),
  );
  if (tagLatest) return { parameters: Number.parseFloat(tagLatest[1]) };

  // "XB total parameters (YB active)" pattern (MoE models)
  const moe = html.match(
    /(\d+(?:\.\d+)?)\s*[Bb]\s+total\s+param[\s\S]{0,30}?(\d+(?:\.\d+)?)\s*[Bb]\s+active/i,
  );
  if (moe)
    return {
      parameters: Number.parseFloat(moe[1]),
      active_parameters: Number.parseFloat(moe[2]),
    };

  // "XB parameter" or "X billion parameter" or "XB total parameter"
  const paramText = html.match(
    /(\d+(?:\.\d+)?)\s*[Bb](?:illion)?\s+(?:total\s+)?param/i,
  );
  if (paramText) return { parameters: Number.parseFloat(paramText[1]) };

  return undefined;
}

/** Run async tasks with concurrency limit. */
async function pMap<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx++;
      results[i] = await fn(items[i]);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  return results;
}

// ── Data fetching ──

async function fetchFromApi(): Promise<OllamaApiModel[]> {
  try {
    const json = await fetchJson<{ models: OllamaApiModel[] }>(API_URL);
    return json.models;
  } catch {
    return [];
  }
}

/** Parse search page for model names, descriptions, and capability tags. */
async function fetchFromSearch(): Promise<Map<string, SearchModelInfo>> {
  const result = new Map<string, SearchModelInfo>();
  try {
    const html = await fetchText(SEARCH_URL);
    const modelMatches = [...html.matchAll(/href="\/library\/([\w.-]+)"/g)];
    const seen = new Set<string>();

    for (const match of modelMatches) {
      const name = match[1];
      if (seen.has(name)) continue;
      seen.add(name);

      // Get surrounding HTML for tag extraction
      const idx = html.indexOf(match[0]);
      const block = html.slice(idx, idx + 2000);

      const capabilities: string[] = [];
      for (const cap of ["vision", "tools", "thinking"]) {
        if (block.match(new RegExp(`>${cap}<`, "i"))) capabilities.push(cap);
      }

      // Extract parameter size tags like ">30b<", ">120b<"
      const paramSizes = [
        ...new Set(
          [...block.matchAll(/>(\d+(?:\.\d+)?)[bB]</g)].map((m) =>
            Number.parseFloat(m[1]),
          ),
        ),
      ];

      result.set(name, { capabilities, paramSizes });
    }
  } catch {
    /* ignore */
  }
  return result;
}

/** Fetch a model's library page for description. */
async function fetchModelPage(name: string): Promise<string | null> {
  try {
    return await fetchText(`https://ollama.com/library/${name}`);
  } catch {
    return null;
  }
}

// ── Main ──

async function main() {
  console.log("Fetching Ollama models...");

  const [apiModels, searchData] = await Promise.all([
    fetchFromApi(),
    fetchFromSearch(),
  ]);

  // Group API models by base name, collect params and latest date
  const apiMap = new Map<
    string,
    { allParams: Set<number>; modified_at: string }
  >();
  for (const m of apiModels) {
    const baseName = m.name.split(":")[0];
    const params = parseTagParams(m.name);
    const existing = apiMap.get(baseName);

    if (!existing) {
      apiMap.set(baseName, {
        allParams: params ? new Set([params]) : new Set(),
        modified_at: m.modified_at,
      });
    } else {
      if (params) existing.allParams.add(params);
      if (m.modified_at > existing.modified_at)
        existing.modified_at = m.modified_at;
    }
  }

  // Merge model names from both sources
  const allNames = [...new Set([...apiMap.keys(), ...searchData.keys()])];
  console.log(
    `Found ${allNames.length} unique models (${apiMap.size} from API, ${searchData.size} from search)`,
  );

  // Fetch model pages for descriptions
  console.log(
    `Fetching ${allNames.length} model pages (concurrency: ${CONCURRENCY})...`,
  );
  const pages = await pMap(allNames, fetchModelPage, CONCURRENCY);

  let written = 0;
  for (let i = 0; i < allNames.length; i++) {
    const name = allNames[i];
    const api = apiMap.get(name);
    const search = searchData.get(name);
    const page = pages[i];

    // Description from model page
    const description = page ? extractPageDescription(page) : undefined;

    // License from model page; default to "open-weight" since Ollama only hosts open models
    const license = (page ? extractLicense(page) : undefined) ?? "open-weight";

    // Context window from model page
    const context_window = page ? extractContextWindow(page) : undefined;

    // Capabilities from search page tags
    const capabilities = mapCapabilities(search?.capabilities ?? []);

    // Release date from API modified_at
    const release_date = api?.modified_at?.split("T")[0];

    // Parameters resolution:
    // 1. API tags — use if all variants agree on one value
    // 2. Search page — use if exactly one param size tag
    // 3. Model page — extract from "latest" variant or description
    let parameters: number | undefined;
    let active_parameters: number | undefined;
    if (api?.allParams.size === 1) {
      parameters = [...api.allParams][0];
    } else if (search?.paramSizes.length === 1) {
      parameters = search.paramSizes[0];
    }
    // Always try model page for MoE active_parameters (and parameters fallback)
    if (page) {
      const pageParams = extractPageParams(page, name);
      if (pageParams) {
        if (!parameters) parameters = pageParams.parameters;
        if (pageParams.active_parameters)
          active_parameters = pageParams.active_parameters;
      }
    }

    // Modalities: if vision capability, model accepts image input
    const modalities = capabilities.vision
      ? { input: ["text", "image"], output: ["text"] }
      : { input: ["text"], output: ["text"] };

    const entry: ModelEntry = {
      id: name,
      name,
      created_by: extractCreator(name),
      family: inferFamily(name),
      description,
      page_url: `https://ollama.com/library/${name}`,
      release_date,
      context_window,
      parameters,
      active_parameters,
      license,
      open_weight: true,
      reasoning_tokens: capabilities.reasoning ? true : undefined,
      capabilities,
      modalities,
    };

    written += upsertWithSnapshot("ollama", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
