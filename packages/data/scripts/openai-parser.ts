/** Parsers for OpenAI's public Markdown model and pricing documentation. */

export interface PricingEntry {
  name: string;
  main: Record<string, number>;
  batch: Record<string, number>;
}

export interface PricingSectionEntry {
  label: string;
  unit: string;
  columns: string[];
  rows: { label: string; values: (number | null)[] }[];
}

export type ModelPricingSections = Map<string, PricingSectionEntry[]>;

export interface CompareEntry {
  name: string;
  context_window?: number;
  max_output_tokens?: number;
  max_input_tokens?: number;
  modalities?: { input: string[]; output: string[] };
  knowledge_cutoff?: Date;
  supported_features?: string[];
  supported_endpoints?: string[];
  reasoning_tokens?: boolean;
  performance?: number;
  latency?: number;
}

export interface DetailEntry {
  name: string;
  slug?: string;
  display_name?: string;
  description?: string;
  tagline?: string;
  type?: string;
  supported_tools?: string[];
  deprecated?: boolean;
  current_snapshot?: string;
  snapshots?: string[];
  point_to?: string;
  pricing_notes?: string[];
  playground_url?: string;
}

export interface ModelPageEntry {
  detail: DetailEntry;
  compare: CompareEntry;
  pricing: PricingSectionEntry[];
}

export interface DeprecationEntry {
  id: string;
  deprecation_date: string;
  retirement_date?: string;
  successor?: string;
  family?: boolean;
}

type MarkdownTable = {
  headers: string[];
  rows: string[][];
  end: number;
};

const PERFORMANCE_RATINGS: Record<string, number> = {
  low: 1,
  average: 2,
  high: 3,
  higher: 4,
  highest: 5,
};

const SPEED_RATINGS: Record<string, number> = {
  "very slow": 1,
  slow: 2,
  medium: 3,
  fast: 4,
  "very fast": 5,
};

const ENDPOINT_NAMES: Record<string, string> = {
  live: "live",
  "chat completions": "chat_completions",
  responses: "responses",
  realtime: "realtime",
  "realtime translation": "realtime_translation",
  "realtime transcription": "realtime_transcription",
  assistants: "assistants",
  batch: "batch",
  "fine-tuning": "fine_tuning",
  embeddings: "embeddings",
  "image generation": "image_generation",
  videos: "videos",
  "image edit": "image_edit",
  "speech generation": "speech_generation",
  transcription: "transcription",
  translation: "translation",
  moderation: "moderation",
  "completions (legacy)": "completions",
};

