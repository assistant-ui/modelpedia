import {
  capabilitiesFromParameters,
  createdByFromModelId,
  dateOnly,
  displayNameFromId,
  enrichEntry,
  fetchJsonWithOptionalBearer,
  tokenPricing,
} from "./provider-fetch-utils.ts";
import {
  envOrNull,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

interface NebiusModel {
  id: string;
  name?: string;
  created?: number;
  description?: string;
  context_length?: number;
  quantization?: string;
  architecture?: {
    modality?: string;
    tokenizer?: string;
  };
  pricing?: {
    prompt?: string;
    completion?: string;
    image?: string;
    price_per_video_second?: string;
    request?: string;
  };
  supported_sampling_parameters?: string[];
  object?: string;
  owned_by?: string;
}

const sources = readSources("nebius");

function modelTypeFromModality(
  modality: string | undefined,
): ModelEntry["model_type"] | undefined {
  const value = (modality ?? "").toLowerCase();
  if (value.includes("text->image")) return "image";
  if (value.includes("text->video") || value.includes("image->video"))
    return "video";
  if (value.includes("text->embedding")) return "embed";
  if (value.includes("text->text")) return "chat";
  return undefined;
}

async function main() {
  const token = envOrNull("NEBIUS_API_KEY", "NEBIUS_TOKEN");
  if (!token) {
    console.warn(
      "No NEBIUS_API_KEY and no key-free public model list for Nebius; skipping. Set NEBIUS_API_KEY locally to fetch.",
    );
    return;
  }

  console.log("Fetching Nebius Token Factory models from official API...");
  const json = await fetchJsonWithOptionalBearer<{ data: NebiusModel[] }>(
    sources.models as string,
    token,
  );
  const models = json.data ?? [];
  console.log(`Got ${models.length} Nebius models`);
  if (models.length === 0) {
    throw new Error("nebius: API returned 0 models (response shape changed?)");
  }

  let written = 0;
  for (const model of models) {
    const modelType = modelTypeFromModality(model.architecture?.modality);
    const entry = enrichEntry(
      {
        id: model.id,
        name: model.name ?? displayNameFromId(model.id),
        created_by: createdByFromModelId(model.id, "nebius"),
        release_date: dateOnly(model.created),
        context_window: model.context_length,
        status: "active",
        model_type: modelType,
        pricing: tokenPricing(model.pricing?.prompt, model.pricing?.completion),
        capabilities: capabilitiesFromParameters(
          model.supported_sampling_parameters,
        ),
      },
      {
        description: model.description,
        modelTypeHint: model.architecture?.modality,
      },
    );
    if (model.quantization) entry.quantization = model.quantization;
    if (model.architecture?.tokenizer) {
      entry.tokenizer = model.architecture.tokenizer;
    }
    written += upsertModel("nebius", entry) ? 1 : 0;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
