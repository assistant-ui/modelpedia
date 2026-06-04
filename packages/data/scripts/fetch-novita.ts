import { fetchJson } from "./parse.ts";
import {
  createdByFromModelId,
  dateOnly,
  displayNameFromId,
  enrichEntry,
} from "./provider-fetch-utils.ts";
import {
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

interface NovitaModel {
  id: string;
  title?: string;
  display_name?: string;
  description?: string;
  created?: number;
  context_size?: number;
  max_output_tokens?: number;
  model_type?: string;
  input_token_price_per_m?: number;
  output_token_price_per_m?: number;
  status?: number;
  tags?: string[];
  features?: string[];
}

const sources = readSources("novita");

function novitaPrice(value: number | undefined) {
  if (value == null || value <= 0) return undefined;
  return Math.round((value / 10_000) * 1000) / 1000;
}

/** Drop non-positive token counts; the API reports 0 for proxy models with no fixed window. */
function positiveOrUndef(value: number | undefined): number | undefined {
  return typeof value === "number" && value > 0 ? value : undefined;
}

function modelType(type: string | undefined): ModelEntry["model_type"] {
  const value = (type ?? "").toLowerCase();
  if (value.includes("embed")) return "embed";
  if (value.includes("rerank")) return "rerank";
  if (value.includes("image")) return "image";
  if (value.includes("video")) return "video";
  if (value.includes("audio")) return "audio";
  return "chat";
}

async function main() {
  console.log("Fetching Novita AI models...");
  const json = await fetchJson<{ data: NovitaModel[] }>(
    sources.models as string,
  );

  let written = 0;
  for (const model of json.data ?? []) {
    const type = modelType(model.model_type);
    const hint = `${model.model_type ?? ""} ${(model.tags ?? []).join(" ")} ${(model.features ?? []).join(" ")}`;
    const entry = enrichEntry(
      {
        id: model.id,
        name: model.display_name ?? model.title ?? displayNameFromId(model.id),
        created_by: createdByFromModelId(model.id, "novita"),
        release_date: dateOnly(model.created),
        context_window: positiveOrUndef(model.context_size),
        max_output_tokens: positiveOrUndef(model.max_output_tokens),
        status:
          model.status === 1 || model.status == null ? "active" : "preview",
        model_type: type,
        pricing: {
          input: novitaPrice(model.input_token_price_per_m),
          output: novitaPrice(model.output_token_price_per_m),
        },
      },
      { description: model.description, modelTypeHint: hint },
    );

    if (!entry.pricing?.input && !entry.pricing?.output) delete entry.pricing;
    written += upsertModel("novita", entry) ? 1 : 0;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
