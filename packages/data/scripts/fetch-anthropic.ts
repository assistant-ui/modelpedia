import {
  envOrNull,
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertModel,
} from "./shared.ts";

// ── Types ──

interface ModelSpec {
  id: string;
  alias?: string;
  name: string;
  description?: string;
  context_window?: number;
  max_output_tokens?: number;
  knowledge_cutoff?: string;
  latency?: string;
  extended_thinking?: boolean;
  deprecated?: boolean;
  pricing_input?: number;
  pricing_output?: number;
}

// ── Markdown endpoints ──

const MODELS_MD =
  "https://platform.claude.com/docs/en/about-claude/models/overview.md";
const PRICING_MD =
  "https://platform.claude.com/docs/en/about-claude/pricing.md";

// ── Markdown table parser ──

function parseMarkdownTable(lines: string[]): string[][] {
  const rows: string[][] = [];
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    // Skip separator rows
    if (/^\|[\s:-]+\|$/.test(line.replace(/[|:\-\s]/g, ""))) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.replace(/\*\*/g, "").trim());
    rows.push(cells);
  }
  return rows;
}

function parseTokenCount(s: string): number | undefined {
  // Handle: "1M tokens", "200k tokens", "128k tokens",
  // "<Tooltip ...>1M tokens</Tooltip>", "1M (or 200k) tokens"
  const cleaned = s.replace(/<[^>]+>/g, "").replace(/\([^)]*\)/g, "");
  const m = cleaned.match(/([\d,.]+)\s*([MKk])/);
  if (!m) return undefined;
  const num = Number(m[1].replace(/,/g, ""));
  return m[2] === "M" ? num * 1_000_000 : num * 1_000;
}

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

// ── Parse models overview page ──

function parseModelsMarkdown(md: string): ModelSpec[] {
  const models: ModelSpec[] = [];

  // Split into sections by table headers
  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    // Find table start (header row with "Feature")
    if (!lines[i].includes("| Feature |")) {
      i++;
      continue;
    }

    // Collect table lines
    const tableLines: string[] = [];
    while (i < lines.length && lines[i].startsWith("|")) {
      tableLines.push(lines[i]);
      i++;
    }

    const rows = parseMarkdownTable(tableLines);
    if (rows.length < 3) continue; // header + separator + at least 1 data row

    const headers = rows[0];
    const modelCount = headers.length - 1;
    const cols: ModelSpec[] = Array.from({ length: modelCount }, (_, j) => ({
      id: "",
      name: headers[j + 1].replace(/\(deprecated\)/, "").trim(),
      deprecated: headers[j + 1].includes("deprecated"),
    }));

    for (const row of rows.slice(1)) {
      const feature = row[0]
        .replace(/<[^>]+>/g, "")
        .replace(
          /\[[^\]]+\]\([^)]+\)/g,
          (m) => m.match(/\[([^\]]+)\]/)?.[1] ?? m,
        )
        .trim();

      for (let j = 0; j < modelCount; j++) {
        const val = row[j + 1];
        if (!val) continue;
        const m = cols[j];

        if (feature.includes("Claude API ID")) {
          m.id = val.replace(/<[^>]+>/g, "").trim();
        } else if (feature.includes("Claude API alias")) {
          const clean = val.replace(/<[^>]+>/g, "").trim();
          if (clean !== "N/A") m.alias = clean;
        } else if (feature === "Description") {
          m.description = val;
        } else if (feature.includes("Pricing")) {
          const parts = val.replace(/<br\s*\/?>/g, "\n").split("\n");
          if (parts.length >= 2) {
            m.pricing_input = parseDollar(parts[0]);
            m.pricing_output = parseDollar(parts[1]);
          }
        } else if (feature.includes("Context window")) {
          m.context_window = parseTokenCount(val);
        } else if (feature.includes("Max output")) {
          m.max_output_tokens = parseTokenCount(val);
        } else if (feature.includes("Reliable knowledge cutoff")) {
          const cleaned = val.replace(/<sup>.*?<\/sup>/g, "").trim();
          if (cleaned && cleaned !== "—" && /[A-Z][a-z]+ \d{4}/.test(cleaned)) {
            m.knowledge_cutoff = cleaned.match(/[A-Z][a-z]+ \d{4}/)?.[0];
          }
        } else if (feature.includes("Comparative latency")) {
          m.latency = val;
        } else if (feature.includes("Extended thinking")) {
          m.extended_thinking = val === "Yes";
        }
      }
    }

    models.push(...cols.filter((m) => m.id));
    i++;
  }

  return models;
}

