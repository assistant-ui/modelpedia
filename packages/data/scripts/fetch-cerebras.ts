import { fetchText, findHtmlTables, stripHtml } from "./parse.ts";
import {
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
const MODEL_PAGES = sources.models as string[];
const DEPRECATIONS_URL = sources.deprecations as string;

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

// ── Overview page parsing ──

interface OverviewInfo {
  name: string;
  parameters?: string;
  speed?: number;
  status: "active" | "preview";
  precision?: string;
  huggingface_url?: string;
}

function parseOverview(html: string): Map<string, OverviewInfo> {
  const result = new Map<string, OverviewInfo>();
  const tables = findHtmlTables(html);

  for (const table of tables) {
    if (table.rows.length < 2) continue;
    const header = table.rows[0].map((h) => h.toLowerCase());

    // Model tables (Production / Preview): Model Name | Model ID | Parameters | Speed
    if (header.some((h) => h.includes("model id"))) {
      const tablePos = html.indexOf(table.raw);
      const before = html.slice(Math.max(0, tablePos - 3000), tablePos);
      const headings = [...before.matchAll(/<h[23][^>]*>([\s\S]*?)<\/h[23]>/g)];
      const heading =
        headings.length > 0 ? stripHtml(headings[headings.length - 1][1]) : "";
      const status: "active" | "preview" = heading
        .toLowerCase()
        .includes("preview")
        ? "preview"
        : "active";

      const nameIdx = header.findIndex((h) => h.includes("model name"));
      const idIdx = header.findIndex((h) => h.includes("model id"));
      const paramIdx = header.findIndex((h) => h.includes("parameter"));
      const speedIdx = header.findIndex((h) => h.includes("speed"));

      for (const row of table.rows.slice(1)) {
        if (row.length < 2) continue;
        const id = (row[idIdx] ?? "").replace(/`/g, "").trim();
        if (!id) continue;
        result.set(id, {
          name: (row[nameIdx] ?? id).trim(),
          parameters: paramIdx >= 0 ? row[paramIdx]?.trim() : undefined,
          speed:
            speedIdx >= 0
              ? Number(row[speedIdx]?.replace(/[^0-9]/g, "")) || undefined
              : undefined,
          status,
        });
      }
    }

    // Compression table: Model Name | Precision | Hugging Face Link
    if (header.some((h) => h.includes("precision"))) {
      const nameIdx = Math.max(
        0,
        header.findIndex((h) => h.includes("model")),
      );
      const precIdx = Math.max(
        1,
        header.findIndex((h) => h.includes("precision")),
      );

      const rowMatches = [...table.raw.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
      for (let i = 1; i < rowMatches.length; i++) {
        const cells = [
          ...rowMatches[i][1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g),
        ].map((m) => m[1]);
        if (cells.length < 3) continue;

        const id = stripHtml(cells[nameIdx]).replace(/`/g, "").trim();
        const precision = stripHtml(cells[precIdx])
          .replace(/\s*\d+$/, "")
          .trim();
        const hfMatch = cells[cells.length - 1].match(
          /href="(https:\/\/huggingface\.co\/[^"]+)"/,
        );

        const existing = result.get(id);
        if (existing) {
          existing.precision = precision;
          existing.huggingface_url = hfMatch?.[1];
        }
      }
    }
  }

  return result;
}

// ── Model page parsing (.md MDX source) ──
// The .md endpoint returns raw MDX with a <ModelInfo /> component containing all data as props:
//   features={["Reasoning", "Streaming", ...]}
//   endpoints={["Chat Completions", "Completions"]}
//   inputOutput={{ inputFormats: ["text"], outputFormats: ["text"] }}
//   knownLimitations={[<span>...</span>]}

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

// ── Deprecations page parsing ──

interface DeprecatedModel {
  id: string;
  date: string;
  successor?: string;
}

