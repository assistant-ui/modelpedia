import { fetchText } from "./parse.ts";
import {
  assertParsed,
  inferFamily,
  inferParameters,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
  upsertWithSnapshot,
} from "./shared.ts";

const sources = readSources("cerebras");
const OVERVIEW_URL = sources.overview as string;
const DEPRECATIONS_URL = sources.deprecations as string;
const MODELS_BASE = "https://inference-docs.cerebras.ai/models/";

// ── Creator mapping ──

const CREATOR_MAP: Record<string, string> = {
  llama: "meta",
  "gpt-oss": "openai",
  qwen: "qwen",
  glm: "zhipu",
  zai: "zhipu",
  deepseek: "deepseek",
};

function extractCreator(id: string): string {
  for (const [prefix, creator] of Object.entries(CREATOR_MAP)) {
    if (id.includes(prefix)) return creator;
  }
  return "unknown";
}

/** A model id is hyphenated and lowercase (e.g. "zai-glm-4.7"); API parameters
 * use underscores ("disable_reasoning") or are single words ("tools"). */
function looksLikeModelId(token: string): boolean {
  return (
    /^[a-z0-9][a-z0-9.]*(-[a-z0-9.]+)+$/.test(token) && !token.includes("_")
  );
}

// ── Overview page parsing (markdown Model Catalog) ──

interface OverviewInfo {
  id: string;
  name: string;
  slug: string;
  parameters?: string;
  speed?: number;
  status: "active" | "preview";
}

/**
 * Parse the markdown Model Catalog (overview.md). Each `## Production Models` /
 * `## Preview Models` section holds one table:
 *   | Model Name | Model ID | Parameters | Speed (tokens/s) |
 * The Model Name cell links to the per-model page: `[Display](/models/<slug>)`.
 */
