import {
  assertParsed,
  inferFamily,
  readSources,
  runGenerate,
  upsertWithSnapshot,
  type ModelEntry,
} from "./shared.ts";
import { fetchText } from "./parse.ts";
import { displayNameFromId } from "./provider-fetch-utils.ts";

const sources = readSources("perplexity");
const DOCS_MD = sources.docs as string;
const PRICING_MD = new URL(
  "/docs/getting-started/pricing.md",
  DOCS_MD,
).toString();
const SONAR_MD = new URL(
  "/docs/agent-api/migrate-from-sonar/overview.md",
  DOCS_MD,
).toString();

const GROUP_MAP: Record<string, string> = {
  "z.ai": "zai",
  deepseek: "deepseek",
  "moonshot ai": "moonshot",
  nvidia: "nvidia",
  perplexity: "perplexity",
};

function amount(cell: string): number | undefined {
  const match = cell.match(/^\\?\$?\s*([\d.]+)/);
  return match ? Number(match[1]) : undefined;
}

function modelName(id: string, docsCell: string | undefined): string {
  const label = docsCell?.match(/^\[([^\]]+)\]\([^)]+\)$/)?.[1];
  const words = (text: string) => text.toLowerCase().match(/[a-z]+|\d+/g) ?? [];
  const variant = id.split("/").pop() ?? id;
  if (label && words(label).join("|") === words(variant).join("|")) {
    return label;
  }
  return displayNameFromId(id);
}

function parseAgentModels(md: string): ModelEntry[] {
  const models: ModelEntry[] = [];
  let group = "";

  for (const line of md.split("\n")) {
    const heading = line.match(/^\*\*([^*]+)\*\*$/);
    if (heading) group = heading[1].toLowerCase();

    const id = line.match(/^\|\s*`([^`]+)`\s*\|/)?.[1];
    if (!id) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const input = amount(cells[2]);
    const output = amount(cells[3]);
    if (input == null || output == null) continue;

    const discount = cells[4].match(/^(\d+(?:\.\d+)?)% off input/i);
    const cached = discount
      ? Math.round(input * (1 - Number(discount[1]) / 100) * 1e6) / 1e6
      : amount(cells[4]);
    const name = modelName(id, cells[6]);
    const prefix = id.split("/")[0];
    const tiered = [
      ["Input", cells[2]],
      ["Output", cells[3]],
    ]
      .filter(([, cell]) => /\)\s+\d/.test(cell))
      .map(([label, cell]) => `${label}: ${cell}`);

    models.push({
      id,
      name,
      created_by:
        prefix === "perplexity" ? (GROUP_MAP[group] ?? prefix) : prefix,
      family: inferFamily(id),
      license: "proprietary",
      capabilities: { streaming: true },
      pricing: {
        input,
        output,
        ...(cached != null ? { cached_input: cached } : {}),
      },
      ...(tiered.length > 0
        ? { pricing_notes: [`${tiered.join("; ")} per 1M tokens.`] }
        : {}),
    });
  }

  return models;
}

function parseOtherModels(md: string): ModelEntry[] {
  const models: ModelEntry[] = [];

  for (const line of md.split("\n")) {
    const id = line.match(/^\|\s*`([^`]+)`\s*\|/)?.[1];
    if (!id) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const embed = id.startsWith("pplx-embed-");
    const decider = id.startsWith("pplx-decider-");
    if (!embed && !decider) continue;
    const input = amount(cells[embed ? 3 : 2]);
    if (input == null) continue;

    models.push({
      id,
      name: id,
      created_by: "perplexity",
      family: inferFamily(id),
      license: "proprietary",
      model_type: embed ? "embed" : "other",
      pricing: { input },
    });
  }

  return models;
}

function parseSonar(md: string): ModelEntry[] {
  const ids = new Set(
    [...md.matchAll(/\bmodel\s*[=:]\s*["'](sonar[\w.-]*)["']/g)].map(
      (match) => match[1],
    ),
  );
  return [...ids].map((id) => ({
    id,
    name: id,
    created_by: "perplexity",
    family: "sonar",
    license: "proprietary",
    capabilities: { streaming: true, tool_call: true },
  }));
}

async function main() {
  console.log("Fetching Perplexity models...");

  const [agentMd, pricingMd, sonarMd] = await Promise.all([
    fetchText(DOCS_MD),
    fetchText(PRICING_MD),
    fetchText(SONAR_MD),
  ]);
  const models = [
    ...parseAgentModels(agentMd),
    ...parseOtherModels(pricingMd),
    ...parseSonar(sonarMd),
  ];
  const unique = new Map(models.map((model) => [model.id, model]));
  console.log(`Found ${unique.size} models from docs`);
  assertParsed(unique.size, "perplexity");

  const names = new Map<string, ModelEntry[]>();
  for (const model of unique.values()) {
    const key = model.name.toLowerCase();
    const matches = names.get(key) ?? [];
    matches.push(model);
    names.set(key, matches);
  }
  for (const matches of names.values()) {
    if (matches.length > 1) {
      for (const model of matches) model.name = model.id;
    }
  }
  const uniqueNames = new Set(
    [...unique.values()].map((model) => model.name.toLowerCase()),
  );
  if (uniqueNames.size !== unique.size) {
    throw new Error("Perplexity model names are not unique");
  }

  let written = 0;
  for (const model of unique.values()) {
    written += upsertWithSnapshot("perplexity", model);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
