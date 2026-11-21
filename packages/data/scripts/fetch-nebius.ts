import { fetchJson, pMap } from "./parse.ts";
import {
  capabilitiesFromParameters,
  createdByFromModelId,
  dateOnly,
  displayNameFromId,
  enrichEntry,
  tokenPricing,
} from "./provider-fetch-utils.ts";
import {
  filterModalities,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Nebius Token Factory has no key-free catalog, so the catalog is built from
 * the endpoints OpenRouter lists for Nebius as a provider.
 */

interface OpenRouterModel {
  id: string;
}

interface OpenRouterEndpoint {
  provider_name: string;
  context_length?: number;
  quantization?: string | null;
  max_completion_tokens?: number | null;
  pricing?: {
    prompt?: string;
    completion?: string;
    input_cache_read?: string;
  };
  supported_parameters?: string[];
}

interface OpenRouterEndpoints {
  data?: {
    id: string;
    name?: string;
    created?: number;
    description?: string;
    architecture?: {
      modality?: string;
      input_modalities?: string[];
      output_modalities?: string[];
      tokenizer?: string;
    };
    endpoints?: OpenRouterEndpoint[];
  };
}

const sources = readSources("nebius");
const PROVIDER_NAME = "Nebius";

function modelTypeFromArchitecture(
  arch: NonNullable<OpenRouterEndpoints["data"]>["architecture"],
): ModelEntry["model_type"] | undefined {
  const [inputs, outputs] = (arch?.modality ?? "").toLowerCase().split("->");
  const output = arch?.output_modalities ?? (outputs ? outputs.split("+") : []);
  const input = arch?.input_modalities ?? (inputs ? inputs.split("+") : []);
  if (output.includes("embeddings") || output.includes("embedding"))
    return "embed";
  if (output.includes("video")) return "video";
  if (output.includes("image")) return "image";
  if (output.includes("audio")) return "tts";
  if (output.includes("text") && input.includes("audio") && input.length === 1)
    return "transcription";
  if (output.includes("text") && input.includes("text")) return "chat";
  return undefined;
}

function modalitiesFromArchitecture(
  arch: NonNullable<OpenRouterEndpoints["data"]>["architecture"],
) {
  const input = arch?.input_modalities;
  const output = arch?.output_modalities;
  if (!input?.length || !output?.length) return undefined;
  const result = filterModalities(input, output);
  return result.input.length && result.output.length ? result : undefined;
}

function compareEndpoints(a: OpenRouterEndpoint, b: OpenRouterEndpoint) {
  const price = (e: OpenRouterEndpoint) =>
    Number(e.pricing?.prompt ?? Number.POSITIVE_INFINITY);
  return (
    price(a) - price(b) ||
    (a.quantization ?? "").localeCompare(b.quantization ?? "") ||
    (a.context_length ?? 0) - (b.context_length ?? 0)
  );
}

class EndpointFetchError extends Error {}

async function fetchEndpoints(id: string) {
  const url = (sources.endpoints as string).replace("{id}", id);
  try {
    return (await fetchJson<OpenRouterEndpoints>(url)).data;
  } catch (err) {
    console.error(`nebius: endpoint fetch failed for ${id}: ${err}`);
    throw new EndpointFetchError(id);
  }
}

async function main() {
  console.log("Fetching OpenRouter model list...");
  const list = await fetchJson<{ data: OpenRouterModel[] }>(
    sources.models as string,
  );
  const ids = list.data.map((m) => m.id);
  console.log(`Checking ${ids.length} models for a Nebius endpoint...`);
  if (ids.length === 0) {
    throw new Error("nebius: OpenRouter returned 0 models");
  }

  const failed: string[] = [];
  const results = await pMap(
    ids,
    (id) =>
      fetchEndpoints(id).catch((err) => {
        if (!(err instanceof EndpointFetchError)) throw err;
        failed.push(id);
        return undefined;
      }),
    6,
  );
  if (failed.length > 0) {
    throw new Error(
      `nebius: ${failed.length} endpoint fetches failed (${failed.join(", ")}); refusing a partial catalog`,
    );
  }

  let written = 0;
  let found = 0;
  for (const model of results) {
    const endpoint = model?.endpoints
      ?.filter((e) => e.provider_name === PROVIDER_NAME)
      .sort(compareEndpoints)[0];
    if (!model || !endpoint) continue;
    found++;

    const entry = enrichEntry(
      {
        id: model.id,
        name: model.name ?? displayNameFromId(model.id),
        created_by: createdByFromModelId(model.id, "nebius"),
        release_date: dateOnly(model.created),
        context_window: endpoint.context_length,
        max_output_tokens: endpoint.max_completion_tokens ?? undefined,
        status: "active",
        model_type: modelTypeFromArchitecture(model.architecture),
        modalities: modalitiesFromArchitecture(model.architecture),
        pricing: tokenPricing(
          endpoint.pricing?.prompt,
          endpoint.pricing?.completion,
          endpoint.pricing?.input_cache_read,
        ),
        capabilities: capabilitiesFromParameters(endpoint.supported_parameters),
      },
      {
        description: model.description,
        modelTypeHint: model.architecture?.modality,
      },
    );
    if (endpoint.quantization && endpoint.quantization !== "unknown") {
      entry.quantization = endpoint.quantization;
    }
    if (model.architecture?.tokenizer) {
      entry.tokenizer = model.architecture.tokenizer;
    }
    written += upsertModel("nebius", entry) ? 1 : 0;
  }

  console.log(`Found ${found} Nebius models, wrote ${written}`);
  if (found === 0) {
    throw new Error(
      "nebius: no OpenRouter model lists a Nebius endpoint (response shape changed?)",
    );
  }
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
