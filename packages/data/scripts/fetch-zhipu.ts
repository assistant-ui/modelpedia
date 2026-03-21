import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Z.AI (Zhipu) models from their docs .md endpoints.
 * No API key needed.
 */

const LLMS_TXT = "https://docs.z.ai/llms.txt";

interface ZhipuModel {
  id: string;
  name: string;
  context_window?: number;
  max_output_tokens?: number;
  inputModalities: string[];
  outputModalities: string[];
  capabilities: Record<string, boolean>;
}

async function fetchModelPages(): Promise<string[]> {
  const res = await fetch(LLMS_TXT);
  const text = await res.text();
  // Extract model page URLs
  return [
    ...new Set(
      [
        ...text.matchAll(
          /(https:\/\/docs\.z\.ai\/guides\/(?:llm|vlm)\/[\w.-]+\.md)/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
}

async function fetchModelPage(url: string): Promise<ZhipuModel[]> {
  const res = await fetch(url);
  if (!res.ok) return [];
  const md = await res.text();

  const models: ZhipuModel[] = [];

  // Extract model variants from tabs or headings
  // Pattern: model ID appears in curl examples or tab titles
  const modelIds = [
    ...new Set(
      [...md.matchAll(/"model":\s*"(glm-[\w.-]+)"/g)].map((m) => m[1]),
    ),
  ];

  // If no IDs found in curl, try to extract from the page title/tabs
  if (modelIds.length === 0) {
    const titleMatch = md.match(/^#\s+(GLM-[\w.-]+)/m);
    if (titleMatch) modelIds.push(titleMatch[1].toLowerCase());
  }

  // Extract context window — pattern: Context Length ... > 200K or Context Length ... 200K
  const ctxMatch = md.match(/Context\s*Length[\s\S]*?(\d+)[Kk]/i);
  const contextWindow = ctxMatch ? Number(ctxMatch[1]) * 1000 : undefined;

  // Extract max output
  const maxOutMatch = md.match(/Maximum\s*Output\s*Tokens[\s\S]*?(\d+)[Kk]/i);
  const maxOutput = maxOutMatch ? Number(maxOutMatch[1]) * 1000 : undefined;

  // Check input modalities
  const inputMods = ["text"];
  if (/Input\s*Modal.*?Image/i.test(md)) inputMods.push("image");
  if (/Input\s*Modal.*?Video/i.test(md)) inputMods.push("video");
  if (/Input\s*Modal.*?Audio/i.test(md)) inputMods.push("audio");

  // Check output modalities
  const outputMods = ["text"];

  // Capabilities
  const caps: Record<string, boolean> = { streaming: true };
  if (/Function\s*Call/i.test(md)) caps.tool_call = true;
  if (/Structured\s*Output/i.test(md)) caps.structured_output = true;
  if (/Thinking\s*Mode/i.test(md)) caps.reasoning = true;
  if (inputMods.includes("image")) caps.vision = true;

  for (const id of modelIds) {
    models.push({
      id,
      name: id.toUpperCase().replace(/-/g, "-"),
      context_window: contextWindow,
      max_output_tokens: maxOutput,
      inputModalities: inputMods,
      outputModalities: outputMods,
      capabilities: caps,
    });
  }

  // Also extract Flash/FlashX variants from tabs
  const tabVariants = [...md.matchAll(/Tab\s*title="(GLM-[\w.-]+)"/gi)];
  for (const tv of tabVariants) {
    const variantId = tv[1].toLowerCase();
    if (modelIds.includes(variantId)) continue;

    // Check for variant-specific context
    const afterTab = md.slice(md.indexOf(tv[0]));
    const varCtx = afterTab.match(/Context\s*Length.*?(\d+)[Kk]/i);
    const varMax = afterTab.match(/Maximum\s*Output\s*Tokens.*?(\d+)[Kk]/i);

    models.push({
      id: variantId,
      name: tv[1],
      context_window: varCtx ? Number(varCtx[1]) * 1000 : contextWindow,
      max_output_tokens: varMax ? Number(varMax[1]) * 1000 : maxOutput,
      inputModalities: inputMods,
      outputModalities: outputMods,
      capabilities: caps,
    });
  }

  return models;
}

async function main() {
  console.log("Fetching Z.AI (Zhipu) models from docs...");

  const pages = await fetchModelPages();
  console.log(`Found ${pages.length} model pages`);

  const allModels: ZhipuModel[] = [];
  for (const url of pages) {
    const models = await fetchModelPage(url);
    allModels.push(...models);
  }

  // Deduplicate
  const seen = new Set<string>();
  const unique = allModels.filter((m) => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  console.log(`Parsed ${unique.length} unique models`);

  let written = 0;
  for (const m of unique) {
    const entry: ModelEntry = {
      id: m.id,
      name: m.name,
      family: inferFamily(m.id),
      context_window: m.context_window,
      max_output_tokens: m.max_output_tokens,
      capabilities: m.capabilities,
      modalities: {
        input: m.inputModalities,
        output: m.outputModalities,
      },
    };

    written += upsertWithSnapshot("zhipu", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