function parseOverview(md: string): OverviewInfo[] {
  const result: OverviewInfo[] = [];
  const sectionRe =
    /##\s+(Production|Preview)\s+Models\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/g;
  let sec: RegExpExecArray | null;
  while ((sec = sectionRe.exec(md)) !== null) {
    const status: "active" | "preview" =
      sec[1] === "Production" ? "active" : "preview";
    for (const line of sec[2].split("\n")) {
      if (!line.trim().startsWith("|")) continue;
      // Skip header + separator rows
      if (/Model Name/i.test(line) || /^\s*\|[\s:|-]+\|\s*$/.test(line))
        continue;
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((c) => c.trim());
      if (cells.length < 2) continue;
      const linkMatch = cells[0].match(/\[([^\]]+)\]\((\/models\/[^)]+)\)/);
      if (!linkMatch) continue;
      const name = linkMatch[1].replace(/<sup>.*?<\/sup>/g, "").trim();
      const slug = linkMatch[2].replace("/models/", "").trim();
      const id = cells[1].replace(/`/g, "").trim();
      if (!id) continue;
      result.push({
        id,
        name,
        slug,
        parameters: cells[2]?.trim(),
        speed: cells[3]
          ? Number(cells[3].replace(/[^0-9]/g, "")) || undefined
          : undefined,
        status,
      });
    }
  }
  return result;
}

// ── Model page parsing (.md MDX source) ──
// The .md endpoint returns raw MDX with a <ModelInfo /> component carrying all
// data as props (features, endpoints, inputOutput, contextLength, pricing, ...).

interface ModelPageData {
  id: string;
  display_name?: string;
  model_card_url?: string;
  speed?: number;
  context_window?: number;
  max_output_tokens?: number;
  pricing?: { input: number; output: number };
  capabilities: Record<string, boolean>;
  modalities: { input: string[]; output: string[] };
  endpoints: string[];
  notes?: string;
}

const FEATURE_MAP: Record<string, string> = {
  reasoning: "reasoning",
  streaming: "streaming",
  "structured outputs": "structured_output",
  "tool calling": "tool_call",
  "tool calling w/ structured outputs": "tool_call",
  "parallel tool calling": "tool_call",
  "prompt caching": "prompt_caching",
  vision: "vision",
};

const ENDPOINT_MAP: Record<string, string> = {
  "chat completions": "chat_completions",
  completions: "completions",
  models: "models",
};

function parseJsArray(raw: string): string[] {
  return [...raw.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function parseModelPage(md: string): ModelPageData | null {
  const idMatch = md.match(/modelId="([\w.-]+)"/);
  if (!idMatch) return null;
  const id = idMatch[1];

  const titleMatch =
    md.match(/title:\s*["']?([^"'\n]+)/) ?? md.match(/^#\s+(.+)$/m);
  const display_name = titleMatch?.[1]?.replace(/\\$/g, "").trim();

  const cardMatch = md.match(/modelCardUrl="([^"]+)"/);
  const model_card_url = cardMatch?.[1];

  const speedMatch = md.match(/speed=\{\{[\s\S]*?value:\s*"~?(\d+)"/);
  const speed = speedMatch ? Number(speedMatch[1]) : undefined;

  const ctxMatch = md.match(
    /contextLength=\{\{[\s\S]*?paidTiers:\s*"(\d+)[kK]\s*tokens"/i,
  );
  const context_window = ctxMatch ? Number(ctxMatch[1]) * 1000 : undefined;

  const maxOutMatch = md.match(
    /maxOutput=\{\{[\s\S]*?paidTiers:\s*"(\d+)[kK]\s*tokens"/i,
  );
  const max_output_tokens = maxOutMatch
    ? Number(maxOutMatch[1]) * 1000
    : undefined;

  const inputPrice = md.match(/inputPrice:\s*"\$([\d.]+)/);
  const outputPrice = md.match(/outputPrice:\s*"\$([\d.]+)/);
  const pricing =
    inputPrice && outputPrice
      ? { input: Number(inputPrice[1]), output: Number(outputPrice[1]) }
      : undefined;

  // Features → capabilities
  const caps: Record<string, boolean> = {};
  const featMatch = md.match(/features=\{(\[[\s\S]*?\])\}/);
  if (featMatch) {
    for (const feat of parseJsArray(featMatch[1])) {
      const key = FEATURE_MAP[feat.toLowerCase()];
      if (key) caps[key] = true;
    }
  }
  if (Object.keys(caps).length === 0) caps.streaming = true;

  // Modalities from inputOutput prop
  const ioMatch = md.match(/inputOutput=\{\{([\s\S]*?)\}\}/);
  let modalities = { input: ["text"], output: ["text"] };
  if (ioMatch) {
    const inMatch = ioMatch[1].match(/inputFormats:\s*(\[[\s\S]*?\])/);
    const outMatch = ioMatch[1].match(/outputFormats:\s*(\[[\s\S]*?\])/);
    modalities = {
      input: inMatch ? parseJsArray(inMatch[1]) : ["text"],
      output: outMatch ? parseJsArray(outMatch[1]) : ["text"],
    };
  }

  // Endpoints
  const endpoints: string[] = [];
  const epMatch = md.match(/endpoints=\{(\[[\s\S]*?\])\}/);
  if (epMatch) {
    for (const ep of parseJsArray(epMatch[1])) {
      const mapped = ENDPOINT_MAP[ep.toLowerCase()];
      if (mapped && !endpoints.includes(mapped)) endpoints.push(mapped);
    }
  }

  // Model notes from knownLimitations JSX array: [<span>text</span>, <span>text</span>]
  const limMatch = md.match(/knownLimitations=\{(\[[\s\S]*?\])\}\s*\n/);
  let notes: string | undefined;
  if (limMatch) {
    const items = limMatch[1]
      .split(/,\s*(?=<span)/i)
      .map((s) =>
        s
          .replace(/<[^>]+>/g, "")
          .replace(/\{[^}]*\}/g, "")
          .replace(/^\s*[[\]]\s*/g, "")
          .replace(/,\s*$/g, "")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&amp;/g, "&")
          .trim(),
      )
      .filter((s) => s.length > 5);
    notes = items.length > 0 ? items.join(" ") : undefined;
  }

  return {
    id,
    display_name,
    model_card_url,
    speed,
    context_window,
    max_output_tokens,
    pricing,
    capabilities: caps,
    modalities,
    endpoints,
    notes,
  };
}

// ── Deprecations page parsing (markdown <Update> blocks) ──

interface DeprecatedModel {
  id: string;
  date: string;
  successor?: string;
}

/**
 * Parse the markdown deprecation log. Each entry is an
 *   <Update label="YYYY-MM-DD"> ... </Update>
 * block. Deprecated model ids are the backticked, model-id-shaped tokens
 * before the "recommend/migrate/transition" phrase; the successor is the
 * model linked/backticked after it. Sections that deprecate an API parameter
 * (e.g. `disable_reasoning`) rather than a model are skipped.
 */
function parseDeprecations(
  md: string,
  slugToId: Map<string, string>,
): DeprecatedModel[] {
  const deprecated: DeprecatedModel[] = [];
  const blockRe = /<Update label="(\d{4}-\d{2}-\d{2})">([\s\S]*?)<\/Update>/g;
  let block: RegExpExecArray | null;
  while ((block = blockRe.exec(md)) !== null) {
    const date = block[1];
    const body = block[2];
    const title = (body.match(/\*\*([\s\S]*?)\*\*/)?.[1] ?? body).trim();
    // Parameter deprecations are not model deprecations.
    if (/\bparameter\b/i.test(title)) continue;

    const recommendPos = body.search(/recommend|migrat|transition/i);
    const cutoff = recommendPos < 0 ? body.length : recommendPos;

    const depIds = [...body.slice(0, cutoff).matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter(looksLikeModelId);
    if (depIds.length === 0) continue;

    // Successor: prefer a /models/<slug> link after "recommend", resolved to
    // its model id; fall back to a backticked model id.
    let successor: string | undefined;
    const after = recommendPos < 0 ? "" : body.slice(recommendPos);
    const linkSlug = after.match(/\/models\/([a-z0-9-]+)/)?.[1];
    if (linkSlug && slugToId.has(linkSlug)) successor = slugToId.get(linkSlug);
    if (!successor) {
      successor = [...after.matchAll(/`([^`]+)`/g)]
        .map((m) => m[1])
        .find(looksLikeModelId);
    }

    for (const id of depIds) deprecated.push({ id, date, successor });
  }
  return deprecated;
}