// ── Parse pricing page ──

function parsePricingMarkdown(md: string): {
  pricing: Map<string, { input: number; output: number; cached_input: number }>;
  batch: Map<string, { batch_input: number; batch_output: number }>;
} {
  const pricing = new Map<
    string,
    { input: number; output: number; cached_input: number }
  >();
  const batch = new Map<
    string,
    { batch_input: number; batch_output: number }
  >();

  const lines = md.split("\n");
  let i = 0;

  while (i < lines.length) {
    if (!lines[i].startsWith("| ") || !lines[i].includes("|")) {
      i++;
      continue;
    }

    const tableLines: string[] = [];
    while (i < lines.length && lines[i].startsWith("|")) {
      tableLines.push(lines[i]);
      i++;
    }

    const rows = parseMarkdownTable(tableLines);
    if (rows.length < 2) continue;

    const header = rows[0].join(" ").toLowerCase();

    if (header.includes("base input") && header.includes("cache")) {
      // Model pricing: Model | Base Input | 5m Cache | 1h Cache | Cache Hits | Output
      for (const row of rows.slice(1)) {
        const name = row[0]
          ?.replace(/\(?\[.*?\]\(.*?\)\)?/g, "")
          .replace(/\(deprecated\)/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const input = parseDollar(row[1]);
        const cachedInput = parseDollar(row[4]);
        const output = parseDollar(row[5]);
        if (name && input != null && output != null) {
          pricing.set(name, {
            input,
            output,
            cached_input: cachedInput ?? input * 0.1,
          });
        }
      }
    } else if (
      header.includes("batch input") &&
      header.includes("batch output")
    ) {
      for (const row of rows.slice(1)) {
        const name = row[0]
          ?.replace(/\(?\[.*?\]\(.*?\)\)?/g, "")
          .replace(/\(deprecated\)/g, "")
          .replace(/\s+/g, " ")
          .trim();
        const batchIn = parseDollar(row[1]);
        const batchOut = parseDollar(row[2]);
        if (name && batchIn != null && batchOut != null) {
          batch.set(name, { batch_input: batchIn, batch_output: batchOut });
        }
      }
    }

    i++;
  }

  return { pricing, batch };
}

// ── Name → ID mapping ──

const NAME_TO_ID: Record<string, string> = {
  "Claude Opus 4.6": "claude-opus-4-6",
  "Claude Opus 4.5": "claude-opus-4-5",
  "Claude Opus 4.1": "claude-opus-4-1",
  "Claude Opus 4": "claude-opus-4-0",
  "Claude Opus 3": "claude-3-opus",
  "Claude Sonnet 4.6": "claude-sonnet-4-6",
  "Claude Sonnet 4.5": "claude-sonnet-4-5",
  "Claude Sonnet 4": "claude-sonnet-4-0",
  "Claude Sonnet 3.7": "claude-3-7-sonnet",
  "Claude Haiku 4.5": "claude-haiku-4-5",
  "Claude Haiku 3.5": "claude-3-5-haiku",
  "Claude Haiku 3": "claude-3-haiku",
};

function latencyToSpeed(latency: string | undefined): number | undefined {
  if (!latency) return undefined;
  const l = latency.toLowerCase();
  if (l.includes("fastest")) return 5;
  if (l.includes("fast")) return 4;
  if (l.includes("moderate")) return 3;
  return undefined;
}

// ── API fetch (optional, for release dates) ──

interface ApiModel {
  id: string;
  display_name: string;
  created_at: string;
}

async function fetchApiModels(apiKey: string): Promise<Map<string, ApiModel>> {
  const models = new Map<string, ApiModel>();
  let afterId: string | undefined;
  while (true) {
    const url = new URL("https://api.anthropic.com/v1/models");
    url.searchParams.set("limit", "100");
    if (afterId) url.searchParams.set("after_id", afterId);
    const res = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    const data = (await res.json()) as {
      data: ApiModel[];
      has_more: boolean;
      last_id?: string;
    };
    for (const m of data.data)
      if (m.id.startsWith("claude")) models.set(m.id, m);
    if (!data.has_more) break;
    afterId = data.last_id ?? data.data[data.data.length - 1]?.id;
  }
  return models;
}

// ── Main ──

async function main() {
  console.log("Fetching Anthropic models from docs (.md)...");

  const [modelsMd, pricingMd] = await Promise.all([
    fetch(MODELS_MD).then((r) => r.text()),
    fetch(PRICING_MD).then((r) => r.text()),
  ]);

  const specs = parseModelsMarkdown(modelsMd);
  const { pricing, batch } = parsePricingMarkdown(pricingMd);

  console.log(
    `Parsed: ${specs.length} models from docs, ${pricing.size} pricing, ${batch.size} batch`,
  );

  // Optional API for release dates
  const apiKey = envOrNull("ANTHROPIC_API_KEY");
  let apiModels = new Map<string, ApiModel>();
  if (apiKey) {
    console.log("Fetching from API...");
    apiModels = await fetchApiModels(apiKey);
    console.log(`Found ${apiModels.size} models from API`);
  }

  function findPricing(name: string) {
    if (pricing.has(name)) return pricing.get(name);
    for (const [k, v] of pricing)
      if (name.includes(k) || k.includes(name)) return v;
    return undefined;
  }
  function findBatch(name: string) {
    if (batch.has(name)) return batch.get(name);
    for (const [k, v] of batch)
      if (name.includes(k) || k.includes(name)) return v;
    return undefined;
  }

  const seen = new Set<string>();
  let written = 0;

  function buildEntry(
    spec: ModelSpec,
    id: string,
    extra?: Partial<ModelEntry>,
  ): ModelEntry {
    const p =
      findPricing(spec.name) ??
      (spec.pricing_input != null
        ? {
            input: spec.pricing_input!,
            output: spec.pricing_output!,
            cached_input: spec.pricing_input! * 0.1,
          }
        : undefined);
    const b = findBatch(spec.name);
    const apiModel = apiModels.get(id);

    const entry: ModelEntry = {
      id,
      name: spec.name,
      family: inferFamily(id),
      description: spec.description,
      status: spec.deprecated ? "deprecated" : "active",
      context_window: spec.context_window,
      max_output_tokens: spec.max_output_tokens,
      knowledge_cutoff: spec.knowledge_cutoff,
      speed: latencyToSpeed(spec.latency),
      modalities: { input: ["text", "image"], output: ["text"] },
      capabilities: {
        streaming: true,
        vision: true,
        tool_call: true,
        ...(spec.extended_thinking ? { reasoning: true } : {}),
      },
      ...extra,
    };

    if (p) {
      entry.pricing = {
        input: p.input,
        output: p.output,
        cached_input: p.cached_input,
        ...(b
          ? { batch_input: b.batch_input, batch_output: b.batch_output }
          : {}),
      };
    }

    if (apiModel?.created_at) {
      entry.release_date = apiModel.created_at.split("T")[0];
    }

    return entry;
  }

  for (const spec of specs) {
    const snapshotId = spec.id; // e.g. claude-opus-4-6-20260101
    const aliasId = spec.alias; // e.g. claude-opus-4-6
    const hasAlias = aliasId && aliasId !== snapshotId;

    // 1. Write alias model (with snapshots list)
    if (aliasId && !seen.has(aliasId)) {
      seen.add(aliasId);
      const entry = buildEntry(spec, aliasId, {
        snapshots: hasAlias ? [snapshotId] : undefined,
      });
      if (upsertModel("anthropic", entry)) written++;
    } else if (aliasId && hasAlias) {
      // Alias already written — append this snapshot to its snapshots list
      // (handled by upsert merge on array field)
    }

    // 2. Write snapshot model (with alias back-reference)
    if (hasAlias && !seen.has(snapshotId)) {
      seen.add(snapshotId);
      const entry = buildEntry(spec, snapshotId, {
        alias: aliasId,
      });
      if (upsertModel("anthropic", entry)) written++;
    }

    // 3. Models without alias/snapshot distinction (id === alias or no alias)
    if (!hasAlias && !seen.has(snapshotId)) {
      seen.add(snapshotId);
      const entry = buildEntry(spec, snapshotId);
      if (upsertModel("anthropic", entry)) written++;
    }
  }

  // Pricing-only models not in overview
  for (const [name, p] of pricing) {
    const id = NAME_TO_ID[name];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const b = findBatch(name);
    const apiModel = apiModels.get(id);
    const entry: ModelEntry = {
      id,
      name,
      family: inferFamily(id),
      modalities: { input: ["text", "image"], output: ["text"] },
      capabilities: { streaming: true, vision: true, tool_call: true },
      pricing: {
        input: p.input,
        output: p.output,
        cached_input: p.cached_input,
        ...(b
          ? { batch_input: b.batch_input, batch_output: b.batch_output }
          : {}),
      },
    };
    if (apiModel?.created_at)
      entry.release_date = apiModel.created_at.split("T")[0];
    if (upsertModel("anthropic", entry)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
