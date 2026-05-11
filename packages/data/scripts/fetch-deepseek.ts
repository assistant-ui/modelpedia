import {
  fetchText,
  findHtmlTables,
  parsePrice,
  parseTokenCount,
  stripHtml,
} from "./parse.ts";
import {
  buildPricing,
  envOrNull,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch DeepSeek models from:
 * 1. Docs pricing page (current model specs + pricing)
 * 2. Changelog page (version history → snapshot entries)
 * 3. /models API (optional, needs key — for release dates)
 *
 * `deepseek-chat` and `deepseek-reasoner` are aliases that always point to the
 * latest model version. We create dated snapshot entries (e.g. deepseek-chat-2025-12-01)
 * for each historical version so the full upgrade history is tracked.
 */

const sources = readSources("deepseek");
const PRICING_URL = sources.docs as string;
const CHANGELOG_URL = sources.changelog as string;

// ── Pricing page parsing ──

interface ParsedModel {
  id: string;
  version?: string;
  context_window?: number;
  max_output_tokens?: number;
  features: string[];
  pricing?: { input: number; output: number; cached_input: number };
}

/** Strip trailing footnote markers like " (1)" or "(2)" from a cell. */
function stripFootnote(s: string): string {
  return s.replace(/\s*\(\d+\)\s*$/g, "").trim();
}

function parsePricingPage(html: string): ParsedModel[] {
  const tables = findHtmlTables(html);
  if (tables.length === 0) return [];

  const table = tables[0];
  const modelIds: string[] = [];
  const versions: (string | undefined)[] = [];
  const features: string[][] = [];
  const maxOutputs: (number | undefined)[] = [];
  const cachedInput: (number | undefined)[] = [];
  const input: (number | undefined)[] = [];
  const output: (number | undefined)[] = [];
  let context: number | undefined;
  let currentCategory = "";

  // Pricing cells can look like "$0.003625 (75% off(3))$0.0145" — the first $
  // is the current (discounted) price, which is what we want.
  const cellPrice = (cell: string | undefined): number | undefined =>
    cell ? parsePrice(cell) : undefined;

  for (const row of table.rows) {
    if (row.length < 2) continue;
    const label = row[0].toUpperCase().trim();

    if (label.includes("MODEL") && !label.includes("VERSION")) {
      for (let i = 1; i < row.length; i++) {
        const id = stripFootnote(row[i].replace(/`/g, "")).trim();
        if (id) {
          modelIds.push(id);
          features.push([]);
          versions.push(undefined);
          maxOutputs.push(undefined);
          cachedInput.push(undefined);
          input.push(undefined);
          output.push(undefined);
        }
      }
    } else if (label.includes("MODEL VERSION") || label.includes("VERSION")) {
      for (let i = 1; i < row.length && i - 1 < modelIds.length; i++) {
        versions[i - 1] = row[i]?.trim();
      }
    } else if (label.includes("CONTEXT")) {
      context = parseTokenCount(row.slice(1).join(" "));
    } else if (label.includes("MAX OUTPUT")) {
      const cells = row.slice(1);
      // Single value broadcasts to all models; per-model values map 1:1.
      const broadcast = cells.length === 1 && modelIds.length > 1;
      for (let i = 0; i < modelIds.length; i++) {
        const cell = broadcast ? cells[0] : cells[i];
        const max = cell?.match(/MAXIMUM:\s*(\d+)[kK]/i);
        maxOutputs[i] = max
          ? Number(max[1]) * 1000
          : parseTokenCount(cell ?? "");
      }
    } else if (label.includes("FEATURE") || label.includes("PRICING")) {
      currentCategory = label.includes("FEATURE") ? "feature" : "pricing";
      const itemName = stripFootnote(row[1]?.trim() ?? "");
      if (currentCategory === "feature" && itemName) {
        for (let i = 0; i < modelIds.length; i++) {
          if (row[i + 2]?.trim() === "✓") features[i]?.push(itemName);
        }
      }
      if (currentCategory === "pricing" && itemName) {
        for (let i = 0; i < modelIds.length; i++) {
          const p = cellPrice(row[i + 2]);
          if (p == null) continue;
          if (itemName.includes("CACHE HIT")) cachedInput[i] = p;
          else if (
            itemName.includes("CACHE MISS") ||
            itemName.includes("INPUT")
          )
            input[i] = p;
          else if (itemName.includes("OUTPUT")) output[i] = p;
        }
      }
    } else if (currentCategory === "feature") {
      const featureName = stripFootnote(row[0]?.trim() ?? "");
      if (featureName) {
        for (let i = 0; i < modelIds.length; i++) {
          if (row[i + 1]?.trim() === "✓") features[i]?.push(featureName);
        }
      }
    } else if (currentCategory === "pricing") {
      const priceName = stripFootnote(row[0]?.trim() ?? "").toUpperCase();
      for (let i = 0; i < modelIds.length; i++) {
        const p = cellPrice(row[i + 1]);
        if (p == null) continue;
        if (priceName.includes("CACHE HIT")) cachedInput[i] = p;
        else if (priceName.includes("CACHE MISS")) input[i] = p;
        else if (priceName.includes("INPUT") && input[i] == null) input[i] = p;
        else if (priceName.includes("OUTPUT")) output[i] = p;
      }
    }
  }

  const models: ParsedModel[] = [];
  for (let i = 0; i < modelIds.length; i++) {
    const ip = input[i];
    const op = output[i];
    const ci = cachedInput[i];
    models.push({
      id: modelIds[i],
      version: versions[i],
      context_window: context,
      max_output_tokens: maxOutputs[i],
      features: features[i] ?? [],
      pricing:
        ip != null && op != null
          ? { input: ip, output: op, cached_input: ci ?? ip * 0.1 }
          : undefined,
    });
  }
  return models;
}

// ── Changelog parsing → version history ──

interface VersionEntry {
  date: string;
  version: string;
  models: string[];
}

function parseChangelog(html: string): VersionEntry[] {
  const entries: VersionEntry[] = [];
  const text = stripHtml(html);

  const sections = text.split(/Date:\s*(\d{4}-\d{2}-\d{2})/);

  // Deduplicate by date+model (TOC at page bottom duplicates entries)
  const seen = new Set<string>();

  const emit = (date: string, version: string, modelId: string) => {
    const key = `${date}:${modelId}`;
    if (seen.has(key)) return;
    seen.add(key);
    entries.push({ date, version, models: [modelId] });
  };

  for (let i = 1; i < sections.length; i += 2) {
    const date = sections[i];
    const content = sections[i + 1] ?? "";

    // V4 era introduces distinct SKUs that share a release date. Emit one
    // entry per SKU so each gets its own version label.
    const hasV4Flash = /\bdeepseek-v4-flash\b/i.test(content);
    const hasV4Pro = /\bdeepseek-v4-pro\b/i.test(content);
    if (hasV4Flash || hasV4Pro) {
      if (hasV4Flash) emit(date, "DeepSeek-V4-Flash", "deepseek-v4-flash");
      if (hasV4Pro) emit(date, "DeepSeek-V4-Pro", "deepseek-v4-pro");
      continue;
    }

    // Version regex: "DeepSeek-V3.2", "DeepSeek V2.5", "DeepSeek-Coder-V2-0724"
    const versionMatch = content.match(
      /(?:upgraded to|new model)[,\s]+(DeepSeek[- ](?:V|R|Coder)[-A-Za-z0-9.]*[A-Za-z0-9])/i,
    );
    // Heading fallback. Drops the `^\s*` anchor — the section content can
    // start with a zero-width space (anchor link marker) that doesn't match
    // `\s`. Restricts to V<digit>/R<digit>/Coder so lowercase model IDs
    // like "deepseek-coder" aren't picked up.
    const headingMatch = content.match(
      /DeepSeek[- ](?:V\d|R\d|Coder)[-A-Za-z0-9.]*/,
    );
    const version = versionMatch?.[1]?.trim() ?? headingMatch?.[0]?.trim();
    if (!version) continue;

    const models: string[] = [];
    if (content.includes("deepseek-chat")) models.push("deepseek-chat");
    if (content.includes("deepseek-reasoner")) models.push("deepseek-reasoner");
    if (content.includes("deepseek-coder") && !models.includes("deepseek-chat"))
      models.push("deepseek-chat");
    if (models.length === 0) continue;

    // Deduplicate: skip models already seen for this date
    const deduped: string[] = [];
    for (const m of models) {
      const key = `${date}:${m}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(m);
      }
    }
    if (deduped.length === 0) continue;

    entries.push({ date, version, models: deduped });
  }

  return entries;
}

// ── Feature → capability mapping ──

function featuresToCapabilities(
  feats: string[],
  hasReasoning: boolean,
): Record<string, boolean> {
  const caps: Record<string, boolean> = { streaming: true };
  const joined = feats.join(" ").toLowerCase();

  if (joined.includes("json")) caps.json_mode = true;
  if (joined.includes("tool") || joined.includes("function"))
    caps.tool_call = true;
  if (joined.includes("structured")) caps.structured_output = true;
  if (hasReasoning) caps.reasoning = true;

  return caps;
}

/** Strip "DeepSeek-" or "DeepSeek " prefix for display names */
function shortVersion(version: string): string {
  return version.replace(/^DeepSeek[- ]/i, "");
}

// ── Fallback model definitions ──

const FALLBACK_MODELS: ParsedModel[] = [
  {
    id: "deepseek-v4-flash",
    version: "DeepSeek-V4-Flash",
    context_window: 1_000_000,
    max_output_tokens: 384_000,
    features: [
      "Json Output",
      "Tool Calls",
      "Chat Prefix Completion",
      "FIM Completion",
    ],
    pricing: { input: 0.14, output: 0.28, cached_input: 0.0028 },
  },
  {
    id: "deepseek-v4-pro",
    version: "DeepSeek-V4-Pro",
    context_window: 1_000_000,
    max_output_tokens: 384_000,
    features: [
      "Json Output",
      "Tool Calls",
      "Chat Prefix Completion",
      "FIM Completion",
    ],
    pricing: { input: 0.435, output: 0.87, cached_input: 0.003625 },
  },
];

// ── Main ──

async function main() {
  console.log("Fetching DeepSeek models...");

  // 1. Parse pricing page for current model specs
  let parsed: ParsedModel[] = [];
  try {
    const html = await fetchText(PRICING_URL);
    parsed = parsePricingPage(html);
    console.log(`Parsed ${parsed.length} models from pricing page`);
  } catch (err) {
    console.warn("Could not fetch pricing page:", err);
  }
  if (parsed.length === 0) {
    console.log("Using fallback model definitions");
    parsed = FALLBACK_MODELS;
  }

  // 2. Parse changelog for version history
  let versions: VersionEntry[] = [];
  if (CHANGELOG_URL) {
    try {
      const html = await fetchText(CHANGELOG_URL);
      versions = parseChangelog(html);
      console.log(`Parsed ${versions.length} version entries from changelog`);
    } catch (err) {
      console.warn("Could not fetch changelog:", err);
    }
  }

  // 3. Optional: API for release dates
  const apiKey = envOrNull("DEEPSEEK_API_KEY");
  const apiModels = new Map<string, { created: number }>();
  if (apiKey) {
    try {
      const res = await fetch(sources.api as string, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data: { id: string; created: number }[];
        };
        for (const m of json.data) apiModels.set(m.id, m);
        console.log(`Found ${apiModels.size} models from API`);
      }
    } catch {}
  }

  // 4. Group version entries by model ID and sort by date
  const versionsByModel = new Map<string, VersionEntry[]>();
  for (const v of versions) {
    for (const modelId of v.models) {
      const list = versionsByModel.get(modelId) ?? [];
      list.push(v);
      versionsByModel.set(modelId, list);
    }
  }
  for (const list of versionsByModel.values()) {
    list.sort((a, b) => b.date.localeCompare(a.date)); // newest first
  }

  // 5. Write alias entries (with full snapshot lists), then all snapshots
  let written = 0;

  for (const m of parsed) {
    const isReasoner = m.id.includes("reasoner");
    const isChatOnly = m.id.includes("chat");
    // V4-era SKUs (deepseek-v4-flash, deepseek-v4-pro) are hybrid: they
    // support both thinking and non-thinking modes from one model name.
    const isHybrid = !isReasoner && !isChatOnly;
    const hasReasoning = isReasoner || isHybrid;
    const modelVersions = versionsByModel.get(m.id) ?? [];
    const latestVersion = modelVersions[0];
    const allSnapshotIds = modelVersions.map((v) => `${m.id}-${v.date}`);
    const fallbackVersion = isHybrid ? "DeepSeek-V4" : "DeepSeek-V3.2";
    const versionLabel = shortVersion(
      latestVersion?.version ?? fallbackVersion,
    );

    const variantSuffix = isReasoner
      ? " (Reasoner)"
      : isChatOnly
        ? " (Chat)"
        : "";
    const fullVersion = latestVersion?.version ?? fallbackVersion;
    const description = isReasoner
      ? `${fullVersion} in thinking mode with chain-of-thought reasoning.`
      : isChatOnly
        ? `${fullVersion} in non-thinking mode. Best for general chat, code, and tool use.`
        : `${fullVersion} hybrid model with both non-thinking and thinking (default) modes.`;

    // Write alias entry
    const aliasEntry: ModelEntry = {
      id: m.id,
      name: `DeepSeek ${versionLabel}${variantSuffix}`,
      family: "deepseek-chat",
      license: "mit",
      description,
      model_type: isReasoner ? "reasoning" : "chat",
      status: "active",
      release_date: latestVersion?.date,
      context_window: m.context_window,
      max_output_tokens: m.max_output_tokens,
      capabilities: featuresToCapabilities(m.features, hasReasoning),
      modalities: { input: ["text"], output: ["text"] },
      endpoints: isReasoner
        ? ["chat_completions"]
        : ["chat_completions", "completions"],
      snapshots: allSnapshotIds,
    };
    if (hasReasoning) aliasEntry.reasoning_tokens = true;
    if (m.pricing) {
      aliasEntry.pricing = buildPricing({
        input: m.pricing.input,
        output: m.pricing.output,
        cached_input: m.pricing.cached_input,
      });
    }
    const apiModel = apiModels.get(m.id);
    if (apiModel?.created && !latestVersion) {
      aliasEntry.release_date = new Date(apiModel.created * 1000)
        .toISOString()
        .split("T")[0];
    }
    if (upsertModel("deepseek", aliasEntry)) written++;

    // Write snapshot entries
    for (let idx = 0; idx < modelVersions.length; idx++) {
      const v = modelVersions[idx];
      const snapshotId = `${m.id}-${v.date}`;
      const isCurrent = idx === 0;
      const label = shortVersion(v.version);
      const wasReasoning =
        isReasoner ||
        isHybrid ||
        v.version.toLowerCase().includes("r1") ||
        v.version.toLowerCase().includes("thinking");

      // successor = next newer snapshot, deprecation_date = when it was replaced
      const successor =
        idx > 0 ? `${m.id}-${modelVersions[idx - 1].date}` : undefined;
      const deprecationDate = !isCurrent
        ? modelVersions[idx - 1]?.date
        : undefined;

      const snapshotEntry: ModelEntry = {
        id: snapshotId,
        name: `DeepSeek ${label}${variantSuffix}`,
        family: "deepseek-chat",
        license: "mit",
        model_type: wasReasoning && !isHybrid ? "reasoning" : "chat",
        status: isCurrent ? "active" : "deprecated",
        release_date: v.date,
        deprecation_date: deprecationDate,
        successor,
        alias: m.id,
        modalities: { input: ["text"], output: ["text"] },
        capabilities: {
          streaming: true,
          ...(wasReasoning ? { reasoning: true } : {}),
        },
      };

      if (wasReasoning) snapshotEntry.reasoning_tokens = true;

      // Current snapshot inherits full specs from alias
      if (isCurrent) {
        snapshotEntry.context_window = m.context_window;
        snapshotEntry.max_output_tokens = m.max_output_tokens;
        snapshotEntry.capabilities = featuresToCapabilities(
          m.features,
          hasReasoning,
        );
        snapshotEntry.endpoints = isReasoner
          ? ["chat_completions"]
          : ["chat_completions", "completions"];
        if (m.pricing) {
          snapshotEntry.pricing = buildPricing({
            input: m.pricing.input,
            output: m.pricing.output,
            cached_input: m.pricing.cached_input,
          });
        }
      }

      if (upsertModel("deepseek", snapshotEntry)) written++;
    }
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
