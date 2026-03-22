import { fetchText, findHtmlTables, stripHtml } from "./parse.ts";
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

function parseTokenCount(s: string): number | undefined {
  const m = s.match(/(\d+)[kK]/);
  return m ? Number(m[1]) * 1000 : undefined;
}

function parsePrice(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

function parsePricingPage(html: string): ParsedModel[] {
  const tables = findHtmlTables(html);
  if (tables.length === 0) return [];

  const table = tables[0];
  const modelIds: string[] = [];

  let context: number | undefined;
  let cachedInput: number | undefined;
  let input: number | undefined;
  let output: number | undefined;
  const maxOutputs: (number | undefined)[] = [];
  const versions: (string | undefined)[] = [];
  const features: string[][] = [];
  let currentCategory = "";

  for (const row of table.rows) {
    if (row.length < 2) continue;
    const label = row[0].toUpperCase().trim();

    if (label.includes("MODEL") && !label.includes("VERSION")) {
      for (let i = 1; i < row.length; i++) {
        const id = row[i].replace(/`/g, "").trim();
        if (id && id !== "") {
          modelIds.push(id);
          features.push([]);
        }
      }
    } else if (label.includes("MODEL VERSION") || label.includes("VERSION")) {
      for (let i = 1; i < row.length; i++) {
        versions.push(row[i]?.trim());
      }
    } else if (label.includes("CONTEXT")) {
      const val = row.slice(1).join(" ");
      context = parseTokenCount(val);
    } else if (label.includes("MAX OUTPUT")) {
      for (let i = 1; i < row.length; i++) {
        const maxMatch = row[i]?.match(/MAXIMUM:\s*(\d+)[kK]/i);
        maxOutputs.push(
          maxMatch ? Number(maxMatch[1]) * 1000 : parseTokenCount(row[i] ?? ""),
        );
      }
    } else if (label.includes("FEATURE") || label.includes("PRICING")) {
      currentCategory = label.includes("FEATURE") ? "feature" : "pricing";
      const featureName = row[1]?.trim();
      if (currentCategory === "feature" && featureName) {
        for (let i = 0; i < modelIds.length; i++) {
          const val = row[i + 2]?.trim();
          if (val === "✓" || val === "✓") features[i]?.push(featureName);
        }
      }
      if (currentCategory === "pricing" && featureName) {
        const price = parsePrice(row.slice(2).join(" ") || row[1]);
        if (featureName.includes("CACHE HIT")) cachedInput = price;
        else if (
          featureName.includes("CACHE MISS") ||
          featureName.includes("INPUT")
        )
          input = price;
        else if (featureName.includes("OUTPUT")) output = price;
      }
    } else if (currentCategory === "feature") {
      const featureName = row[0]?.trim() || row[1]?.trim();
      if (featureName) {
        for (let i = 0; i < modelIds.length; i++) {
          const val = (row[i + 1] ?? row[i + 2])?.trim();
          if (val === "✓" || val === "✓") features[i]?.push(featureName);
        }
      }
    } else if (currentCategory === "pricing") {
      const priceName = (row[0]?.trim() ?? row[1]?.trim() ?? "").toUpperCase();
      const priceVal = parsePrice(row.slice(1).join(" "));
      if (priceName.includes("CACHE HIT") && priceVal != null)
        cachedInput = priceVal;
      else if (priceName.includes("CACHE MISS") && priceVal != null)
        input = priceVal;
      else if (priceName.includes("INPUT") && priceVal != null && input == null)
        input = priceVal;
      else if (priceName.includes("OUTPUT") && priceVal != null)
        output = priceVal;
    }
  }

  const models: ParsedModel[] = [];
  for (let i = 0; i < modelIds.length; i++) {
    models.push({
      id: modelIds[i],
      version: versions[i],
      context_window: context,
      max_output_tokens: maxOutputs[i],
      features: features[i] ?? [],
      pricing:
        input != null && output != null
          ? { input, output, cached_input: cachedInput ?? input * 0.1 }
          : undefined,
    });
  }
  return models;
}

// ── Changelog parsing → version history ──

interface VersionEntry {
  date: string;
  version: string;
  models: ("deepseek-chat" | "deepseek-reasoner")[];
}

function parseChangelog(html: string): VersionEntry[] {
  const entries: VersionEntry[] = [];
  const text = stripHtml(html);

  const sections = text.split(/Date:\s*(\d{4}-\d{2}-\d{2})/);

  // Deduplicate by date+model (TOC at page bottom duplicates entries)
  const seen = new Set<string>();

  for (let i = 1; i < sections.length; i += 2) {
    const date = sections[i];
    const content = sections[i + 1] ?? "";

    // Version regex: "DeepSeek-V3.2", "DeepSeek V2.5", "DeepSeek-Coder-V2-0724"
    const versionMatch = content.match(
      /(?:upgraded to|new model)[,\s]+(DeepSeek[- ](?:V|R|Coder)[-A-Za-z0-9.]*[A-Za-z0-9])/i,
    );
    // Heading fallback: only match actual version names (V/R prefix), not model IDs
    const headingMatch = content.match(
      /^\s*(DeepSeek-[VR][A-Za-z0-9][-A-Za-z0-9.]*[A-Za-z0-9])/im,
    );
    const version = versionMatch?.[1]?.trim() ?? headingMatch?.[1]?.trim();
    if (!version) continue;

    const models: ("deepseek-chat" | "deepseek-reasoner")[] = [];
    if (content.includes("deepseek-chat")) models.push("deepseek-chat");
    if (content.includes("deepseek-reasoner")) models.push("deepseek-reasoner");
    if (content.includes("deepseek-coder") && !models.includes("deepseek-chat"))
      models.push("deepseek-chat");
    if (models.length === 0) continue;

    // Deduplicate: skip models already seen for this date
    const deduped: ("deepseek-chat" | "deepseek-reasoner")[] = [];
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
  isReasoner: boolean,
): Record<string, boolean> {
  const caps: Record<string, boolean> = { streaming: true };
  const joined = feats.join(" ").toLowerCase();

  if (joined.includes("json")) caps.json_mode = true;
  if (joined.includes("tool") || joined.includes("function"))
    caps.tool_call = true;
  if (joined.includes("structured")) caps.structured_output = true;
  if (isReasoner) caps.reasoning = true;

  return caps;
}

/** Strip "DeepSeek-" or "DeepSeek " prefix for display names */
function shortVersion(version: string): string {
  return version.replace(/^DeepSeek[- ]/i, "");
}

// ── Fallback model definitions ──

const FALLBACK_MODELS: ParsedModel[] = [
  {
    id: "deepseek-chat",
    version: "DeepSeek-V3.2 (Non-thinking Mode)",
    context_window: 128000,
    max_output_tokens: 8000,
    features: [
      "Json Output",
      "Tool Calls",
      "Chat Prefix Completion",
      "FIM Completion",
    ],
    pricing: { input: 0.28, output: 0.42, cached_input: 0.028 },
  },
  {
    id: "deepseek-reasoner",
    version: "DeepSeek-V3.2 (Thinking Mode)",
    context_window: 128000,
    max_output_tokens: 64000,
    features: ["Json Output", "Tool Calls", "Chat Prefix Completion"],
    pricing: { input: 0.28, output: 0.42, cached_input: 0.028 },
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
    const isChat = m.id.includes("chat");
    const modelVersions = versionsByModel.get(m.id) ?? [];
    const latestVersion = modelVersions[0];
    const allSnapshotIds = modelVersions.map((v) => `${m.id}-${v.date}`);
    const versionLabel = shortVersion(latestVersion?.version ?? "V3.2");

    // Write alias entry
    const aliasEntry: ModelEntry = {
      id: m.id,
      name: isReasoner
        ? `DeepSeek ${versionLabel} (Reasoner)`
        : `DeepSeek ${versionLabel} (Chat)`,
      family: "deepseek-chat",
      description: isReasoner
        ? `${latestVersion?.version ?? "DeepSeek-V3.2"} in thinking mode with chain-of-thought reasoning.`
        : `${latestVersion?.version ?? "DeepSeek-V3.2"} in non-thinking mode. Best for general chat, code, and tool use.`,
      model_type: isReasoner ? "reasoning" : "chat",
      status: "active",
      release_date: latestVersion?.date,
      context_window: m.context_window,
      max_output_tokens: m.max_output_tokens,
      capabilities: featuresToCapabilities(m.features, isReasoner),
      modalities: { input: ["text"], output: ["text"] },
      endpoints: isChat
        ? ["chat_completions", "completions"]
        : ["chat_completions"],
      snapshots: allSnapshotIds,
    };
    if (isReasoner) aliasEntry.reasoning_tokens = true;
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
        name: isReasoner
          ? `DeepSeek ${label} (Reasoner)`
          : `DeepSeek ${label} (Chat)`,
        family: "deepseek-chat",
        model_type: wasReasoning ? "reasoning" : "chat",
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
          isReasoner,
        );
        snapshotEntry.endpoints = isChat
          ? ["chat_completions", "completions"]
          : ["chat_completions"];
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
