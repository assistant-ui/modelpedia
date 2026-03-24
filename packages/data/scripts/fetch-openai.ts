import {
  fetchBundle,
  parseCompareEntries,
  parseDetailEntries,
  parsePricing,
  parsePricingSections,
} from "./openai-parser.ts";
import {
  buildPricing,
  inferFamily,
  inferModelType,
  inferParameters,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

function isRelevant(id: string): boolean {
  return !id.endsWith(" with data sharing");
}

function featuresToCapabilities(
  features: string[] | undefined,
  tools: string[] | undefined,
  reasoning: boolean,
): Record<string, boolean> {
  const f = new Set(features ?? []);
  const t = new Set(tools ?? []);
  const caps: Record<string, boolean> = {};

  caps.streaming = f.has("streaming");
  caps.vision = f.has("image_input") || t.has("image_generation");
  caps.tool_call = f.has("function_calling") || t.has("function_calling");
  caps.structured_output = f.has("structured_outputs");
  caps.json_mode = f.has("json_mode");
  caps.fine_tuning = f.has("fine_tuning");
  caps.reasoning = reasoning;

  // Only return explicit true/false when we have authoritative feature data;
  // when features is undefined (no compare data), return empty so nulls are preserved
  if (!features) return {};

  return caps;
}

async function main() {
  const sources = readSources("openai");
  const js = await fetchBundle(sources.models as string);

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

    const isOss = inferFamily(name) === "gpt-oss";
    // Use slug for page_url; for snapshots, derive from alias name so alias doesn't inherit snapshot URL
    const slugBase = d?.slug ?? name.replace(/-\d{4}-\d{2}-\d{2}$/, "");

    const entry: ModelEntry = {
      id: name,
      name: d?.display_name ?? name,
      family: inferFamily(name),
      description: d?.description,
      tagline: d?.tagline,
      license: isOss ? "apache-2.0" : "proprietary",
      open_weight: isOss,
      page_url:
        slugBase === name
          ? `https://developers.openai.com/api/docs/models/${name}`
          : `https://developers.openai.com/api/docs/models/${slugBase}?snapshot=${name}`,
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
      entry.pricing = buildPricing({
        input: p.main.input,
        output: p.main.output,
        cached_input: p.main.cached_input,
        batch_input: p.batch.input,
        batch_output: p.batch.output,
      });
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
    // Tools: use detail data, or infer function_calling from capabilities
    if (d?.supported_tools) {
      entry.tools = d.supported_tools;
    } else if (caps.tool_call) {
      entry.tools = ["function_calling"];
    }
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

    // Release date: extract from snapshot date in model ID (e.g. gpt-4o-2024-08-06)
    const dateMatch = name.match(/(\d{4}-\d{2}-\d{2})$/);
    if (dateMatch) entry.release_date = dateMatch[1];

    const params = inferParameters(name);
    if (params) {
      entry.parameters = params.parameters;
      if (params.active_parameters)
        entry.active_parameters = params.active_parameters;
    }

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
