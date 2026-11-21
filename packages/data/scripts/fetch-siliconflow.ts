import { fetchText, pMap, snapBinaryTokens } from "./parse.ts";
import {
  assertParsed,
  buildPricing,
  inferFamily,
  type ModelEntry,
  normalizeDate,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";
import { createdByFromModelId, enrichEntry } from "./provider-fetch-utils.ts";

/**
 * SiliconFlow has no key-free model API. The public catalog at siliconflow.com
 * links one server-rendered page per model with the real API id, USD pricing,
 * context window, parameter counts and feature flags. Category pages share the
 * same URL shape but carry no API id, so they are skipped.
 */

const CATALOG_URL = readSources("siliconflow").models as string;

const LABELS = new Set([
  "Create on",
  "License",
  "Provider",
  "HuggingFace",
  "State",
  "Architecture",
  "Calibrated",
  "Total Parameters",
  "Activated Parameters",
  "Precision",
  "Context length",
  "Max Tokens",
  "Serverless",
  "Support image input",
  "JSON Mode",
  "Structured Outputs",
  "Tools",
  "Embeddings",
  "Rerankers",
]);

const CREATORS: Record<string, string> = {
  minimaxai: "minimax",
  "wan-ai": "alibaba",
  "tongyi-mai": "alibaba",
  tencent: "tencent",
};

const PER_UNIT: Record<string, { label: string; unit: string }> = {
  Image: { label: "Image generation", unit: "Per image" },
  Video: { label: "Video generation", unit: "Per video" },
  "M UTF-8 bytes": { label: "Speech synthesis", unit: "Per 1M UTF-8 bytes" },
};

function pageLines(html: string): string[] {
  return html
    .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replaceAll("&amp;", "&")
    .replaceAll("&nbsp;", " ")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function parseCount(
  value: string | undefined,
  unit: "K" | "B",
): number | undefined {
  const match = value?.match(/^([\d.]+)([KMBT])$/);
  if (!match) return undefined;
  const scale: Record<string, number> = {
    K: 1_000,
    M: 1_000_000,
    B: 1_000_000_000,
    T: 1_000_000_000_000,
  };
  const count = Number(match[1]) * scale[match[2]];
  if (unit === "B") return count / 1_000_000_000;
  const binary = snapBinaryTokens(count);
  if (binary !== count) return binary;
  const kibi = Math.round(count / 1024) * 1024;
  return Math.abs(kibi - count) / count < 0.005 ? kibi : count;
}

function priceAfter(lines: string[], label: string) {
  const at = lines.indexOf(label);
  if (at < 0 || lines[at + 1] !== "$") return undefined;
  const value = Number(lines[at + 2]);
  if (!Number.isFinite(value)) return undefined;
  return { value, unit: lines[at + 3]?.replace(/^\/\s*/, "") };
}

function parseModel(slug: string, html: string): ModelEntry | undefined {
  const lines = pageLines(html);
  const about = lines.findIndex((line) => line.startsWith("About "));
  if (about < 0) return undefined;
  const name = lines[about].slice("About ".length);
  const header = lines.slice(Math.max(0, about - 12), about);
  const id = header.findLast((line) => /^[\w.-]+\/[\w.-]+$/.test(line));
  if (!id) return undefined;

  const serverless = lines.indexOf("Available Serverless", about);
  const description =
    serverless > about + 1 ? lines.slice(about + 1, serverless).join(" ") : "";
  const end = lines.findIndex(
    (line, i) =>
      i > about &&
      (line.startsWith("Compare with") ||
        line === "EXAMPLE" ||
        line === "Get Started"),
  );
  const spec = lines.slice(about, end > about ? end : undefined);
  const fields: Record<string, string> = {};
  spec.forEach((line, i) => {
    if (!LABELS.has(line) || line in fields) return;
    const next = spec[i + 1];
    fields[line] = next !== undefined && !LABELS.has(next) ? next : "";
  });

  const flag = (label: string) => fields[label] === "Supported";
  const inputPrice = priceAfter(spec, "Input Price");
  const outputPrice = priceAfter(spec, "Output Price");
  const cachePrice = priceAfter(spec, "Cache Read");
  const flatPrice = priceAfter(spec, "Price");
  const per = flatPrice?.unit ? PER_UNIT[flatPrice.unit] : undefined;

  const modelType: ModelEntry["model_type"] = flag("Embeddings")
    ? "embed"
    : flag("Rerankers")
      ? "rerank"
      : flatPrice?.unit === "Image"
        ? "image"
        : flatPrice?.unit === "Video"
          ? "video"
          : flatPrice?.unit === "M UTF-8 bytes"
            ? "tts"
            : "chat";
  const tokenModel = modelType === "chat";

  const pricing = per
    ? buildPricing({
        tiers: [
          {
            label: per.label,
            unit: per.unit,
            columns: ["Price"],
            rows: [{ label: "Standard", values: [flatPrice!.value] }],
          },
        ],
      })
    : buildPricing({
        input: inputPrice?.value,
        output: outputPrice?.value,
        cached_input: cachePrice?.value,
      });

  const owner = id.split("/")[0].toLowerCase();
  const total = parseCount(fields["Total Parameters"], "B");
  const active = parseCount(fields["Activated Parameters"], "B");
  const contextWindow = parseCount(fields["Context length"], "K");
  const maxOutput = parseCount(fields["Max Tokens"], "K");
  const releaseDate = normalizeDate(fields["Create on"]);
  const license =
    fields.License && fields.License !== "-" ? fields.License : "";
  const imageInput = flag("Support image input");
  const editsImages = modelType === "image" && /edit|kontext/i.test(id);

  const entry = enrichEntry(
    {
      id,
      name,
      created_by:
        CREATORS[owner] ??
        createdByFromModelId(`${owner}/${slug}`, "siliconflow"),
      family: inferFamily(id.split("/")[1]),
      page_url: `${CATALOG_URL}/${slug}`,
      status: "active",
      model_type: modelType,
      ...(license ? { license } : {}),
      ...(releaseDate ? { release_date: releaseDate } : {}),
      ...(total ? { parameters: total } : {}),
      ...(total && active && active < total
        ? { active_parameters: active }
        : {}),
      ...(contextWindow && contextWindow > 0
        ? { context_window: contextWindow }
        : {}),
      ...(maxOutput && tokenModel ? { max_output_tokens: maxOutput } : {}),
      ...(pricing ? { pricing } : {}),
      ...(tokenModel
        ? {
            capabilities: {
              vision: imageInput,
              tool_call: flag("Tools"),
              json_mode: flag("JSON Mode"),
              structured_output: flag("Structured Outputs"),
            },
            modalities: {
              input: imageInput ? ["text", "image"] : ["text"],
              output: ["text"],
            },
          }
        : {}),
      ...(editsImages
        ? { modalities: { input: ["text", "image"], output: ["image"] } }
        : {}),
    },
    { description },
  );
  if (!tokenModel) delete entry.capabilities;
  return entry;
}

async function main() {
  console.log("Fetching SiliconFlow model catalog...");
  const catalog = await fetchText(CATALOG_URL);
  const slugs = [
    ...new Set(
      [...catalog.matchAll(/href="\.\/models\/([a-z0-9][a-z0-9.-]*)"/g)].map(
        (match) => match[1],
      ),
    ),
  ];
  console.log(`Found ${slugs.length} catalog links`);

  const pages = await pMap(
    slugs,
    async (slug) => parseModel(slug, await fetchText(`${CATALOG_URL}/${slug}`)),
    6,
  );
  const models = pages.filter((model) => model != null);
  console.log(`Parsed ${models.length} models`);
  assertParsed(models.length, "siliconflow");

  let written = 0;
  for (const model of models) {
    if (upsertModel("siliconflow", model)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