function parseDeprecations(html: string): DeprecatedModel[] {
  const deprecated: DeprecatedModel[] = [];
  const sections = html.split(/(?=<[^>]*?id="\d{4}-\d{2}-\d{2}")/);

  for (const section of sections) {
    const dateMatch = section.match(/id="(\d{4}-\d{2}-\d{2})"/);
    if (!dateMatch) continue;
    const date = dateMatch[1];
    const text = stripHtml(section);

    // Codes before "recommend" are deprecated; codes after are successors
    const recommendPos = text.search(/recommend/i);
    const allCodes = [...section.matchAll(/<code[^>]*>([\w.-]+)<\/code>/g)].map(
      (m) => m[1],
    );

    const depIds: string[] = [];
    for (const code of allCodes) {
      const codePos = text.indexOf(code);
      if (recommendPos < 0 || codePos < recommendPos) {
        depIds.push(code);
      }
    }

    // Successor: prefer link text, fallback to code tag after "recommend"
    const successorLink = section.match(
      /recommend[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i,
    );
    let successor = successorLink
      ? stripHtml(successorLink[1]).trim()
      : undefined;

    // Also try code-tag successor (e.g. "transitioning to `llama-3.3-70b`")
    if (!successor) {
      for (const code of allCodes) {
        const codePos = text.indexOf(code);
        if (recommendPos >= 0 && codePos > recommendPos) {
          successor = code;
          break;
        }
      }
    }

    for (const id of depIds) {
      deprecated.push({ id, date, successor });
    }
  }

  return deprecated;
}

// ── Main ──

async function main() {
  console.log("Fetching Cerebras models...");

  // 1. Fetch overview for model metadata (status, parameters, speed, precision, HF links)
  let overview = new Map<string, OverviewInfo>();
  if (OVERVIEW_URL) {
    try {
      const html = await fetchText(OVERVIEW_URL);
      overview = parseOverview(html);
      console.log(`Overview: ${overview.size} models`);
    } catch (err) {
      console.warn("Could not fetch overview:", err);
    }
  }

  // 2. Fetch individual model pages for detailed data
  let written = 0;
  for (const url of MODEL_PAGES) {
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

    const ov = overview.get(page.id);

    // Provider-specific extra fields
    const extra: Record<string, unknown> = {};
    if (page.model_card_url) extra.model_card_url = page.model_card_url;
    if (ov?.speed) extra.tokens_per_second = ov.speed;
    if (ov?.precision) extra.precision = ov.precision;
    if (ov?.huggingface_url) extra.huggingface_url = ov.huggingface_url;

    // Parameters: prefer overview page, fall back to inferParameters from model ID
    let parameters: number | undefined;
    let active_parameters: number | undefined;
    if (ov?.parameters) {
      const paramMatch = ov.parameters.match(/([\d.]+)\s*billion/i);
      if (paramMatch) parameters = Number(paramMatch[1]);
    }
    if (!parameters) {
      const inferred = inferParameters(page.id);
      if (inferred) {
        parameters = inferred.parameters;
        if (inferred.active_parameters)
          active_parameters = inferred.active_parameters;
      }
    }

    const caps =
      Object.keys(page.capabilities).length > 0
        ? page.capabilities
        : { streaming: true };

    const entry: ModelEntry = {
      id: page.id,
      name: page.display_name ?? ov?.name ?? page.id,
      created_by: extractCreator(page.id),
      family: inferFamily(page.id),
      model_type: "chat",
      status: ov?.status ?? "active",
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

    if (page.pricing) {
      entry.pricing = page.pricing;
    }

    written += upsertWithSnapshot("cerebras", entry);
  }

  // 3. Fetch deprecations for historical deprecated models
  if (DEPRECATIONS_URL) {
    try {
      const html = await fetchText(DEPRECATIONS_URL);
      const deps = parseDeprecations(html);
      console.log(`Deprecations: ${deps.length} deprecated models`);

      for (const dep of deps) {
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
