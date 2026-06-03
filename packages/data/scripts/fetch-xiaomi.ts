import { fetchText, parseTokenCount } from "./parse.ts";
import {
  assertParsed,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Xiaomi MiMo models from the public docs (llms-full.txt). No API key.
 *
 * The catalog is published as HTML tables (Model ID | Capability Support |
 * Length Limit | Rate Limiting). We parse every table that carries a
 * "Length Limit" column, which is unique to the model-listing tables, and
 * carry forward rowspan'd cells so models that share a spec cell inherit it.
 */

const sources = readSources("xiaomi");
const DOCS_URL = sources.docs as string;

// The provider states that these V2 models auto-route to their V2.5
// counterparts and are fully deprecated on 2026-06-30.
const DEPRECATED: Record<string, string> = {
  "mimo-v2-pro": "mimo-v2.5-pro",
  "mimo-v2-omni": "mimo-v2.5",
};

interface RowModel {
  id: string;
  capability: string;
  length: string;
}

function tablesWith(html: string, headerNeedle: string) {
  return [...html.matchAll(/<table>([\s\S]*?)<\/table>/g)]
    .map((m) => m[1])
    .filter((t) => t.toLowerCase().includes(headerNeedle));
}

function parseModelTable(tableHtml: string): RowModel[] {
  const out: RowModel[] = [];
  let lastCapability = "";
  let lastLength = "";
  for (const tr of tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map(
      (c) =>
        c[1]
          .replace(/<br\s*\/?>/g, " ")
          .replace(/<[^>]+>/g, "")
          .trim(),
    );
    const idCell = cells.find(
      (c) => /`mimo-[\w.-]+`/.test(c) && !c.includes("or"),
    );
    const lenCell = cells.find((c) => /Context Window:/i.test(c));
    const capCell = cells.find((c) =>
      /(Text Generation|Speech Recognition|Speech Synthesis|Deep Thinking|Full-modal)/i.test(
        c,
      ),
    );
    if (lenCell) lastLength = lenCell;
    if (capCell) lastCapability = capCell;
    if (!idCell) continue;
    const id = idCell.match(/`(mimo-[\w.-]+)`/)?.[1];
    if (!id) continue;
    out.push({ id, capability: lastCapability, length: lastLength });
  }
  return out;
}

function classify(id: string, capability: string) {
  const cap = capability.toLowerCase();
  let modelType: ModelEntry["model_type"];
  let modalities: { input: string[]; output: string[] };
  if (/asr|speech recognition/i.test(`${id} ${cap}`)) {
    modelType = "transcription";
    modalities = { input: ["audio"], output: ["text"] };
  } else if (/tts|speech synthesis/i.test(`${id} ${cap}`)) {
    modelType = "tts";
    modalities = { input: ["text"], output: ["audio"] };
  } else if (/full-modal|omni/i.test(`${id} ${cap}`)) {
    modelType = "chat";
    modalities = {
      input: ["text", "image", "audio", "video"],
      output: ["text"],
    };
  } else if (cap.includes("deep thinking")) {
    modelType = "reasoning";
    modalities = { input: ["text"], output: ["text"] };
  } else {
    modelType = "chat";
    modalities = { input: ["text"], output: ["text"] };
  }

  const capabilities: Record<string, boolean> = {};
  if (cap.includes("streaming")) capabilities.streaming = true;
  if (cap.includes("deep thinking")) capabilities.reasoning = true;
  if (cap.includes("function call")) capabilities.tool_call = true;
  if (cap.includes("structured output")) capabilities.structured_output = true;
  if (/full-modal/.test(cap)) capabilities.vision = true;
  if (modelType === "chat" || modelType === "reasoning")
    capabilities.streaming = true;
  return { modelType, modalities, capabilities };
}

async function main() {
  console.log("Fetching Xiaomi MiMo models from docs...");

  const text = await fetchText(DOCS_URL);
  const seen = new Map<string, RowModel>();
  for (const table of tablesWith(text, "length limit")) {
    for (const row of parseModelTable(table)) {
      if (!seen.has(row.id)) seen.set(row.id, row);
    }
  }
  console.log(`Parsed ${seen.size} models from docs`);
  assertParsed(seen.size, "xiaomi");

  let written = 0;
  for (const { id, capability, length } of seen.values()) {
    const { modelType, modalities, capabilities } = classify(id, capability);
    const ctx = length.match(/Context Window:\s*([\d.]+[KkMm]?)/i)?.[1];
    const out = length.match(/Maximum Output:\s*([\d.]+[KkMm]?)/i)?.[1];

    const entry: ModelEntry = {
      id,
      name: id.replace(/^mimo/i, "MiMo"),
      family: "mimo",
      created_by: "xiaomi",
      model_type: modelType,
      status: DEPRECATED[id] ? "deprecated" : "active",
      context_window: ctx ? parseTokenCount(ctx) : undefined,
      max_output_tokens: out ? parseTokenCount(out) : undefined,
      capabilities,
      modalities,
      page_url: "https://platform.xiaomimimo.com",
    };
    if (capabilities.reasoning) entry.reasoning_tokens = true;
    if (DEPRECATED[id]) {
      entry.deprecation_date = "2026-06-30";
      entry.successor = DEPRECATED[id];
    }
    if (upsertModel("xiaomi", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
