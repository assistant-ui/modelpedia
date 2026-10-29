import {
  buildPricing,
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";
import { fetchText, fetchWithRetry, parseTokenCount } from "./parse.ts";

/**
 * Fetch Z.AI (Zhipu) models from their docs .md endpoints.
 * No API key needed.
 *
 * Data sources:
 * 1. llms.txt and overview.md — model guide URLs
 * 2. Individual .md — specs (context, output, modalities, capabilities, params)
 * 3. pricing.md — model catalog and pricing
 */

const sources = readSources("zai");
const LLMS_TXT = sources.docs as string;
const PRICING_URL = "https://docs.z.ai/guides/overview/pricing.md";
const OVERVIEW_URL = "https://docs.z.ai/guides/overview/overview.md";

// ── Types ──

interface ZhipuModel {
  id: string;
  name: string;
  description?: string;
  context_window?: number;
  max_output_tokens?: number;
  inputModalities: string[];
  outputModalities: string[];
  capabilities: Record<string, boolean>;
  page_url: string;
  parameters?: number;
  active_parameters?: number;
  architecture?: string;
}

interface PricingInfo {
  input?: number;
  output?: number;
  cached_input?: number;
  name: string;
  category: string;
}

// ── Pricing ──

function parsePrice(s: string): number | undefined {
  if (/free/i.test(s)) return 0;
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

async function fetchPricing(): Promise<Map<string, PricingInfo>> {
  const map = new Map<string, PricingInfo>();
  const res = await fetchWithRetry(PRICING_URL);
  if (!res.ok) return map;
  const md = await res.text();

  const sections = md.split(/\n\s*>?\s*###\s+/);
  for (const section of sections) {
    const category = section.split("\n")[0].trim();
    if (
      !/^(?:Latest|Text|Vision|Image Generation|Video Generation|Audio) Models$/i.test(
        category,
      )
    )
      continue;

    const lines = section.split("\n");
    for (const rawLine of lines) {
      const line = rawLine.replace(/^\s*>\s?/, "");
      // Skip header and separator rows
      if (
        /^\|\s*:?-+/.test(line) ||
        /^\|\s*Model\s*\|/i.test(line) ||
        !line.startsWith("|")
      )
        continue;
      const cols = line
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim());
      if (cols.length < 2) continue;
      const modelId = cols[0].toLowerCase().replace(/\s+/g, "-");
      if (!/^[a-z][\w.-]+$/.test(modelId)) continue;
      const input = cols.length >= 4 ? parsePrice(cols[1]) : undefined;
      const cachedCol = (cols[2] ?? "").replace(/\s/g, "");
      const cachedInput = /^\\+$|^-$/.test(cachedCol)
        ? undefined
        : parsePrice(cols[2] ?? "");
      const output =
        cols.length >= 4 ? parsePrice(cols[cols.length - 1]) : undefined;

      const info: PricingInfo = { name: cols[0], category };
      if (input !== undefined) info.input = input;
      if (cachedInput !== undefined) info.cached_input = cachedInput;
      if (output !== undefined) info.output = output;
      map.set(modelId, info);
    }
  }

  return map;
}

// ── Descriptions from llms.txt ──

/** Parse inline descriptions from the llms.txt index. */
function parseDescriptions(text: string): Map<string, string> {
  const map = new Map<string, string>();
  // Format: - [Title](URL): Description text...
  const re =
    /- \[[^\]]+\]\((https:\/\/docs\.z\.ai\/guides\/(?:llm|vlm|audio|image|video)\/[\w.-]+\.md)\):\s*(.+)/g;
  for (const m of text.matchAll(re)) {
    map.set(m[1], m[2].trim());
  }
  return map;
}

// ── Model page parsing ──

function fetchModelPageUrls(text: string): string[] {
  return [
    ...new Set(
      [
        ...text.matchAll(
          /(https:\/\/docs\.z\.ai\/guides\/(?:llm|vlm|audio|image|video)\/[\w.-]+\.md)/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
}

function parseGuideUrls(text: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const line of text.split("\n")) {
    const match = line.match(
      /^>?\s*\|\s*([\w.-]+)\s*\|.*?\[Guide\]\((https:\/\/docs\.z\.ai\/guides\/(?:llm|vlm|audio|image|video)\/[\w.-]+)(?:#[^)]+)?\)/i,
    );
    if (match)
      map.set(match[1].toLowerCase(), `${match[2].replace(/\.md$/, "")}.md`);
  }
  return map;
}

/** Extract the first paragraph of the Overview section as description. */
function extractDescription(md: string): string | undefined {
  const overviewIdx = md.search(/##[^#]*Overview/i);
  if (overviewIdx === -1) return undefined;

  const afterOverview = md.slice(overviewIdx);
  const lines = afterOverview.split("\n").slice(1);

  const textLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    // Stop at next heading, component, or card group
    if (
      /^##\s|^<CardGroup|^<Tabs>|^<Card\s|^<Info>|^<Tip>|^<AccordionGroup/.test(
        trimmed,
      )
    )
      break;
    // Stop at blank line after we've collected text
    if (trimmed === "" && textLines.length > 0) break;
    // Skip empty lines, icons, images, HTML/JSX tags
    if (/^<Icon\s|^<img\s|^!\[|^<video|^<Check>|^<div|^<\/div/.test(trimmed))
      continue;
    if (trimmed === "") continue;
    // Skip list items starting with *
    if (/^\*\s/.test(trimmed)) continue;
    // Collect plain text (strip bold markers)
    textLines.push(trimmed.replace(/\*\*/g, ""));
  }

  const desc = textLines.join(" ").trim();
  if (!desc || desc.length < 10) return undefined;
  if (desc.length > 500) return `${desc.slice(0, 497)}...`;
  return desc;
}

/** Extract parameter counts from the model page text. */
function extractParameters(md: string): {
  parameters?: number;
  active_parameters?: number;
} {
  const result: { parameters?: number; active_parameters?: number } = {};

  // Pattern: "744B (40B activated)" or "355B with 32B active" or "106B parameters and 12B active"
  const moe = md.match(
    /(\d+)B\s*(?:\(|with\s+|total\s+parameters?\s+(?:and|with)\s+)(\d+)B\s*(?:activated?|active)/i,
  );
  if (moe) {
    result.parameters = Number(moe[1]);
    result.active_parameters = Number(moe[2]);
    return result;
  }

  // Pattern: "total parameter count of 355B" or "total of 106B parameters"
  const total = md.match(
    /(?:total\s+(?:parameter\s+count\s+of|of)\s+|with\s+a\s+total\s+of\s+)(\d+)B/i,
  );
  if (total) {
    result.parameters = Number(total[1]);
    const active = md.match(/(\d+)B\s*(?:active|activation)\s*parameters?/i);
    if (active) result.active_parameters = Number(active[1]);
    return result;
  }

  // Pattern: "parameters as small as 0.9B" or "With just 0.9B parameters"
  const small = md.match(
    /parameters?\s+(?:as\s+small\s+as\s+|of\s+(?:just\s+)?)(\d+(?:\.\d+)?)B/i,
  );
  if (small) {
    result.parameters = Number(small[1]);
    return result;
  }

  // Pattern: "just 0.9B parameters" or "With only 0.9B parameters"
  const just = md.match(/(?:just|only)\s+(\d+(?:\.\d+)?)B\s+parameters?/i);
  if (just) {
    result.parameters = Number(just[1]);
    return result;
  }

  return result;
}

/** Detect architecture from page text. */
function extractArchitecture(md: string): string | undefined {
  if (/Mixture[- ]of[- ]Experts|MoE\s+architecture/i.test(md)) return "moe";
  if (/autoregressive\s*\+\s*diffusion/i.test(md)) return "hybrid";
  return undefined;
}

async function fetchModelPage(
  url: string,
  inlineDesc?: string,
): Promise<ZhipuModel[]> {
  const res = await fetchWithRetry(url);
  if (!res.ok) return [];
  const md = await res.text();

  const models: ZhipuModel[] = [];

  // Determine page category from URL
  const category = url.match(/\/guides\/(llm|vlm|audio|image|video)\//)?.[1];

  // Extract description from the Overview section; fall back to llms.txt inline
  const pageDesc = extractDescription(md) ?? inlineDesc;

  // Extract parameters & architecture
  const { parameters, active_parameters } = extractParameters(md);
  const architecture = extractArchitecture(md);

  // Extract model IDs from curl examples
  const modelIds = [
    ...new Set(
      [...md.matchAll(/"model":\s*"([\w.-]+)"/g)].map((m) =>
        m[1].toLowerCase(),
      ),
    ),
  ];

  // If no IDs found in curl, extract from page title
  if (modelIds.length === 0) {
    const titleMatch = md.match(/^#\s+([\w.-]+)/m);
    if (titleMatch) modelIds.push(titleMatch[1].toLowerCase());
  }

  // Extract context window
  const ctxMatch =
    md.match(/([\d.]+\s*[KkMm])[- ]token context window/i) ??
    md.match(
      /^\s*>?\s*\*{0,2}Context\s*(?:Length|Window)\*{0,2}\s*\n(?:\s*>\s*\n)?\s*>?\s*([\d.]+\s*[KkMm])/im,
    );
  const contextWindow = ctxMatch ? parseTokenCount(ctxMatch[1]) : undefined;

  // Extract max output tokens
  const maxOutMatch =
    md.match(/maximum output length of\s*([\d.]+\s*[KkMm])/i) ??
    md.match(
      /^\s*>?\s*\*{0,2}Maximum\s*Output\s*Tokens\*{0,2}\s*\n(?:\s*>\s*\n)?\s*>?\s*([\d.]+\s*[KkMm])/im,
    );
  const maxOutput = maxOutMatch ? parseTokenCount(maxOutMatch[1]) : undefined;

  // Input modalities based on category and Card content
  const inputMods: string[] = [];
  if (category === "audio") {
    inputMods.push("audio");
  } else if (category === "image") {
    inputMods.push("text");
  } else if (category === "video") {
    if (/Input.*?Image/is.test(md)) inputMods.push("image");
    if (/Input.*?Text/is.test(md)) inputMods.push("text");
  } else {
    inputMods.push("text");
    const inputBlock =
      md.match(/Input\s*Modalit(?:y|ies)[\s\S]{0,100}/i)?.[0] ?? "";
    if (/Image/i.test(inputBlock)) inputMods.push("image");
    if (/Video/i.test(inputBlock)) inputMods.push("video");
    if (/Audio/i.test(inputBlock)) inputMods.push("audio");
  }

  // Output modalities based on category
  const outputMods: string[] = [];
  if (category === "image") {
    outputMods.push("image");
  } else if (category === "video") {
    outputMods.push("video");
  } else {
    outputMods.push("text");
  }

  // Capabilities (LLM/VLM models only)
  const caps: Record<string, boolean> = {};
  if (category === "llm" || category === "vlm") {
    caps.streaming = true;
    if (/Function\s*Call/i.test(md)) caps.tool_call = true;
    if (/Structured\s*Output/i.test(md)) caps.structured_output = true;
    if (/Thinking\s*Mode|Deep\s*Think/i.test(md)) caps.reasoning = true;
    if (/Context\s*Cach/i.test(md)) caps.prompt_caching = true;
    if (inputMods.includes("image") || inputMods.includes("video"))
      caps.vision = true;
  }

  const pageUrl = url.replace(/\.md$/, "");

  for (const id of modelIds) {
    models.push({
      id,
      name: id.toUpperCase().replace(/-/g, "-"),
      description: pageDesc,
      context_window: contextWindow,
      max_output_tokens: maxOutput,
      inputModalities: inputMods,
      outputModalities: outputMods,
      capabilities: caps,
      page_url: pageUrl,
      parameters,
      active_parameters,
      architecture,
    });
  }

  // Extract tab variants (Flash/FlashX/Air/X/AirX etc.)
  const tabVariants = [...md.matchAll(/Tab\s+title="([\w.-]+)"/gi)];
  for (const tv of tabVariants) {
    const variantName = tv[1];
    const variantId = variantName.toLowerCase();
    if (modelIds.includes(variantId)) continue;

    // Variant-specific specs from the section after this tab
    const afterTab = md.slice(md.indexOf(tv[0]));
    const varCtx = afterTab.match(/Context\s*(?:Length|Window).*?(\d+)[Kk]/i);
    const varMax = afterTab.match(/Maximum\s*Output\s*Tokens.*?(\d+)[Kk]/i);

    // Variant-specific description from Positioning card
    const posMatch = afterTab.match(/title="Positioning"[^>]*>\s*\n\s*(.+)/i);
    const variantDesc = posMatch
      ? `${variantName}: ${posMatch[1].trim()}`
      : pageDesc;

    models.push({
      id: variantId,
      name: variantName,
      description: variantDesc,
      context_window: varCtx ? Number(varCtx[1]) * 1000 : contextWindow,
      max_output_tokens: varMax ? Number(varMax[1]) * 1000 : maxOutput,
      inputModalities: inputMods,
      outputModalities: outputMods,
      capabilities: caps,
      page_url: pageUrl,
      parameters,
      active_parameters,
      architecture,
    });
  }

  return models;
}

// ── Main ──

async function main() {
  console.log("Fetching Z.AI (Zhipu) models from docs...");

  // 1. Fetch llms.txt index
  const llmsTxt = await fetchText(LLMS_TXT);
  const overview = await fetchText(OVERVIEW_URL);

  // 2. Parse inline descriptions from llms.txt
  const descMap = parseDescriptions(llmsTxt);

  // 3. Fetch pricing
  console.log("Fetching pricing...");
  const pricingMap = await fetchPricing();
  console.log(`  parsed pricing for ${pricingMap.size} models`);

  // 4. Find all model guide pages
  const guideUrls = parseGuideUrls(overview);
  const pages = [
    ...new Set([...fetchModelPageUrls(llmsTxt), ...guideUrls.values()]),
  ];
  console.log(`Found ${pages.length} model pages`);

  // 5. Fetch each model page
  const allModels: ZhipuModel[] = [];
  for (const url of pages) {
    const inlineDesc = descMap.get(url);
    const models = await fetchModelPage(url, inlineDesc);
    allModels.push(...models);
  }

  for (const [id, pricing] of pricingMap) {
    if (guideUrls.has(id)) continue;
    const section = pricing.category;
    const path =
      section === "Vision Models"
        ? "vlm"
        : section === "Image Generation Models"
          ? "image"
          : section === "Video Generation Models"
            ? "video"
            : section === "Audio Models"
              ? "audio"
              : "llm";
    const candidate = `https://docs.z.ai/guides/${path}/${id}.md`;
    const models = await fetchModelPage(candidate);
    if (models.length === 0) continue;
    guideUrls.set(id, candidate);
    allModels.push(...models);
  }

  const pageModels = new Map<string, ZhipuModel>();
  for (const model of allModels) {
    if (pricingMap.has(model.id)) pageModels.set(model.page_url, model);
  }
  for (const [id, pricing] of pricingMap) {
    if (allModels.some((model) => model.id === id)) continue;
    const guide = guideUrls.get(id);
    const page = guide ? pageModels.get(guide.replace(/\.md$/, "")) : undefined;
    const category = pricing.category;
    const input =
      category === "Audio Models"
        ? ["audio"]
        : category === "Video Generation Models"
          ? ["text", "image"]
          : ["text"];
    if (category === "Vision Models") input.push("image");
    allModels.push({
      id,
      name: pricing.name,
      description: page?.description,
      context_window: page?.context_window,
      max_output_tokens: page?.max_output_tokens,
      inputModalities: page?.inputModalities ?? input,
      outputModalities:
        page?.outputModalities ??
        (category === "Image Generation Models"
          ? ["image"]
          : category === "Video Generation Models"
            ? ["video"]
            : ["text"]),
      capabilities:
        page?.capabilities ??
        (category === "Text Models" ||
        category === "Latest Models" ||
        category === "Vision Models"
          ? { streaming: true }
          : {}),
      page_url: guide?.replace(/\.md$/, "") ?? PRICING_URL.replace(/\.md$/, ""),
      parameters: page?.parameters,
      active_parameters: page?.active_parameters,
      architecture: page?.architecture,
    });
  }

  // 6. Deduplicate
  const seen = new Set<string>();
  const unique = allModels.filter((m) => {
    if (!pricingMap.has(m.id)) return false;
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  console.log(`Parsed ${unique.length} unique models`);

  // 7. Write entries
  let written = 0;
  for (const m of unique) {
    const pricing = pricingMap.get(m.id);

    const entry: ModelEntry = {
      id: m.id,
      name: m.name,
      description: m.description,
      // Stated rather than left to persist: 13 of these carried `zhipu`, which
      // is an alias of this provider and not an id, so cross-provider
      // inheritance in generate.ts could not resolve them. Upsert never clears
      // a field it is not given, so the stale value would survive forever.
      created_by: "zai",
      family: inferFamily(m.id),
      license: /glm-5-turbo|glm-ocr/i.test(m.id) ? "proprietary" : "mit",
      context_window: m.context_window,
      max_output_tokens: m.max_output_tokens,
      page_url: m.page_url,
      capabilities:
        Object.keys(m.capabilities).length > 0 ? m.capabilities : undefined,
      modalities: {
        input: m.inputModalities,
        output: m.outputModalities,
      },
      pricing: pricing ? buildPricing(pricing) : undefined,
      parameters: m.parameters,
      active_parameters: m.active_parameters,
      architecture: m.architecture,
    };

    written += upsertWithSnapshot("zai", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