function cleanCell(value: string): string {
  return value
    .replace(/`/g, "")
    .replace(/\*\*/g, "")
    .replace(/<[^>]*>/g, "")
    .trim();
}

function parseTable(lines: string[], start: number): MarkdownTable | undefined {
  if (!lines[start]?.trimStart().startsWith("|")) return undefined;

  const rows: string[][] = [];
  let end = start;
  while (end < lines.length && lines[end].trimStart().startsWith("|")) {
    const cells = lines[end]
      .trim()
      .slice(1, -1)
      .split(/(?<!\\)\|/)
      .map((cell) => cleanCell(cell.replace(/\\\|/g, "|")));
    if (!cells.every((cell) => /^[\s:-]+$/.test(cell))) rows.push(cells);
    end++;
  }

  if (rows.length < 2) return undefined;
  return { headers: rows[0], rows: rows.slice(1), end };
}

function section(markdown: string, title: string): string {
  const escaped = title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(`^##\\s+${escaped}\\s*$`, "mi").exec(markdown);
  if (!match || match.index == null) return "";
  const start = match.index + match[0].length;
  const next = /^##\s+/gm;
  next.lastIndex = start;
  const following = next.exec(markdown);
  return markdown.slice(start, following?.index).trim();
}

function parsePrice(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/\$([\d,.]+)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}

function parseDate(value: string): string | undefined {
  const iso = value.match(/\d{4}[-‑–]\d{2}[-‑–]\d{2}/)?.[0];
  if (iso) return iso.replace(/[‑–]/g, "-");
  const month = value.match(/[A-Z][a-z]+\.?\s+\d{1,2},\s+\d{4}/)?.[0];
  if (!month) return undefined;
  const date = new Date(`${month.replace(".", "")} UTC`);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function parseCount(value: string): number | undefined {
  const match = value
    .replace(/,/g, "")
    .match(/([\d.]+)(?:\s*([kKmM])(?![a-zA-Z]))?/);
  if (!match) return undefined;
  const count = Number(match[1]);
  if (match[2]?.toLowerCase() === "k") return count * 1_000;
  if (match[2]?.toLowerCase() === "m") return count * 1_000_000;
  return count;
}

function normalizeIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

function parseModalities(value: string | undefined): string[] | undefined {
  if (!value) return undefined;
  const modalities = value
    .toLowerCase()
    .split(/,|\band\b/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => part.replace(/\s+tokens?$/, ""));
  return modalities.length > 0 ? modalities : undefined;
}

function parseBulletValues(markdown: string): string[] | undefined {
  const values = [...markdown.matchAll(/^[-*]\s+`?([^`\n]+)`?\s*$/gm)]
    .map((match) => cleanCell(match[1]))
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function formatUnit(value: string | undefined): string {
  if (!value) return "";
  const unit = cleanCell(value).replace(/^\$[\d,.]+\s*\/?\s*/i, "");
  if (!unit || unit === "-") return "";
  if (/^per\s/i.test(unit)) return unit;
  return `Per ${unit}`;
}

function mergeSection(
  sections: PricingSectionEntry[],
  incoming: PricingSectionEntry,
): void {
  const existing = sections.find((section) => section.label === incoming.label);
  if (!existing) {
    sections.push({
      ...incoming,
      columns: [...incoming.columns],
      rows: incoming.rows.map((row) => ({ ...row, values: [...row.values] })),
    });
    return;
  }

  const columns = [...existing.columns];
  for (const column of incoming.columns) {
    if (!columns.includes(column)) columns.push(column);
  }
  const remap = (
    row: { label: string; values: (number | null)[] },
    source: string[],
  ) => columns.map((column) => row.values[source.indexOf(column)] ?? null);

  existing.rows = existing.rows.map((row) => ({
    ...row,
    values: remap(row, existing.columns),
  }));
  for (const incomingRow of incoming.rows) {
    const row = existing.rows.find(
      (candidate) => candidate.label === incomingRow.label,
    );
    const values = remap(incomingRow, incoming.columns);
    if (!row) {
      existing.rows.push({ label: incomingRow.label, values });
      continue;
    }
    row.values = row.values.map((value, index) => value ?? values[index]);
  }
  existing.columns = columns;
  if (!existing.unit) existing.unit = incoming.unit;
}

function cloneSections(
  sections: PricingSectionEntry[] | undefined,
): PricingSectionEntry[] {
  return (sections ?? []).map((section) => ({
    ...section,
    columns: [...section.columns],
    rows: section.rows.map((row) => ({ ...row, values: [...row.values] })),
  }));
}

function metricPricingSection(
  label: string,
  table: MarkdownTable,
): PricingSectionEntry | undefined {
  const metricIndex = table.headers.findIndex(
    (header) => header.toLowerCase() === "metric",
  );
  const priceIndex = table.headers.findIndex(
    (header) => header.toLowerCase() === "price",
  );
  const unitIndex = table.headers.findIndex(
    (header) => header.toLowerCase() === "unit",
  );
  if (metricIndex < 0 || priceIndex < 0) return undefined;

  const quality = table.rows.find(
    (row) => row[metricIndex]?.toLowerCase() === "quality",
  );
  const unit = formatUnit(quality?.[unitIndex] ?? table.rows[0]?.[unitIndex]);
  if (quality) {
    const metrics = table.rows.filter(
      (row) => row[metricIndex]?.toLowerCase() !== "quality",
    );
    return {
      label,
      unit,
      columns: ["Quality", ...metrics.map((row) => row[metricIndex])],
      rows: [
        {
          label: quality[priceIndex],
          values: [null, ...metrics.map((row) => parsePrice(row[priceIndex]))],
        },
      ],
    };
  }

  return {
    label,
    unit,
    columns: table.rows.map((row) => row[metricIndex]),
    rows: [
      {
        label: "Standard",
        values: table.rows.map((row) => parsePrice(row[priceIndex])),
      },
    ],
  };
}

function parseModelPricing(markdown: string): PricingSectionEntry[] {
  const lines = section(markdown, "Pricing").split("\n");
  const sections: PricingSectionEntry[] = [];
  let label = "Pricing";

  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^###\s+(.+)$/);
    if (heading) {
      label = cleanCell(heading[1]);
      continue;
    }
    const table = parseTable(lines, index);
    if (!table) continue;
    index = table.end - 1;
    const parsed = metricPricingSection(label, table);
    if (parsed) mergeSection(sections, parsed);
  }

  return sections;
}

function parseEndpoints(markdown: string): string[] | undefined {
  const lines = section(markdown, "Endpoints").split("\n");
  for (let index = 0; index < lines.length; index++) {
    const table = parseTable(lines, index);
    if (!table) continue;
    const endpointIndex = table.headers.findIndex(
      (header) => header.toLowerCase() === "endpoint",
    );
    const supportIndex = table.headers.findIndex(
      (header) => header.toLowerCase() === "support",
    );
    if (endpointIndex < 0 || supportIndex < 0) continue;
    const endpoints = table.rows
      .filter((row) => /^supported$/i.test(row[supportIndex] ?? ""))
      .map((row) => {
        const name = row[endpointIndex].toLowerCase();
        return ENDPOINT_NAMES[name] ?? normalizeIdentifier(name);
      });
    return endpoints.length > 0 ? endpoints : undefined;
  }
  return undefined;
}

function parseRatings(
  html: string,
): Pick<CompareEntry, "performance" | "latency"> {
  const text = html
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&[^;]+;/g, " ")
    .replace(/\s+/g, " ");
  const match = text.match(
    new RegExp(
      `\\b(?:Reasoning|Intelligence)\\s+(${Object.keys(PERFORMANCE_RATINGS).join("|")})\\s+Speed\\s+(${Object.keys(SPEED_RATINGS).join("|")})\\s+Price\\b`,
      "i",
    ),
  );
  if (!match) return {};
  return {
    performance: PERFORMANCE_RATINGS[match[1].toLowerCase()],
    latency: SPEED_RATINGS[match[2].toLowerCase()],
  };
}

function parseDescription(markdown: string): string | undefined {
  const id = /Model ID:\s*`[^`]+`\s*\n([\s\S]*?)(?=^##\s+)/m.exec(markdown);
  if (!id) return undefined;
  const paragraphs = id[1]
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) =>
      paragraph
        .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
        .replace(/\n/g, " ")
        .trim(),
    )
    .filter((paragraph) => paragraph && !paragraph.startsWith("-"));
  return paragraphs[0];
}

export function parseCatalog(markdown: string): Map<string, DetailEntry> {
  const catalog = new Map<string, DetailEntry>();
  const links =
    /^[-*]\s+\[([^\]]+)]\(\/api\/docs\/models\/([^)]+)\.md\):\s*(.+)$/gm;
  let match: RegExpExecArray | null;
  while ((match = links.exec(markdown)) !== null) {
    const [, display_name, slug, tagline] = match;
    if (catalog.has(slug)) continue;
    catalog.set(slug, {
      name: slug,
      slug,
      display_name: cleanCell(display_name),
      tagline: cleanCell(tagline),
    });
  }
  return catalog;
}

