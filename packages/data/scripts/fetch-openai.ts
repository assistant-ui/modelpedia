import {
  fetchBundle,
  parseCompareEntries,
  parseDetailEntries,
  parsePricing,
} from "./openai-parser.ts";
import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

function isRelevant(id: string): boolean {
  if (
    /^(text-embedding|text-moderation|omni-moderation|tts-|whisper|dall-e|sora|babbage|davinci)/.test(
      id,
    )
  )
    return false;
  // Don't skip date-stamped snapshots — upsertWithSnapshot handles them
  if (/ with data sharing$/.test(id)) return false;
  return true;
}

function featuresToCapabilities(
  features: string[] | undefined,
  tools: string[] | undefined,
  reasoning: boolean,
): Record<string, boolean> {
  const f = new Set(features ?? []);
  const t = new Set(tools ?? []);
  const caps: Record<string, boolean> = {};

  if (f.has("streaming")) caps.streaming = true;
  if (f.has("image_input") || t.has("image_generation")) caps.vision = true;
  if (f.has("function_calling") || t.has("function_calling"))
    caps.tool_call = true;
  if (f.has("structured_outputs")) caps.structured_output = true;
  if (f.has("json_mode")) caps.json_mode = true;
  if (f.has("fine_tuning")) caps.fine_tuning = true;
  if (reasoning) caps.reasoning = true;

  return caps;
}

async function main() {
  const js = await fetchBundle();

  const pricing = parsePricing(js);
  const compare = parseCompareEntries(js);
  const detail = parseDetailEntries(js);

  const allNames = new Set([
    ...pricing.keys(),
    ...compare.keys(),
    ...detail.keys(),
  ]);

  // Sync compare data: snapshot → alias (so alias gets specs if only snapshot has them)
  for (const [name, data] of [...compare]) {
    const alias = name.replace(/-\d{4}-\d{2}-\d{2}$/, "");
    if (alias !== name && !compare.has(alias)) {
      compare.set(alias, data);
    }
  }

  console.log(
    `Parsed: ${pricing.size} pricing, ${compare.size} compare, ${detail.size} detail entries`,
  );

  const entries: ModelEntry[] = [];

  for (const name of allNames) {
    if (!isRelevant(name)) continue;

    const p = pricing.get(name);
    const c = compare.get(name);
    const d = detail.get(name);

    const entry: ModelEntry = {
      id: name,
      name: d?.display_name ?? name,
      family: inferFamily(name),
      description: d?.description,
      status: d?.deprecated ? "deprecated" : "active",
    };

    if (c?.context_window) entry.context_window = c.context_window;
    if (c?.max_output_tokens) entry.max_output_tokens = c.max_output_tokens;
    if (c?.modalities) entry.modalities = c.modalities;
    if (c?.knowledge_cutoff) {
      const kc = c.knowledge_cutoff;
      entry.knowledge_cutoff = `${kc.getFullYear()}-${String(kc.getMonth() + 1).padStart(2, "0")}`;
    }

    const caps = featuresToCapabilities(
      c?.supported_features,
      d?.supported_tools,
      c?.reasoning_tokens ?? false,
    );
    if (Object.keys(caps).length > 0) entry.capabilities = caps;

    if (p) {
      entry.pricing = {};
      if (p.main.input != null) entry.pricing.input = p.main.input;
      if (p.main.output != null) entry.pricing.output = p.main.output;
      if (p.main.cached_input != null)
        entry.pricing.cached_input = p.main.cached_input;
      if (p.batch.input != null) entry.pricing.batch_input = p.batch.input;
      if (p.batch.output != null) entry.pricing.batch_output = p.batch.output;
    }

    // Typed fields
    if (d?.type) entry.model_type = d.type as "chat" | "reasoning";
    if (d?.supported_tools) entry.tools = d.supported_tools;
    if (c?.reasoning_tokens) entry.reasoning_tokens = true;
    if (c?.performance) entry.performance = c.performance;
    if (c?.latency) entry.speed = c.latency;

    entries.push(entry);
  }

  console.log(`Writing ${entries.length} models...`);

  let written = 0;
  for (const entry of entries) {
    written += upsertWithSnapshot("openai", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
