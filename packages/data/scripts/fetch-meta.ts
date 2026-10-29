import { fetchJson, fetchText, parseAllHtmlTables } from "./parse.ts";
import {
  inferFamily,
  inferParameters,
  type ModelEntry,
  normalizeDate,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/** Fetch Meta's public model listings from Hugging Face and Meta's model docs. */

const sources = readSources("meta");
const BASE_API_URL = sources.api as string;
const MODELS_DOCS_URL = "https://dev.meta.ai/docs/models";

// Expand params to fetch richer metadata from HuggingFace list API
const EXPAND_PARAMS = [
  "expand[]=safetensors",
  "expand[]=cardData",
  "expand[]=config",
  "expand[]=createdAt",
  "expand[]=tags",
].join("&");

// ── Types ──

interface HFModelListItem {
  id: string;
  downloads: number;
  tags: string[];
  createdAt?: string;
  cardData?: {
    license?: string;
    license_name?: string;
    [key: string]: unknown;
  };
  safetensors?: {
    parameters?: Record<string, number>;
    total?: number;
  };
  config?: {
    architectures?: string[];
    model_type?: string;
    chat_template_jinja?: string;
    tokenizer_config?: {
      chat_template?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
}

// Known specs for Llama models (from official docs).
// Context windows and max output tokens aren't available in the HuggingFace
// API for gated models (config.json / generation_config.json return 401).
const KNOWN_SPECS: Record<string, { context: number; maxOutput?: number }> = {
  "Llama-4-Scout": { context: 1048576, maxOutput: 16384 },
  "Llama-4-Maverick": { context: 1048576, maxOutput: 16384 },
  "Llama-3.3-70B": { context: 131072, maxOutput: 131072 },
  "Llama-3.2-90B": { context: 131072, maxOutput: 131072 },
  "Llama-3.2-11B": { context: 131072, maxOutput: 131072 },
  "Llama-3.2-3B": { context: 131072, maxOutput: 131072 },
  "Llama-3.2-1B": { context: 131072, maxOutput: 131072 },
  "Llama-3.1-405B": { context: 131072, maxOutput: 131072 },
  "Llama-3.1-70B": { context: 131072, maxOutput: 131072 },
  "Llama-3.1-8B": { context: 131072, maxOutput: 131072 },
  "Meta-Llama-3-70B": { context: 8192, maxOutput: 8192 },
  "Meta-Llama-3-8B": { context: 8192, maxOutput: 8192 },
  "Llama-2-70b": { context: 4096, maxOutput: 4096 },
  "Llama-2-13b": { context: 4096, maxOutput: 4096 },
  "Llama-2-7b": { context: 4096, maxOutput: 4096 },
};

// ── Helpers ──

function findSpecs(id: string): { context?: number; maxOutput?: number } {
  for (const [key, specs] of Object.entries(KNOWN_SPECS)) {
    if (id.includes(key)) return specs;
  }
  return {};
}

/** Convert total parameters (number) to billions, rounded. */
function toBillions(total: number): number {
  const b = total / 1e9;
  if (b >= 10) return Math.round(b);
  if (b >= 1) return Math.round(b * 10) / 10;
  return Math.round(b * 100) / 100;
}

/** Extract license from cardData, normalizing HuggingFace conventions. */
function extractLicense(
  cardData?: HFModelListItem["cardData"],
): string | undefined {
  if (!cardData) return undefined;
  // Llama 4 uses license: "other" + license_name: "llama4"
  if (cardData.license === "other" && cardData.license_name) {
    return cardData.license_name;
  }
  if (cardData.license && cardData.license !== "other") {
    return cardData.license;
  }
  return undefined;
}

/**
 * Extract knowledge cutoff from the chat template.
 * Llama 3.x models embed "Cutting Knowledge Date: <Month> <Year>" in their templates.
 */
function extractKnowledgeCutoff(
  config?: HFModelListItem["config"],
): string | null {
  if (!config) return null;
  const templates = [
    config.tokenizer_config?.chat_template ?? "",
    config.chat_template_jinja ?? "",
  ].join(" ");

  const m = templates.match(/Cutting Knowledge Date:\s*([A-Za-z]+\s+\d{4})/);
  if (m) return normalizeDate(m[1]);
  return null;
}

async function main() {
  console.log("Fetching Meta models...");

  // Fetch from both pipelines: text-generation (Llama 2/3) and
  // image-text-to-text (Llama 3.2 Vision, Llama 4 Scout/Maverick)
  const apiUrl = `${BASE_API_URL}&${EXPAND_PARAMS}`;
  const visionApiUrl = apiUrl.replace(
    "pipeline_tag=text-generation",
    "pipeline_tag=image-text-to-text",
  );
  const museApiUrl = new URL(BASE_API_URL);
  museApiUrl.searchParams.set("author", "meta-models");
  museApiUrl.searchParams.delete("pipeline_tag");
  const museUrl = `${museApiUrl}&${EXPAND_PARAMS}`;

  const [textModels, visionModels, museRepos, docsHtml] = await Promise.all([
    fetchJson<HFModelListItem[]>(apiUrl),
    fetchJson<HFModelListItem[]>(visionApiUrl),
    fetchJson<HFModelListItem[]>(museUrl),
    fetchText(MODELS_DOCS_URL),
  ]);

  const museModels = museRepos.filter(
    (m) =>
      m.tags?.some((tag) =>
        ["text-generation", "image-text-to-text"].includes(tag),
      ) && !m.tags.includes("feature-extraction"),
  );
  const hostedModels = parseAllHtmlTables(docsHtml)
    .filter((table) => table[0]?.some((cell) => cell.includes("Model API")))
    .flatMap((table) =>
      table.slice(1).flatMap((row) => {
        const match = row[0]?.match(/^(.+?)\s*\(\s*([a-z0-9._-]+)\s*\)$/i);
        return match ? [{ id: match[2], name: match[1] }] : [];
      }),
    );
  if (museModels.length === 0 || hostedModels.length === 0) {
    throw new Error("Meta's public Muse listings returned no models");
  }

  // Deduplicate by id
  const seen = new Set<string>();
  const allModels: HFModelListItem[] = [];
  for (const m of [...textModels, ...visionModels]) {
    if (!seen.has(m.id)) {
      seen.add(m.id);
      allModels.push(m);
    }
  }

  // HuggingFace per-model page URL
  const hfPageUrl = (repoId: string) => `https://huggingface.co/${repoId}`;

  // Filter to instruct/chat models
  const chatModels = allModels.filter((m) => {
    const name = m.id.toLowerCase();
    return (
      name.includes("instruct") ||
      name.includes("chat") ||
      name.includes("guard") ||
      name.includes("scout") ||
      name.includes("maverick")
    );
  });

  console.log(
    `Found ${chatModels.length} chat models (from ${allModels.length} total)`,
  );

  // The keep-list is a name match, so a family Meta names differently would be
  // dropped without a trace. Today's drops are base (non-instruct) weights,
  // which the catalog deliberately excludes; log them so a new family shows up
  // here rather than silently never appearing.
  const dropped = allModels.filter((m) => !chatModels.includes(m));
  if (dropped.length > 0) {
    console.log(
      `  excluded ${dropped.length} non-chat repo(s): ${dropped
        .slice(0, 6)
        .map((m) => m.id.split("/").pop())
        .join(", ")}${dropped.length > 6 ? ", ..." : ""}`,
    );
  }

  let written = 0;
  for (const m of chatModels) {
    const shortName = m.id.split("/").pop() ?? m.id;
    const specs = findSpecs(m.id);
    const hasVision =
      m.tags?.includes("mllama") ||
      shortName.toLowerCase().includes("vision") ||
      shortName.includes("Scout") ||
      shortName.includes("Maverick");

    // License from cardData (not hardcoded)
    const license = extractLicense(m.cardData);

    // Knowledge cutoff from chat template
    const knowledgeCutoff = extractKnowledgeCutoff(m.config);

    // Parameters from safetensors (preferred) or name inference (fallback)
    const safetensorsTotal = m.safetensors?.total;
    let parameters: number | undefined;
    let activeParameters: number | undefined;
    if (safetensorsTotal) {
      parameters = toBillions(safetensorsTotal);
    }
    const inferred = inferParameters(shortName);
    if (inferred) {
      if (!parameters) parameters = inferred.parameters;
      if (inferred.active_parameters)
        activeParameters = inferred.active_parameters;
    }

    // Release date from createdAt
    const releaseDate = m.createdAt ? m.createdAt.split("T")[0] : undefined;

    const entry: ModelEntry = {
      id: shortName,
      name: shortName,
      family: inferFamily(shortName),
      context_window: specs.context,
      max_output_tokens: specs.maxOutput,
      knowledge_cutoff: knowledgeCutoff,
      license,
      release_date: releaseDate,
      page_url: hfPageUrl(m.id),
      capabilities: {
        streaming: true,
        tool_call: true,
        ...(hasVision ? { vision: true } : {}),
      },
      modalities: {
        input: hasVision ? ["text", "image"] : ["text"],
        output: ["text"],
      },
    };

    if (parameters) entry.parameters = parameters;
    if (activeParameters) entry.active_parameters = activeParameters;

    written += upsertWithSnapshot("meta", entry);
  }

  for (const m of museModels) {
    const shortName = m.id.split("/").pop() ?? m.id;
    const inferred = inferParameters(shortName);
    written += upsertWithSnapshot("meta", {
      id: shortName,
      name: shortName,
      family: shortName.toLowerCase().replace(/-\d.*$/, ""),
      parameters:
        inferred?.parameters ??
        (m.safetensors?.total ? toBillions(m.safetensors.total) : undefined),
      active_parameters: inferred?.active_parameters,
      license: extractLicense(m.cardData),
      release_date: m.createdAt?.split("T")[0],
      page_url: hfPageUrl(m.id),
      modalities: {
        input: m.tags.includes("image-text-to-text")
          ? ["text", "image"]
          : ["text"],
        output: ["text"],
      },
    });
  }

  for (const m of hostedModels) {
    written += upsertWithSnapshot("meta", {
      ...m,
      family: m.id.replace(/-\d.*$/, ""),
      page_url: MODELS_DOCS_URL,
    });
  }

  console.log(
    `Found ${museModels.length} Muse repos and ${hostedModels.length} hosted models`,
  );
  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