export function parseDeprecations(
  markdown: string,
): Map<string, DeprecationEntry> {
  const deprecations = new Map<string, DeprecationEntry>();
  const lines = markdown.split("\n");
  let deprecation_date: string | undefined;

  for (let index = 0; index < lines.length; index++) {
    const heading = lines[index].match(/^###\s+(\d{4}-\d{2}-\d{2}):/);
    if (heading) {
      deprecation_date = heading[1];
      continue;
    }
    if (/^#{1,3}\s+/.test(lines[index])) {
      deprecation_date = undefined;
      continue;
    }
    if (!deprecation_date) continue;
    const tableStart = index;
    const table = parseTable(lines, index);
    if (!table) continue;
    index = table.end - 1;

    const modelIndex = table.headers.findIndex((header) =>
      /(?:model|snapshot)/i.test(header),
    );
    const shutdownIndex = table.headers.findIndex((header) =>
      /shutdown date/i.test(header),
    );
    const replacementIndex = table.headers.findIndex((header) =>
      /(?:recommended replacement|substitute model)/i.test(header),
    );
    if (modelIndex < 0 || shutdownIndex < 0) continue;
    const family = /family/i.test(table.headers[modelIndex]);

    for (const [rowIndex, row] of table.rows.entries()) {
      const rawCells = lines[tableStart + rowIndex + 2]
        .trim()
        .slice(1, -1)
        .split(/(?<!\\)\|/)
        .map((cell) => cell.replace(/\\\|/g, "|").trim());
      const ids = [...(rawCells[modelIndex] ?? "").matchAll(/`([^`]+)`/g)].map(
        (match) => match[1].trim(),
      );
      const successor = [
        ...(rawCells[replacementIndex] ?? "").matchAll(/`([^`]+)`/g),
      ][0]?.[1]?.trim();
      const retirement_date = parseDate(row[shutdownIndex] ?? "");
      for (const id of ids) {
        if (deprecations.has(id)) continue;
        deprecations.set(id, {
          id,
          deprecation_date,
          retirement_date,
          successor,
          family,
        });
      }
    }
  }

  return deprecations;
}

export function parsePricingSections(markdown: string): ModelPricingSections {
  const map: ModelPricingSections = new Map();
  const lines = markdown.split("\n");

  const pricingName = (value: string | undefined): string | undefined => {
    if (!value || /\(data sharing\)/i.test(value)) return undefined;
    return value.replace(/\s*\([^)]*\)\s*$/, "").trim();
  };
  const tierBefore = (index: number): string => {
    for (let offset = index - 1; offset >= Math.max(0, index - 12); offset--) {
      const heading = lines[offset].match(
        /^###\s+(Standard|Batch|Flex|Fast) pricing data$/i,
      );
      if (heading) return heading[1] === "Fast" ? "Fast" : heading[1];
      const label = lines[offset]
        .trim()
        .match(/^(Standard|Batch|Flex|Fast mode)$/i);
      if (label) return label[1].replace(/ mode$/i, "");
    }
    return "Standard";
  };
  const add = (name: string, section: PricingSectionEntry) => {
    const sections = map.get(name) ?? [];
    mergeSection(sections, section);
    map.set(name, sections);
  };

  for (let index = 0; index < lines.length; index++) {
    const tableStart = index;
    const table = parseTable(lines, index);
    if (!table) continue;
    index = table.end - 1;
    const tier = tierBefore(tableStart);
    const modelIndex = table.headers.findIndex(
      (header) => header.toLowerCase() === "model",
    );
    if (modelIndex < 0) continue;

    if (table.headers.includes("Short context input")) {
      const columns = table.headers
        .slice(modelIndex + 1)
        .filter((header) => header.startsWith("Short context"))
        .map((header) => {
          const suffix = header.replace(/^Short context\s+/i, "").toLowerCase();
          return suffix[0].toUpperCase() + suffix.slice(1);
        });
      for (const row of table.rows) {
        const name = pricingName(row[modelIndex]);
        if (!name) continue;
        const values = table.headers
          .map((header, position) => ({ header, value: row[position] }))
          .filter(({ header }) => header.startsWith("Short context"))
          .map(({ value }) => parsePrice(value));
        add(name, {
          label: "Text tokens",
          unit: "Per 1M tokens",
          columns,
          rows: [{ label: tier, values }],
        });
      }
      continue;
    }

    const trainingIndex = table.headers.findIndex(
      (header) => header.toLowerCase() === "training",
    );
    if (trainingIndex >= 0) {
      const columns = ["Training", "Input", "Cached input", "Output"];
      const columnIndexes = columns.map((column) =>
        table.headers.findIndex(
          (header) => header.toLowerCase() === column.toLowerCase(),
        ),
      );
      for (const row of table.rows) {
        const name = pricingName(row[modelIndex]);
        if (!name) continue;
        add(name, {
          label: "Fine-tuning",
          unit: "",
          columns,
          rows: [
            {
              label: tier,
              values: columnIndexes.map((column) =>
                column < 0 ? null : parsePrice(row[column]),
              ),
            },
          ],
        });
      }
      continue;
    }

    const modalityIndex = table.headers.findIndex(
      (header) => header.toLowerCase() === "modality",
    );
    if (modalityIndex < 0) continue;
    const columns = ["Input", "Cached input", "Output"];
    const columnIndexes = columns.map((column) =>
      table.headers.findIndex((header) =>
        header.toLowerCase().startsWith(column.toLowerCase()),
      ),
    );
    for (const row of table.rows) {
      const name = pricingName(row[modelIndex]);
      const modality = row[modalityIndex]?.trim();
      if (!name || !modality) continue;
      add(name, {
        label: `${modality[0].toUpperCase()}${modality.slice(1).toLowerCase()} tokens`,
        unit: "Per 1M tokens",
        columns,
        rows: [
          {
            label: tier,
            values: columnIndexes.map((column) =>
              column < 0 ? null : parsePrice(row[column]),
            ),
          },
        ],
      });
    }
  }

  return map;
}

