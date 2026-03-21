import {
  fetchBundle,
  parseCompareEntries,
  parseDetailEntries,
  parsePricing,
  parsePricingSections,
} from "./openai-parser.ts";
import {
  detectSnapshot,
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

function isRelevant(id: string): boolean {
  if (/ with data sharing$/.test(id)) return false;
  return true;
}

function inferModelType(id: string, endpoints?: string[]): string | undefined {
  if (/^text-embedding/.test(id)) return "embed";
  if (/^(dall-e|chatgpt-image|gpt-image)/.test(id)) return "image";
  if (/^sora/.test(id)) return "video";
  if (/^(tts-|.*-tts)/.test(id)) return "tts";
  if (/^whisper|transcribe/.test(id)) return "transcription";
  if (/^(text-moderation|omni-moderation)/.test(id)) return "moderation";
  if (/^(babbage|davinci)/.test(id)) return "chat";
  if (
    endpoints?.includes("embeddings") &&
    !endpoints.includes("chat_completions")
  )
    return "embed";
  return undefined;
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
  const pricingSections = parsePricingSections(js);

  const allNames = new Set([
    ...pricing.keys(),
    ...compare.keys(),
    ...detail.keys(),
    ...pricingSections.keys(),
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

  // Helper: look up a name in a map, trying both dotted and hyphenated variants
  function lookup<T>(map: Map<string, T>, name: string): T | undefined {
    return (
      map.get(name) ??
      map.get(name.replace(/\./g, "-")) ??
      map.get(name.replace(/-(\d)/g, ".$1"))
    );
  }

  // Deduplicate: slug-based keys (gpt-3-5-turbo) and dotted keys (gpt-3.5-turbo) may
  // refer to the same model. Prefer dotted (the real API name).
  const dedup = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const seenDedup = new Set<string>();
  const dedupedNames: string[] = [];
  // Process dotted names first so they win over slugified ones
  const sortedNames = [...allNames].sort((a, b) => {
    const aDot = a.includes(".");
    const bDot = b.includes(".");
    if (aDot && !bDot) return -1;
    if (!aDot && bDot) return 1;
    return 0;
  });
  for (const name of sortedNames) {
    const key = dedup(name);
    if (seenDedup.has(key)) continue;
    seenDedup.add(key);
    dedupedNames.push(name);
  }

  const entries: ModelEntry[] = [];

  for (const name of dedupedNames) {
    if (!isRelevant(name)) continue;

    const p = lookup(pricing, name);
    const d = lookup(detail, name);
    // For alias models, inherit compare data from current_snapshot if alias has none
    const c =
      lookup(compare, name) ??
      (d?.current_snapshot ? lookup(compare, d.current_snapshot) : undefined);

    const entry: ModelEntry = {
      id: name,
      name: d?.display_name ?? name,
      family: inferFamily(name),
      description: d?.description,
      tagline: d?.tagline,
      status:
        d?.deprecated ||
        /deprecated/i.test(d?.tagline ?? "") ||
        /deprecated/i.test(d?.description ?? "")
          ? "deprecated"
          : "active",
    };

    if (c?.context_window) entry.context_window = c.context_window;
    if (c?.max_output_tokens) entry.max_output_tokens = c.max_output_tokens;
    if (c?.max_input_tokens) entry.max_input_tokens = c.max_input_tokens;
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

    // Detailed pricing tiers
    const tiers = lookup(pricingSections, name);
    if (tiers && tiers.length > 0) {
      if (!entry.pricing) entry.pricing = {};
      entry.pricing.tiers = tiers;

      // Backfill flat pricing from Text tokens Standard row for list/compare views
      if (entry.pricing.input == null) {
        const textTier = tiers.find((t) => t.label === "Text tokens");
        if (textTier) {
          const stdRow = textTier.rows.find((r) => r.label === "Standard");
          if (stdRow) {
            const inputIdx = textTier.columns.indexOf("Input");
            const outputIdx = textTier.columns.indexOf("Output");
            const cachedIdx = textTier.columns.indexOf("Cached input");
            if (inputIdx >= 0 && stdRow.values[inputIdx] != null)
              entry.pricing.input = stdRow.values[inputIdx]!;
            if (outputIdx >= 0 && stdRow.values[outputIdx] != null)
              entry.pricing.output = stdRow.values[outputIdx]!;
            if (cachedIdx >= 0 && stdRow.values[cachedIdx] != null)
              entry.pricing.cached_input = stdRow.values[cachedIdx]!;
          }
          const batchRow = textTier.rows.find((r) => r.label === "Batch");
          if (batchRow) {
            const inputIdx = textTier.columns.indexOf("Input");
            const outputIdx = textTier.columns.indexOf("Output");
            if (inputIdx >= 0 && batchRow.values[inputIdx] != null)
              entry.pricing.batch_input = batchRow.values[inputIdx]!;
            if (outputIdx >= 0 && batchRow.values[outputIdx] != null)
              entry.pricing.batch_output = batchRow.values[outputIdx]!;
          }
        }
      }
    }

    // Model type: use detail type, then infer from ID/endpoints
    if (d?.type && d.type !== "other") {
      entry.model_type = d.type as "chat" | "reasoning";
    } else {
      entry.model_type = inferModelType(name, c?.supported_endpoints);
    }
    if (d?.supported_tools) entry.tools = d.supported_tools;
    if (c?.supported_endpoints) entry.endpoints = c.supported_endpoints;
    if (c?.reasoning_tokens) entry.reasoning_tokens = true;
    if (c?.performance) entry.performance = c.performance;
    if (c?.latency) entry.speed = c.latency;
    if (c?.reasoning_tokens && c?.performance) entry.reasoning = c.performance;

    // Use authoritative snapshots list from detail if available
    if (d?.snapshots) entry.snapshots = d.snapshots;

    // New detail fields
    if (d?.point_to) entry.successor = d.point_to;
    if (d?.pricing_notes) entry.pricing_notes = d.pricing_notes;

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
