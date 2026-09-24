import { fetchText, parseMdTable, stripHtml } from "./parse.ts";
import {
  assertParsed,
  buildPricing,
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

const sources = readSources("ai21");

interface DocumentationModel {
  name: string;
  apiEndpoint?: string;
  version?: string;
  contextWindow?: number;
  parameters?: number;
  activeParameters?: number;
}

interface DeprecatedModel {
  id: string;
  name: string;
  deprecationDate: string;
}

function section(markdown: string, heading: string): string {
  return (
    markdown.match(
      new RegExp(
        `^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s|^#\\s|(?![\\s\\S]))`,
        "m",
      ),
    )?.[1] ?? ""
  );
}

function tokenCount(value: string): number | undefined {
  const match = value.match(/(\d+(?:\.\d+)?)\s*[kK]\b/);
  return match ? Number(match[1]) * 1_000 : undefined;
}

function modelSize(value: string): {
  parameters?: number;
  activeParameters?: number;
} {
  const text = stripHtml(value);
  const parameters = text.match(/(\d+(?:\.\d+)?)\s*B\s+parameters/i);
  const activeParameters = text.match(/(\d+(?:\.\d+)?)\s*B\s+active/i);
  return {
    parameters: parameters ? Number(parameters[1]) : undefined,
    activeParameters: activeParameters
      ? Number(activeParameters[1])
      : undefined,
  };
}

function parseModels(markdown: string): DocumentationModel[] {
  return parseMdTable(section(markdown, "Model Details")).map((row) => {
    const size = modelSize(row["Model Size"] ?? "");
    const apiEndpoint = (row["API Endpoint"] ?? "").replace(/`/g, "").trim();
    return {
      name: row.Model?.trim() ?? "",
      apiEndpoint: apiEndpoint === "N/A" ? undefined : apiEndpoint,
      version: row.Version?.trim(),
      contextWindow: tokenCount(row["Max Tokens"] ?? ""),
      ...size,
    };
  });
}

function parseVersions(markdown: string): Map<string, string> {
  const versions = new Map<string, string>();
  for (const match of section(markdown, "API Versioning").matchAll(
    /`([^`]+)`\s+currently points to\s+`([^`]+)`/g,
  )) {
    versions.set(match[1], match[2]);
  }
  return versions;
}

function parseDeprecations(markdown: string): DeprecatedModel[] {
  return parseMdTable(section(markdown, "Model Deprecation"))
    .map((row) => ({
      id: (row["API Endpoint"] ?? "").replace(/`/g, "").trim(),
      name: row.Model?.trim() ?? "",
      deprecationDate: row["Deprecation Date"]?.trim() ?? "",
    }))
    .filter((model) => model.id && model.name && model.deprecationDate);
}

function parsePricing(
  html: string,
): Map<string, { input: number; output: number }> {
  const pricing = new Map<string, { input: number; output: number }>();
  const text = stripHtml(html);
  for (const match of text.matchAll(
    /Jamba\s+(Mini|Large)[\s\S]{0,500}?\$([\d.]+)\s*\/\s*1M input tokens[\s\S]{0,100}?\$([\d.]+)\s*\/\s*1M output tokens/gi,
  )) {
    pricing.set(`jamba-${match[1].toLowerCase()}`, {
      input: Number(match[2]),
      output: Number(match[3]),
    });
  }
  return pricing;
}

async function main() {
  console.log("Fetching AI21 models from docs...");
  const documentation = await fetchText(sources.docs as string);
  const models = parseModels(documentation);
  console.log(`Parsed ${models.length} models from docs`);
  assertParsed(models.length, "ai21");

  const pricingHtml = await fetchText(sources.pricing as string);
  const versions = parseVersions(documentation);
  const pricing = parsePricing(pricingHtml);
  const deprecated = parseDeprecations(documentation);

  const activeModels: {
    model: DocumentationModel;
    id: string;
    price: { input: number; output: number };
  }[] = [];
  for (const model of models) {
    if (!model.apiEndpoint) {
      console.log(`Skipping ${model.name}: no API endpoint`);
      continue;
    }

    const id = versions.get(model.apiEndpoint);
    if (!id) {
      console.log(`Skipping ${model.apiEndpoint}: no snapshot mapping`);
      continue;
    }

    const price = pricing.get(model.apiEndpoint);
    if (!price) {
      throw new Error(`No pricing found for ${model.apiEndpoint}`);
    }

    activeModels.push({ model, id, price });
  }
  console.log(`Parsed ${activeModels.length} API models`);
  assertParsed(activeModels.length, "ai21 (API models)");

  let written = 0;
  for (const { model, id, price } of activeModels) {
    const entry: ModelEntry = {
      id,
      name: model.version ? `${model.name} ${model.version}` : model.name,
      created_by: "ai21",
      family: inferFamily(id),
      context_window: model.contextWindow,
      parameters: model.parameters,
      active_parameters: model.activeParameters,
      model_type: "chat",
      modalities: { input: ["text"], output: ["text"] },
      capabilities: { streaming: true },
      endpoints: ["chat_completions"],
      pricing: buildPricing(price),
    };
    written += upsertModel("ai21", { ...entry, alias: model.apiEndpoint })
      ? 1
      : 0;
    written += upsertModel("ai21", {
      ...entry,
      id: model.apiEndpoint,
      name: model.name,
      snapshots: [id],
    })
      ? 1
      : 0;
  }

  for (const model of deprecated) {
    const entry: ModelEntry = {
      id: model.id,
      name: model.name,
      created_by: "ai21",
      family: inferFamily(model.id),
      status: "deprecated",
      deprecation_date: model.deprecationDate,
    };
    written += upsertModel("ai21", entry) ? 1 : 0;
  }

  console.log(`Parsed ${deprecated.length} deprecated models`);
  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
