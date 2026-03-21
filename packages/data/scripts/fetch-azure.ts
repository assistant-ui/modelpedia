import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Azure AI Foundry models from Microsoft Learn docs.
 * No API key needed — scrapes public documentation.
 *
 * Sources:
 * 1. OpenAI models: learn.microsoft.com/azure/ai-services/openai/concepts/models
 * 2. Partner models: learn.microsoft.com/azure/ai-foundry/model-inference/models
 */

const OPENAI_MODELS_URL =
  "https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models";

interface AzureModel {
  id: string;
  name: string;
  created_by: string;
  context_window?: number;
  max_output_tokens?: number;
  knowledge_cutoff?: string;
  capabilities: Record<string, boolean>;
  modalities: { input: string[]; output: string[] };
}

// ── Parse models from the docs page ──

async function fetchModels(): Promise<AzureModel[]> {
  const res = await fetch(OPENAI_MODELS_URL);
  if (!res.ok) throw new Error(`Failed to fetch: ${res.status}`);
  const html = await res.text();

  // Extract main content text
  const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
  const _mainText = mainMatch
    ? mainMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ")
    : "";

  const models: AzureModel[] = [];
  const seen = new Set<string>();

  // Parse tables for model data
  // Tables have headers like: Model ID | Context | Max Output | Training Data | ...
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];

  for (const table of tables) {
    const rows = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    if (rows.length < 2) continue;

    const headerCells = [...rows[0][1].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)];
    const headers = headerCells
      .map((c) =>
        c[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean);

    // Skip tables that don't have model-related headers
    if (
      !headers.some(
        (h) =>
          h.includes("model") ||
          h.includes("context") ||
          h.includes("input") ||
          h.includes("type"),
      )
    )
      continue;

    for (const row of rows.slice(1)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
      const texts = cells.map((c) =>
        c[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      );
      if (texts.length < 2) continue;

      // Try to find model ID from the cells
      const modelCell = texts[0];
      // Extract model ID: "gpt-5.4 (2026-03-05)" → "gpt-5.4"
      const idMatch = modelCell.match(/^([\w.-]+(?:-[\w.-]+)*)/);
      if (!idMatch) continue;

      const id = idMatch[1].toLowerCase();
      // Skip non-model rows (headers, regions, categories)
      if (
        id.includes("model") ||
        id.includes("feature") ||
        id.includes("attribute") ||
        // Skip Azure region names
        /^(australia|brazil|canada|central|east|france|germany|italy|japan|korea|north|norway|poland|south|spain|sweden|switzerland|uae|uk|west)/.test(
          id,
        ) ||
        // Skip category headers
        /^(embeddings|image|video|audio|speech|fine-tuning|o-series)$/.test(
          id,
        ) ||
        seen.has(id)
      )
        continue;
      seen.add(id);

      // Find context window
      let contextWindow: number | undefined;
      let maxOutput: number | undefined;
      let knowledgeCutoff: string | undefined;

      for (let i = 0; i < headers.length && i < texts.length; i++) {
        const h = headers[i];
        const v = texts[i];

        if (h.includes("context") || h.includes("input")) {
          const num = v.match(/([\d,]+)/);
          if (num) {
            const n = Number(num[1].replace(/,/g, ""));
            if (n > 1000) contextWindow = n;
          }
        }
        if (h.includes("output") || h.includes("max output")) {
          const num = v.match(/([\d,]+)/);
          if (num) {
            const n = Number(num[1].replace(/,/g, ""));
            if (n > 100) maxOutput = n;
          }
        }
        if (h.includes("training") || h.includes("cutoff")) {
          if (v && !v.includes("N/A")) knowledgeCutoff = v;
        }
      }

      // Determine capabilities from the full text context
      const rowText = texts.join(" ").toLowerCase();
      const caps: Record<string, boolean> = { streaming: true };
      if (
        rowText.includes("function") ||
        rowText.includes("tool") ||
        rowText.includes("yes")
      )
        caps.tool_call = true;
      if (rowText.includes("structured")) caps.structured_output = true;
      if (rowText.includes("reason")) caps.reasoning = true;
      if (rowText.includes("image") || rowText.includes("vision"))
        caps.vision = true;
      if (rowText.includes("json")) caps.json_mode = true;

      // Determine modalities
      const hasImageInput =
        rowText.includes("image") || rowText.includes("text + image");
      const inputMods = hasImageInput ? ["text", "image"] : ["text"];

      // Determine creator
      let createdBy = "openai";
      if (/^(deepseek|Deep)/i.test(id)) createdBy = "deepseek";
      else if (/^(llama|meta)/i.test(id)) createdBy = "meta";
      else if (/^(mistral|codestral|pixtral|ministral)/i.test(id))
        createdBy = "mistral";
      else if (/^(cohere|command|embed-v)/i.test(id)) createdBy = "cohere";
      else if (/^(grok)/i.test(id)) createdBy = "xai";
      else if (/^(kimi|moonshot)/i.test(id)) createdBy = "moonshot";
      else if (/^(model-router|mai-|phi)/i.test(id)) createdBy = "microsoft";
      else if (/^(flux)/i.test(id)) createdBy = "black-forest-labs";
      else if (/^(fw-)/i.test(id))
        createdBy = texts[0]?.match(/\w+/)?.[0] ?? "unknown";

      models.push({
        id,
        name: modelCell.split("(")[0].trim(),
        created_by: createdBy,
        context_window: contextWindow,
        max_output_tokens: maxOutput,
        knowledge_cutoff: knowledgeCutoff,
        capabilities: caps,
        modalities: { input: inputMods, output: ["text"] },
      });
    }
  }

  return models;
}

// ── Main ──

async function main() {
  console.log("Fetching Azure AI Foundry models from docs...");

  const models = await fetchModels();
  console.log(`Parsed ${models.length} models`);

  let written = 0;
  for (const m of models) {
    const entry: ModelEntry = {
      id: m.id,
      name: m.name,
      created_by: m.created_by,
      family: inferFamily(m.id),
      context_window: m.context_window,
      max_output_tokens: m.max_output_tokens,
      knowledge_cutoff: m.knowledge_cutoff,
      capabilities: m.capabilities,
      modalities: m.modalities,
    };

    written += upsertWithSnapshot("azure", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
