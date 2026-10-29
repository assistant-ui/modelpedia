import { fetchText } from "./parse.ts";
import type { Modality } from "../src/types.ts";
import {
  assertParsed,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

const sources = readSources("minimax");
const PRICING_MD = sources.pricing as string;
const MODELS_MD = sources.models as string;
const CATALOG_MD = "https://platform.minimax.io/docs/faq/models.md";

function toId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}

function parseDollar(cell: string | undefined): number | undefined {
  const prices = [...(cell ?? "").matchAll(/\$([\d.]+)/g)];
  return prices.length ? Number(prices[prices.length - 1][1]) : undefined;
}

interface ModelSpec {
  context_window?: number;
  description?: string;
}

function parseModelSpecs(md: string): Map<string, ModelSpec> {
  const specs = new Map<string, ModelSpec>();
  const table = md.split("## Supported Models")[1]?.split("\n## ")[0] ?? "";

  for (const line of table.split("\n")) {
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length < 5 || !/^MiniMax-/.test(cells[1])) continue;
    const context = Number(cells[2].replace(/,/g, ""));
    specs.set(toId(cells[1]), {
      ...(context > 0 ? { context_window: context } : {}),
      description: cells[3].replace(/\*\*/g, "").replace(/\.\s*$/, ""),
    });
  }

  return specs;
}

function parseTokenPricing(md: string): Map<string, ModelEntry["pricing"]> {
  const prices = new Map<string, ModelEntry["pricing"]>();
  const llm = md.split("## LLM")[1]?.split("\n## Video")[0] ?? "";

  for (const line of llm.split("\n")) {
    const name = line.match(/^\|\s*\*\*(MiniMax-[^*]+)\*\*/)?.[1];
    if (!name) continue;
    const id = toId(name);
    if (prices.has(id)) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const input = parseDollar(cells[2]);
    const output = parseDollar(cells[3]);
    const cachedRead = parseDollar(cells[4]);
    if (input == null || output == null) continue;
    prices.set(id, {
      input,
      output,
      ...(cachedRead != null ? { cached_input: cachedRead } : {}),
    });
  }

  return prices;
}

interface CatalogModel {
  name: string;
  description?: string;
  model_type: "chat" | "video" | "audio" | "image";
}

function parseCatalog(md: string, pricingMd: string): CatalogModel[] {
  const available =
    md.split("## Available Models")[1]?.split("\n## Retired Models")[0] ?? "";
  const models = new Map<string, CatalogModel>();
  let modelType: CatalogModel["model_type"] | undefined;

  for (const line of available.split("\n")) {
    const heading = line.match(/^### (.+)$/)?.[1];
    if (heading) {
      modelType =
        heading === "LLM"
          ? "chat"
          : heading === "Video Models"
            ? "video"
            : heading === "Speech Models"
              ? "audio"
              : heading === "Image Models"
                ? "image"
                : undefined;
    }
    const row = line.match(/^\|\s*\[([^\]]+)\]\([^)]+\)\s*\|\s*(.*?)\s*\|$/);
    if (!row || !modelType) continue;
    models.set(toId(row[1]), {
      name: row[1],
      description: row[2].replace(/\.\s*$/, ""),
      model_type: modelType,
    });
  }

  const videoPricing =
    pricingMd.split("## Video")[1]?.split("\n## Audio")[0] ?? "";
  for (const line of videoPricing.split("\n")) {
    const name = line.match(/<td[^>]*>\*\*(MiniMax-H3[^*]+)\*\*/)?.[1];
    if (name && !models.has(toId(name))) {
      models.set(toId(name), { name, model_type: "video" });
    }
  }

  return [...models.values()];
}

async function main() {
  console.log("Fetching MiniMax models from docs...");
  const [pricingMd, modelsMd, catalogMd] = await Promise.all([
    fetchText(PRICING_MD),
    fetchText(MODELS_MD),
    fetchText(CATALOG_MD),
  ]);

  const catalog = parseCatalog(catalogMd, pricingMd);
  assertParsed(catalog.length, "MiniMax model catalog");
  const specs = parseModelSpecs(modelsMd);
  const prices = parseTokenPricing(pricingMd);
  for (const model of catalog) {
    if (model.model_type === "chat" && !prices.has(toId(model.name))) {
      throw new Error(`MiniMax pricing missing for ${model.name}`);
    }
  }
  let written = 0;

  for (const model of catalog) {
    const id = toId(model.name);
    const spec = specs.get(id);
    const input: Modality[] =
      model.model_type === "chat"
        ? ["text", "image", "video"]
        : model.model_type === "video"
          ? id.startsWith("minimax-h3")
            ? ["text", "image", "video", "audio"]
            : ["text", "image"]
          : model.model_type === "audio"
            ? ["text"]
            : ["text", "image"];
    const output: Modality =
      model.model_type === "chat"
        ? "text"
        : model.model_type === "audio"
          ? "audio"
          : model.model_type;
    const entry: ModelEntry = {
      id,
      name: model.name,
      family: "minimax",
      description: spec?.description ?? model.description,
      context_window: spec?.context_window,
      status: "active",
      model_type: model.model_type,
      modalities: { input, output: [output] },
      ...(model.model_type === "chat"
        ? { capabilities: { streaming: true, tool_call: true } }
        : {
            capabilities: {
              streaming: model.model_type === "audio",
              tool_call: false,
            },
          }),
      ...(model.model_type === "chat"
        ? { pricing: prices.get(id) }
        : model.model_type === "video"
          ? { pricing: { input: null, output: null } }
          : {}),
    };
    written += upsertWithSnapshot("minimax", entry);
  }

  console.log(`Parsed ${catalog.length} models; wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
