import { fetchText } from "./parse.ts";
import {
  assertParsed,
  inferFamily,
  type ModelEntry,
  parseMarkdownTable,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch StepFun (阶跃星辰) models from the public Chinese docs markdown.
 *
 * Sources:
 * - Pricing: https://platform.stepfun.com/docs/zh/guides/pricing/details.md
 * - Model pages for descriptions
 *
 * Token pricing is in CNY per 1M tokens. We convert to USD/1M using
 * 1 USD ≈ 7.2 CNY (multiply by 1/7.2 ≈ 0.13889). Per-character TTS and
 * per-hour ASR rates go in pricing_notes.
 */

const sources = readSources("stepfun");
const CNY_TO_USD_PER_M = 1 / 7.2; // ≈ 0.13889

// ── Markdown helpers ──

/** Parse a CNY price string like "0.7元", "0.5元", "限免中" → number | undefined */
function parseCnyPrice(s: string): number | undefined {
  const cleaned = s.trim();
  if (!cleaned || cleaned.includes("限免")) return undefined;
  const m = cleaned.match(/([\d.]+)/);
  if (!m) return undefined;
  return Number(m[1]);
}

/** CNY/M → USD/M, rounded to 3 decimals */
function cnyToUsd(cny: number | undefined): number | undefined {
  if (cny == null) return undefined;
  return Math.round(cny * CNY_TO_USD_PER_M * 1000) / 1000;
}

/** Extract the markdown lines under a heading. Stops at the next ## or ### heading. */
function sectionLines(md: string, headingRe: RegExp): string[] {
  const lines = md.split("\n");
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{2,3}\s/.test(l)) break;
    out.push(l);
  }
  return out;
}

// ── Pricing parsing ──

interface PricingRow {
  id: string;
  inputCny?: number;
  cachedCny?: number;
  outputCny?: number;
}

function parseTokenTable(lines: string[]): PricingRow[] {
  const rows = parseMarkdownTable(lines);
  if (rows.length < 2 || rows[0][0] !== "Model ID") return [];
  const out: PricingRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 4) continue;
    const id = cleanId(r[0]);
    if (!id) continue;
    if (out.some((p) => p.id === id)) continue;
    out.push({
      id,
      inputCny: parseCnyPrice(r[1]),
      cachedCny: parseCnyPrice(r[2]),
      outputCny: parseCnyPrice(r[3]),
    });
  }
  return out;
}

interface AudioRow {
  id: string;
  unit: string;
}

function parseAudioTable(lines: string[]): AudioRow[] {
  const rows = parseMarkdownTable(lines);
  if (rows.length < 2 || rows[0][0] !== "Model ID") return [];
  const out: AudioRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (r.length < 2) continue;
    const id = cleanId(r[0]);
    if (!/^step[a-z0-9.-]+$/.test(id)) continue;
    out.push({ id, unit: r[1].trim() });
  }
  return out;
}

// ── Description scraping (per-domain pages) ──