// ── Main ──

async function main() {
  console.log("Fetching Cerebras models...");

  // 1. Fetch the markdown Model Catalog and discover model pages from it.
  const overviewMd = await fetchText(OVERVIEW_URL);
  const overview = parseOverview(overviewMd);
  console.log(`Overview: ${overview.length} models`);
  assertParsed(overview.length, "cerebras (overview)");

  const slugToId = new Map(overview.map((o) => [o.slug, o.id]));

  // 2. Fetch each discovered model page for detailed specs.
  let written = 0;
  let pagesParsed = 0;
  for (const ov of overview) {
    const url = `${MODELS_BASE}${ov.slug}.md`;
    let md: string;
    try {
      md = await fetchText(url);
    } catch {
      console.warn(`Could not fetch ${url}`);
      continue;
    }

    const page = parseModelPage(md);
    if (!page) {
      console.warn(`Could not parse model from ${url}`);
      continue;
    }
    pagesParsed++;

    const extra: Record<string, unknown> = {};
    if (page.model_card_url) extra.model_card_url = page.model_card_url;
    const speed = page.speed ?? ov.speed;
    if (speed) extra.tokens_per_second = speed;

    // Parameters: prefer overview ("120 billion"), fall back to the model id.
    let parameters: number | undefined;
    let active_parameters: number | undefined;
    if (ov.parameters) {
      const m = ov.parameters.match(/([\d.]+)\s*billion/i);
      if (m) parameters = Number(m[1]);
    }
    if (!parameters) {
      const inferred = inferParameters(page.id);
      if (inferred) {
        parameters = inferred.parameters;
        active_parameters = inferred.active_parameters;
      }
    }

    const caps =
      Object.keys(page.capabilities).length > 0
        ? page.capabilities
        : { streaming: true };

    const entry: ModelEntry = {
      id: page.id,
      name: page.display_name ?? ov.name ?? page.id,
      created_by: extractCreator(page.id),
      family: inferFamily(page.id),
      model_type: "chat",
      status: ov.status,
      open_weight: true,
      context_window: page.context_window,
      max_output_tokens: page.max_output_tokens,
      parameters,
      active_parameters,
      reasoning_tokens: caps.reasoning ? true : undefined,
      capabilities: caps,
      modalities: page.modalities,
      endpoints:
        page.endpoints.length > 0 ? page.endpoints : ["chat_completions"],
      ...extra,
    };
    if (page.pricing) entry.pricing = page.pricing;

    written += upsertWithSnapshot("cerebras", entry);
  }

  assertParsed(pagesParsed, "cerebras (model pages)");

  // 3. Fetch deprecations for historical deprecated models.
  if (DEPRECATIONS_URL) {
    try {
      const depMd = await fetchText(DEPRECATIONS_URL);
      const deps = parseDeprecations(depMd, slugToId);
      console.log(`Deprecations: ${deps.length} deprecated models`);
      const activeIds = new Set(overview.map((o) => o.id));

      for (const dep of deps) {
        // Never mark a currently-active model as deprecated.
        if (activeIds.has(dep.id)) continue;
        const depParams = inferParameters(dep.id);
        const entry: ModelEntry = {
          id: dep.id,
          name: dep.id,
          created_by: extractCreator(dep.id),
          family: inferFamily(dep.id),
          model_type: "chat",
          status: "deprecated",
          deprecation_date: dep.date,
          open_weight: true,
          parameters: depParams?.parameters,
          active_parameters: depParams?.active_parameters,
          modalities: { input: ["text"], output: ["text"] },
        };
        if (dep.successor) entry.successor = dep.successor;
        written += upsertModel("cerebras", entry) ? 1 : 0;
      }
    } catch (err) {
      console.warn("Could not fetch deprecations:", err);
    }
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
