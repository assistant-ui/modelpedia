import {
  inferFamily,
  inferParameters,
  type ModelEntry,
  normalizeDate,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";
import { fetchWithRetry } from "./parse.ts";

/**
 * Fetch OpenCode Console and Go models from their public docs and model lists.
 * No API key needed.
 *
 * Extracts:
 *   - model name + ID from endpoints table
 *   - pricing (input, output, cached_read, cached_write) from pricing table
 *   - deprecation dates from deprecated models table
 *   - parameters via inferParameters
 */

const sources = readSources("opencode");

const CREATOR_MAP: Record<string, string> = {
  gpt: "openai",
  claude: "anthropic",
  gemini: "google",
  minimax: "minimax",
  glm: "zai",
  kimi: "moonshot",
  mimo: "xiaomi",
  nemotron: "nvidia",
  qwen: "qwen",
  deepseek: "deepseek",
  grok: "xai",
  mistral: "mistral",
  muse: "meta",
  step: "stepfun",
  "big-pickle": "opencode",
};

function extractCreator(id: string): string {
  for (const [prefix, creator] of Object.entries(CREATOR_MAP)) {
    if (id.startsWith(prefix)) return creator;
  }
  return "unknown";
}

interface PricingInfo {
  input?: number;
  output?: number;
  cached_input?: number;
  cache_write?: number;
}

function parseDollar(s: string): number | undefined {
  if (s.toLowerCase() === "free") return 0;
  const matches = [...s.matchAll(/\$([\d.]+)/g)];
  return matches.length ? Number(matches.at(-1)![1]) : undefined;
}

async function main() {
  console.log("Fetching OpenCode Console and Go models...");

  const urls = [
    sources.docs,
    sources.go_docs,
    sources.models,
    sources.go_models,
  ] as string[];
  const responses = await Promise.all(
    urls.map((url, i) =>
      fetchWithRetry(
        url,
        i < 2 ? { headers: { Accept: "text/markdown" } } : undefined,
      ),
    ),
  );
  for (const res of responses) {
    if (!res.ok) throw new Error(`Failed: ${res.status} ${res.url}`);
  }
  const [consoleMd, goMd] = await Promise.all(
    responses.slice(0, 2).map((res) => res.text()),
  );
  const lists = (await Promise.all(
    responses.slice(2).map((res) => res.json()),
  )) as {
    data: { id: string }[];
  }[];

  const models = new Map<string, string>();
  const pricing: Map<string, PricingInfo> = new Map();
  const pricingTiers = new Map<
    string,
    { label: string; info: PricingInfo }[]
  >();
  const deprecatedDates = new Map<string, string>();
  const priceRows: string[][] = [];
  const deprecatedRows: string[][] = [];

  for (const md of [consoleMd, goMd]) {
    let section = "";
    for (const line of md.split("\n")) {
      const heading = line.match(/^#{2,3} (.+)/)?.[1].toLowerCase();
      if (heading) {
        section =
          heading === "endpoints"
            ? "endpoints"
            : heading === "pricing"
              ? "pricing"
              : heading.startsWith("deprecated") || heading.startsWith("sunset")
                ? "deprecated"
                : "";
      }
      if (!line.startsWith("|")) continue;
      const cells = line
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.replace(/`/g, "").trim());
      if (cells.length < 2 || cells[0] === "Model" || cells[0].startsWith("-"))
        continue;
      if (section === "endpoints" && /^[a-z0-9][a-z0-9.-]*$/.test(cells[1])) {
        if (!models.has(cells[1])) models.set(cells[1], cells[0]);
      } else if (section === "pricing") {
        priceRows.push(cells);
      } else if (section === "deprecated") {
        deprecatedRows.push(cells);
      }
    }
  }

  for (const list of lists) {
    if (!Array.isArray(list.data))
      throw new Error("Invalid OpenCode model list");
    for (const { id } of list.data) {
      if (!models.has(id)) models.set(id, id);
    }
  }

  for (const cells of priceRows) {
    const label = cells[0].replace(/ \((?:[≤>].*tokens|\d+% off)\)$/, "");
    const model = [...models].find(
      ([id, name]) => name === label || id === label,
    );
    const id =
      model?.[0] ??
      [...models.keys()].find(
        (id) =>
          id.toLowerCase() === label.toLowerCase().replace(/[^a-z0-9.]+/g, "-"),
      );
    if (!id) continue;
    if (models.get(id) === id) models.set(id, label);
    const info: PricingInfo = {
      input: parseDollar(cells[1] ?? ""),
      output: parseDollar(cells[2] ?? ""),
      cached_input: parseDollar(cells[3] ?? ""),
      cache_write: parseDollar(cells[4] ?? ""),
    };
    if (!pricing.has(id)) pricing.set(id, info);
    const tier = cells[0].match(/ \(([≤>].*tokens)\)$/)?.[1];
    if (tier) {
      const rows = pricingTiers.get(id) ?? [];
      rows.push({ label: tier, info });
      pricingTiers.set(id, rows);
    }
  }

  for (const cells of deprecatedRows) {
    const model = [...models].find(
      ([id, name]) => name === cells[0] || id === cells[0],
    );
    if (model) deprecatedDates.set(model[0], cells[1]);
  }

  console.log(
    `Parsed ${models.size} models, ${pricing.size} with pricing, ${deprecatedDates.size} deprecated`,
  );

  let written = 0;
  for (const [id, name] of models) {
    const p = pricing.get(id);
    const params = inferParameters(id);
    const isDeprecated = deprecatedDates.has(id);
    const deprecationDateRaw = deprecatedDates.get(id);
    const deprecationDate = deprecationDateRaw
      ? normalizeDate(deprecationDateRaw)
      : undefined;

    const entry: ModelEntry = {
      id,
      name,
      created_by: extractCreator(id),
      family: inferFamily(id),
      status: isDeprecated ? "deprecated" : "active",
      deprecation_date: deprecationDate ?? undefined,
      capabilities: { streaming: true },
      parameters: params?.parameters,
      active_parameters: params?.active_parameters,
    };

    if (p) {
      const pricingData: Record<string, number> = {};
      if (p.input != null) pricingData.input = p.input;
      if (p.output != null) pricingData.output = p.output;
      if (p.cached_input != null) pricingData.cached_input = p.cached_input;
      if (p.cache_write != null) pricingData.cache_write = p.cache_write;
      const tiers = pricingTiers.get(id);
      if (tiers?.length) {
        entry.pricing = {
          ...pricingData,
          tiers: [
            {
              label: "Context length",
              unit: "Per 1M tokens",
              columns: ["Input", "Output", "Cached Read", "Cached Write"],
              rows: tiers.map(({ label, info }) => ({
                label,
                values: [
                  info.input ?? null,
                  info.output ?? null,
                  info.cached_input ?? null,
                  info.cache_write ?? null,
                ],
              })),
            },
          ],
        };
      } else if (Object.keys(pricingData).length > 0) {
        entry.pricing = pricingData;
      }
    }

    written += upsertWithSnapshot("opencode", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
