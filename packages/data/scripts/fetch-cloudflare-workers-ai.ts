import { fetchText } from "./parse.ts";
import {
  inferFamily,
  inferModelType,
  inferParameters,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Cloudflare Workers AI models from docs page.
 * No API key needed — scrapes public documentation.
 *
 * Extracts per model:
 *   - task type → model_type
 *   - description text
 *   - capability tags (function_calling, reasoning, vision)
 *   - status (beta / deprecated)
 *   - parameters via inferParameters
 *   - page_url linking to the docs model page
 */

const sources = readSources("cloudflare-workers-ai");
const DOCS_URL = sources.docs as string;

const CREATOR_MAP: Record<string, string> = {
  meta: "meta",
  "meta-llama": "meta",
  google: "google",
  openai: "openai",
  mistral: "mistral",
  mistralai: "mistral",
  qwen: "qwen",
  "deepseek-ai": "deepseek",
  nvidia: "nvidia",
  "black-forest-labs": "black-forest-labs",
  baai: "baai",
  facebook: "meta",
  microsoft: "microsoft",
  "ibm-granite": "ibm",
  moonshotai: "moonshot",
  "zai-org": "zhipu",
  stabilityai: "stability",
  bytedance: "bytedance",
  leonardo: "leonardo",
  deepgram: "deepgram",
  "myshell-ai": "myshell",
  tiiuae: "tii",
  runwayml: "runway",
  aisingapore: "aisingapore",
  pfnet: "pfnet",
};

// Map CF task type headings to our model_type values
const TASK_TYPE_MAP: Record<string, string> = {
  "text generation": "chat",
  "text-to-speech": "tts",
  "automatic speech recognition": "transcription",
  "text embeddings": "embed",
  "text classification": "classification",
  translation: "translation",
  "image-to-text": "chat",
  "image classification": "classification",
  "object detection": "classification",
  "text-to-image": "image",
  summarization: "chat",
  "voice activity detection": "audio",
};

function extractCreator(modelId: string): string {
  // @cf/meta/llama-3.1-8b-instruct → meta
  // @hf/google/gemma-7b-it → google
  const parts = modelId.replace(/^@(?:cf|hf)\//, "").split("/");
  if (parts.length >= 2) {
    return CREATOR_MAP[parts[0]] ?? parts[0];
  }
  return "unknown";
}

function extractShortName(modelId: string): string {
  // @cf/meta/llama-3.1-8b-instruct → llama-3.1-8b-instruct
  const parts = modelId.replace(/^@(?:cf|hf)\//, "").split("/");
  return parts[parts.length - 1];
}

interface ParsedModel {
  id: string;
  description?: string;
  taskType?: string;
  status?: "active" | "preview" | "deprecated";
  caps: Record<string, boolean>;
}

/**
 * Parse the docs HTML to extract model metadata beyond just IDs.
 * The page groups models under task-type headings and each model card
 * contains description text, capability/property tags, and status badges.
 */
function parseModelsFromHtml(html: string): Map<string, ParsedModel> {
  const models = new Map<string, ParsedModel>();

  // Track current task type section from headings
  // The page uses heading elements or section anchors for task types
  let currentTaskType: string | undefined;

  // Split by lines to track section context
  const lines = html.split("\n");
  for (const line of lines) {
    // Detect task type headings (h2/h3 with task type text)
    const headingMatch = line.match(/<h[23][^>]*>\s*(.*?)\s*<\/h[23]>/i);
    if (headingMatch) {
      const heading = headingMatch[1]
        .replace(/<[^>]+>/g, "")
        .trim()
        .toLowerCase();
      if (TASK_TYPE_MAP[heading]) {
        currentTaskType = heading;
      }
    }
  }

  // Extract model entries with surrounding context
  // Each model ID appears near its description and tags in the HTML
  const modelPattern = /@(cf|hf)\/([\w/.-]+)/g;
  let match: RegExpExecArray | null;

  while ((match = modelPattern.exec(html)) !== null) {
    const fullId = `@${match[1]}/${match[2]}`;
    if (models.has(fullId)) continue;

    // Look at surrounding context (500 chars before and after) for metadata
    const start = Math.max(0, match.index - 500);
    const end = Math.min(html.length, match.index + 500);
    const context = html.slice(start, end).toLowerCase();

    // Extract description from nearby text
    const descContext = html.slice(
      Math.max(0, match.index - 300),
      Math.min(html.length, match.index + 300),
    );
    let description: string | undefined;
    // Look for description in paragraph or span near the model ID
    const descMatch = descContext.match(/<p[^>]*>\s*([^<]{10,200})\s*<\/p>/i);
    if (descMatch) {
      const cleaned = descMatch[1].replace(/<[^>]+>/g, "").trim();
      if (cleaned.length > 10 && !cleaned.includes("@cf/")) {
        description = cleaned;
      }
    }

    // Detect capability tags from nearby context
    const caps: Record<string, boolean> = { streaming: true };
    if (
      context.includes("function call") ||
      context.includes("function_call") ||
      context.includes("tool")
    ) {
      caps.tool_call = true;
    }
    if (context.includes("reasoning")) {
      caps.reasoning = true;
    }
    if (context.includes("vision") || context.includes("image-to-text")) {
      caps.vision = true;
    }

    // Detect status
    let status: "active" | "preview" | "deprecated" = "active";
    if (context.includes("beta") || context.includes("preview")) {
      status = "preview";
    }
    if (context.includes("deprecated")) {
      status = "deprecated";
    }

    // Determine task type from section context
    let taskType: string | undefined;
    // Check context for task type keywords
    for (const [key, _value] of Object.entries(TASK_TYPE_MAP)) {
      if (context.includes(key)) {
        taskType = key;
        break;
      }
    }

    models.set(fullId, {
      id: fullId,
      description,
      taskType: taskType ?? currentTaskType,
      status,
      caps,
    });
  }

  return models;
}

async function main() {
  console.log("Fetching Cloudflare Workers AI models...");

  const html = await fetchText(DOCS_URL);
  const parsed = parseModelsFromHtml(html);

  // Extract all @cf/ and @hf/ model IDs (deduplicated)
  const cfIds = [
    ...new Set(
      [...html.matchAll(/@cf\/([\w/.-]+)/g)].map((m) => `@cf/${m[1]}`),
    ),
  ];
  const hfIds = [
    ...new Set(
      [...html.matchAll(/@hf\/([\w/.-]+)/g)].map((m) => `@hf/${m[1]}`),
    ),
  ];
  const allIds = [...cfIds, ...hfIds];

  console.log(
    `Found ${allIds.length} models (${cfIds.length} @cf, ${hfIds.length} @hf)`,
  );

  let written = 0;
  for (const fullId of allIds) {
    const shortName = extractShortName(fullId);
    const creator = extractCreator(fullId);
    const info = parsed.get(fullId);
    const params = inferParameters(shortName);

    // Determine model_type from task type or fallback to inferModelType
    const taskModelType = info?.taskType
      ? TASK_TYPE_MAP[info.taskType]
      : undefined;
    const modelType = taskModelType ?? inferModelType(shortName);

    // Build page_url from the docs base
    const pageUrl = `${DOCS_URL}#${shortName}`;

    const entry: ModelEntry = {
      id: fullId,
      name: shortName,
      created_by: creator,
      family: inferFamily(shortName),
      model_type: modelType,
      status: info?.status ?? "active",
      description: info?.description,
      capabilities: info?.caps ?? { streaming: true },
      parameters: params?.parameters,
      active_parameters: params?.active_parameters,
      page_url: pageUrl,
    };

    written += upsertWithSnapshot("cloudflare-workers-ai", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