export function pricingFromSections(
  name: string,
  sections: PricingSectionEntry[],
): PricingEntry | undefined {
  const text = sections.find((section) => section.label === "Text tokens");
  if (!text) return undefined;
  const prices = (label: string): Record<string, number> => {
    const row = text.rows.find((candidate) => candidate.label === label);
    if (!row) return {};
    return Object.fromEntries(
      text.columns.flatMap((column, index) => {
        const value = row.values[index];
        return value == null
          ? []
          : [[normalizeIdentifier(column), value] as [string, number]];
      }),
    );
  };
  return { name, main: prices("Standard"), batch: prices("Batch") };
}

export function parsePricing(markdown: string): Map<string, PricingEntry> {
  const pricing = new Map<string, PricingEntry>();
  for (const [name, sections] of parsePricingSections(markdown)) {
    const entry = pricingFromSections(name, sections);
    if (entry) pricing.set(name, entry);
  }
  return pricing;
}

export function mergePricingSections(
  primary: PricingSectionEntry[] | undefined,
  additional: PricingSectionEntry[] | undefined,
): PricingSectionEntry[] {
  const merged = cloneSections(primary);
  for (const section of additional ?? []) mergeSection(merged, section);
  return merged;
}

export function parseModelPage(
  markdown: string,
  html: string,
  slug: string,
): ModelPageEntry {
  const name = /Model ID:\s*`([^`]+)`/.exec(markdown)?.[1] ?? slug;
  const display_name = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim();
  const tagline = [...markdown.matchAll(/^>\s+(.+)$/gm)]
    .map((match) => cleanCell(match[1]))
    .find((value) => !value.startsWith("For the complete documentation index"));
  const details = section(markdown, "Model details");
  const detailLines = details.split("\n");
  const detailValue = (prefix: string) =>
    detailLines
      .find((line) => line.startsWith(`- ${prefix}`))
      ?.slice(prefix.length + 2)
      .trim();
  const context = detailLines.find((line) => /context window$/i.test(line));
  const maxInput = detailValue("Maximum input tokens:");
  const maxOutput = detailLines.find((line) =>
    /max output tokens$/i.test(line),
  );
  const cutoff = detailLines.find((line) => /knowledge cutoff$/i.test(line));
  const input = parseModalities(detailValue("Input modalities:"));
  const output = parseModalities(detailValue("Output modalities:"));
  const snapshots = parseBulletValues(section(markdown, "Snapshots"));
  const features = parseBulletValues(section(markdown, "Supported features"));
  const tools = parseBulletValues(section(markdown, "Supported tools"))?.map(
    normalizeIdentifier,
  );
  const endpoints = parseEndpoints(markdown);
  const cutoffDate = cutoff?.match(/[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}/)?.[0];
  const ratings = parseRatings(html);

  return {
    detail: {
      name,
      slug,
      display_name,
      description: parseDescription(markdown),
      tagline,
      supported_tools: tools,
      deprecated: /\bthis model is deprecated\b/i.test(markdown),
      current_snapshot: detailValue("Default snapshot:")?.replace(/`/g, ""),
      snapshots,
    },
    compare: {
      name,
      context_window: parseCount(context ?? ""),
      max_input_tokens: parseCount(maxInput ?? ""),
      max_output_tokens: parseCount(maxOutput ?? ""),
      modalities: input && output ? { input, output } : undefined,
      knowledge_cutoff: cutoffDate ? new Date(`${cutoffDate} UTC`) : undefined,
      supported_features: features?.map(normalizeIdentifier),
      supported_endpoints: endpoints,
      reasoning_tokens: detailLines.some((line) =>
        /Reasoning token support/i.test(line),
      ),
      ...ratings,
    },
    pricing: parseModelPricing(markdown),
  };
}