function extractDescriptions(md: string): Map<string, string> {
  const out = new Map<string, string>();
  const sections = md.split(/^### /m).slice(1);
  for (const s of sections) {
    const firstLine = s.split("\n", 1)[0].trim();
    const id = firstLine.toLowerCase().replace(/\s+/g, "-");
    if (!id || !id.startsWith("step")) continue;
    const body = s.slice(firstLine.length).trim();
    const firstPara = body
      .split(/\n\s*\n/)[0]
      ?.replace(/\s+/g, " ")
      .trim();
    if (firstPara) out.set(id, firstPara);
  }
  return out;
}

// ── Model specs ──

/**
 * Normalise a model-id table cell. The docs wrap ids in backticks and annotate
 * some with a parenthetical like "（推荐）"; both leaked into the id and broke
 * every SPECS lookup, so all but one model was dropped as unregistered.
 */
function cleanId(cell: string): string {
  return cell
    .replace(/[（(].*?[)）]/g, "")
    .replace(/`/g, "")
    .trim();
}

/**
 * Known specs per model. This enriches what the pricing tables carry; it is
 * deliberately not a gate, because a hardcoded allowlist silently drops every
 * model the provider ships after it was written.
 */
const SPECS: Record<string, Partial<ModelEntry>> = {
  "step-5-preview": { name: "Step 5 Preview" },
  "step-3.7-flash": { name: "Step 3.7 Flash" },
  "step-3.5-flash": {
    name: "Step 3.5 Flash",
    family: "step-3.5",
    model_type: "reasoning",
    context_window: 256000,
    reasoning_tokens: true,
    license: "apache-2.0",
    open_weight: true,
    capabilities: {
      tool_call: true,
      reasoning: true,
      streaming: true,
      structured_output: true,
      json_mode: true,
    },
    modalities: { input: ["text"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-3.5-flash-2603": {
    name: "Step 3.5 Flash 2603",
    family: "step-3.5",
    model_type: "reasoning",
    context_window: 256000,
    reasoning_tokens: true,
    license: "apache-2.0",
    open_weight: true,
    capabilities: {
      tool_call: true,
      reasoning: true,
      streaming: true,
      structured_output: true,
      json_mode: true,
    },
    modalities: { input: ["text"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-3": {
    name: "Step 3",
    family: "step-3",
    model_type: "reasoning",
    context_window: 64000,
    reasoning_tokens: true,
    license: "apache-2.0",
    open_weight: true,
    capabilities: {
      vision: true,
      tool_call: true,
      reasoning: true,
      streaming: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-r1-v-mini": {
    name: "Step R1 V Mini",
    family: "step-r",
    model_type: "reasoning",
    context_window: 100000,
    reasoning_tokens: true,
    license: "proprietary",
    open_weight: false,
    capabilities: {
      vision: true,
      reasoning: true,
      streaming: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-2-mini": {
    name: "Step 2 Mini",
    family: "step-2",
    model_type: "chat",
    context_window: 32000,
    license: "proprietary",
    capabilities: { tool_call: true, streaming: true },
    modalities: { input: ["text"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-2-16k": {
    name: "Step 2 16k",
    family: "step-2",
    model_type: "chat",
    context_window: 16000,
    license: "proprietary",
    capabilities: { tool_call: true, streaming: true },
    modalities: { input: ["text"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-2-16k-exp": {
    name: "Step 2 16k Experimental",
    family: "step-2",
    model_type: "chat",
    context_window: 16000,
    license: "proprietary",
    status: "preview",
    capabilities: { streaming: true },
    modalities: { input: ["text"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-1-8k": {
    name: "Step 1 8k",
    family: "step-1",
    model_type: "chat",
    context_window: 8000,
    license: "proprietary",
    capabilities: { streaming: true },
    modalities: { input: ["text"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-1-32k": {
    name: "Step 1 32k",
    family: "step-1",
    model_type: "chat",
    context_window: 32000,
    license: "proprietary",
    capabilities: { streaming: true },
    modalities: { input: ["text"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-1o-turbo-vision": {
    name: "Step-1o Turbo Vision",
    family: "step-1o",
    model_type: "chat",
    context_window: 32000,
    license: "proprietary",
    capabilities: { vision: true, tool_call: true, streaming: true },
    modalities: { input: ["text", "image", "video"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-1o-vision-32k": {
    name: "Step 1o Vision 32k",
    family: "step-1o",
    model_type: "chat",
    context_window: 32000,
    license: "proprietary",
    capabilities: { vision: true, streaming: true },
    modalities: { input: ["text", "image"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-1v-8k": {
    name: "Step 1v 8k",
    family: "step-1v",
    model_type: "chat",
    context_window: 8000,
    license: "proprietary",
    capabilities: { vision: true, streaming: true },
    modalities: { input: ["text", "image"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-1v-32k": {
    name: "Step 1v 32k",
    family: "step-1v",
    model_type: "chat",
    context_window: 32000,
    license: "proprietary",
    capabilities: { vision: true, streaming: true },
    modalities: { input: ["text", "image"], output: ["text"] },
    endpoints: ["chat_completions"],
  },
  "step-1o-audio": {
    name: "Step-1o Audio",
    family: "step-1o",
    model_type: "chat",
    license: "proprietary",
    capabilities: { streaming: true },
    modalities: { input: ["text", "audio"], output: ["text", "audio"] },
    endpoints: ["realtime"],
  },
  "stepaudio-3-realtime-preview": { name: "StepAudio 3 Realtime" },
  "stepaudio-3-chat-preview": { name: "StepAudio 3 Chat" },
  "stepaudio-2.5-realtime": { name: "StepAudio 2.5 Realtime" },
  "stepaudio-2.5-chat": { name: "StepAudio 2.5 Chat" },
  "step-audio-2": { name: "Step Audio 2" },
  "step-audio-r1.5": { name: "Step Audio R1.5" },
};

const AUDIO_SPECS: Record<string, Partial<ModelEntry>> = {
  "stepaudio-3-tts": { name: "StepAudio 3 TTS" },
  "stepaudio-2.5-tts": {
    name: "StepAudio 2.5 TTS",
    family: "stepaudio",
    model_type: "tts",
    license: "proprietary",
    open_weight: true,
    modalities: { input: ["text", "audio"], output: ["audio"] },
    endpoints: ["audio_speech"],
  },
  "step-tts-2": {
    name: "Step TTS 2",
    family: "step-tts",
    model_type: "tts",
    license: "proprietary",
    modalities: { input: ["text", "audio"], output: ["audio"] },
    endpoints: ["audio_speech"],
  },
  "step-tts-mini": {
    name: "Step TTS Mini",
    family: "step-tts",
    model_type: "tts",
    license: "proprietary",
    modalities: { input: ["text", "audio"], output: ["audio"] },
    endpoints: ["audio_speech"],
  },
  "stepaudio-2.5-asr": {
    name: "StepAudio 2.5 ASR",
    family: "stepaudio",
    model_type: "transcription",
    license: "proprietary",
    open_weight: true,
    modalities: { input: ["audio"], output: ["text"] },
    endpoints: ["audio_transcriptions"],
  },
  "stepaudio-3-asr-max": { name: "StepAudio 3 ASR Max" },
  "stepaudio-2-asr-pro": {
    name: "StepAudio 2 ASR Pro",
    family: "stepaudio",
    model_type: "transcription",
    license: "proprietary",
    modalities: { input: ["audio"], output: ["text"] },
    endpoints: ["audio_transcriptions"],
  },
  "step-asr": {
    name: "Step ASR",
    family: "step-asr",
    model_type: "transcription",
    license: "proprietary",
    modalities: { input: ["audio"], output: ["text"] },
    endpoints: ["audio_transcriptions"],
  },
  "step-asr-1.1": {
    name: "Step ASR 1.1",
    family: "step-asr",
    model_type: "transcription",
    license: "proprietary",
    modalities: { input: ["audio"], output: ["text"] },
    endpoints: ["audio_transcriptions"],
  },
  "step-asr-1.1-stream": {
    name: "Step ASR 1.1 Stream",
    family: "step-asr",
    model_type: "transcription",
    license: "proprietary",
    capabilities: { streaming: true },
    modalities: { input: ["audio"], output: ["text"] },
    endpoints: ["audio_transcriptions"],
  },
  "stepaudio-3-gen-preview": { name: "StepAudio 3 Gen" },
  "stepaudio-3-music-preview": { name: "StepAudio 3 Music" },
};

// ── Main ──

async function main() {
  console.log("Fetching StepFun models...");

  const pricingMd = await fetchText(sources.pricing as string);

  const textPricing = parseTokenTable(
    sectionLines(pricingMd, /^## 文本与多模态模型$/),
  );
  const audioPricing = parseTokenTable(
    sectionLines(pricingMd, /^### 按 Token 计费$/),
  );
  const tts = parseAudioTable(sectionLines(pricingMd, /^### 语音合成$/));
  const audioGeneration = parseAudioTable(
    sectionLines(pricingMd, /^### 音频与音乐生成$/),
  );
  const asr = parseAudioTable(sectionLines(pricingMd, /^### 语音识别$/));
  const allTokenPricing = [...textPricing, ...audioPricing];
  console.log(
    `Parsed ${allTokenPricing.length} token-priced models, ${tts.length} TTS, ${audioGeneration.length} audio generation, ${asr.length} ASR`,
  );
  assertParsed(
    allTokenPricing.length + tts.length + audioGeneration.length + asr.length,
    "stepfun",
  );

  // Descriptions from per-domain pages
  const descriptions = new Map<string, string>();
  for (const key of ["text", "vision", "reasoning", "audio"] as const) {
    if (!sources[key]) continue;
    try {
      const md = await fetchText(sources[key] as string);
      for (const [id, desc] of extractDescriptions(md)) {
        if (!descriptions.has(id)) descriptions.set(id, desc);
      }
    } catch (err) {
      console.warn(`  could not fetch ${key} page:`, err);
    }
  }
  console.log(`Collected ${descriptions.size} descriptions`);

  let written = 0;

  for (const p of allTokenPricing) {
    const specs = SPECS[p.id];
    if (!specs) {
      console.log(`  ${p.id} (no specs registered, writing pricing only)`);
    }
    const entry: ModelEntry = {
      id: p.id,
      name: specs?.name ?? p.id,
      family: inferFamily(p.id),
      created_by: "stepfun",
      license: "proprietary",
      ...specs,
      status: p.id.endsWith("-preview") ? "preview" : "active",
    };
    if (audioPricing.includes(p)) entry.model_type = "audio";
    const desc =
      descriptions.get(p.id) ?? descriptions.get(p.id.replace(/-preview$/, ""));
    if (desc) entry.description = desc;
    const inputUsd = cnyToUsd(p.inputCny);
    const cachedUsd = cnyToUsd(p.cachedCny);
    const outputUsd = cnyToUsd(p.outputCny);
    if (inputUsd != null || outputUsd != null) {
      entry.pricing = {};
      if (inputUsd != null) entry.pricing.input = inputUsd;
      if (cachedUsd != null) entry.pricing.cached_input = cachedUsd;
      if (outputUsd != null) entry.pricing.output = outputUsd;
    }
    if (upsertModel("stepfun", entry)) written++;
  }

  for (const a of tts) {
    const specs = AUDIO_SPECS[a.id];
    const entry: ModelEntry = {
      id: a.id,
      name: specs?.name ?? a.id,
      model_type: "tts",
      license: "proprietary",
      ...specs,
      status: "active",
      pricing_notes: [`${a.unit} (CNY)`],
    };
    if (upsertModel("stepfun", entry)) written++;
  }

  for (const a of audioGeneration) {
    const entry: ModelEntry = {
      id: a.id,
      name: AUDIO_SPECS[a.id]?.name ?? a.id,
      model_type: "audio",
      license: "proprietary",
      status: a.id.endsWith("-preview") ? "preview" : "active",
      pricing_notes: [a.unit],
    };
    if (upsertModel("stepfun", entry)) written++;
  }

  for (const a of asr) {
    const specs = AUDIO_SPECS[a.id];
    const entry: ModelEntry = {
      id: a.id,
      name: specs?.name ?? a.id,
      model_type: "transcription",
      license: "proprietary",
      ...specs,
      status: "active",
      pricing_notes: [`${a.unit} (CNY)`],
    };
    if (upsertModel("stepfun", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
