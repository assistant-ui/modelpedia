import { fetchText } from "./parse.ts";
import {
  createdByFromModelId,
  displayNameFromId,
  enrichEntry,
  fetchJsonWithOptionalBearer,
} from "./provider-fetch-utils.ts";
import {
  envOrNull,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

interface ReplicateApiModel {
  owner: string;
  name: string;
  description?: string;
  visibility?: string;
  url?: string;
  github_url?: string;
  paper_url?: string;
  license_url?: string;
}

interface ReplicateResponse {
  results: ReplicateApiModel[];
  next?: string | null;
}

const sources = readSources("replicate");

function inferType(id: string): ModelEntry["model_type"] | undefined {
  const lower = id.toLowerCase();
  if (
    /(flux|image|sdxl|stable-diffusion|upscale|remove-bg|face-swap|ideogram|nano-banana)/.test(
      lower,
    )
  )
    return "image";
  if (/(video|veo|kling|wan-|seedance|runway|luma)/.test(lower)) return "video";
  if (/(whisper|transcribe|speech-to-text|diarization)/.test(lower))
    return "transcription";
  if (/(tts|music|audio|voice)/.test(lower)) return "audio";
  if (/(llama|gpt|claude|gemini|grok|deepseek)/.test(lower)) return "chat";
  return undefined;
}

async function fetchApiModels(token: string) {
  const models: ReplicateApiModel[] = [];
  let url: string | null = sources.api as string;
  while (url) {
    const json = await fetchJsonWithOptionalBearer<ReplicateResponse>(
      url,
      token,
    );
    models.push(...(json.results ?? []));
    url = json.next ?? null;
  }
  return models.map((model) => ({
    id: `${model.owner}/${model.name}`,
    name: model.name,
    description: model.description,
    page_url: model.url ?? `https://replicate.com/${model.owner}/${model.name}`,
    github_url: model.github_url,
    paper_url: model.paper_url,
    license_url: model.license_url,
  }));
}

async function fetchExploreModels() {
  const html = await fetchText(sources.explore as string);
  const ids = [
    ...new Set(
      [...html.matchAll(/href="\/([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)"/g)]
        .map((m) => m[1])
        .filter((id) => !id.startsWith("collections/")),
    ),
  ];
  return ids.map((id) => ({
    id,
    name: displayNameFromId(id),
    page_url: `https://replicate.com/${id}`,
  }));
}

async function main() {
  const token = envOrNull("REPLICATE_API_TOKEN", "REPLICATE_API_KEY");
  const models = token
    ? await fetchApiModels(token)
    : await fetchExploreModels();

  console.log(`Parsed ${models.length} Replicate models`);

  let written = 0;
  for (const model of models) {
    const entry = enrichEntry(
      {
        id: model.id,
        name: model.name,
        created_by: createdByFromModelId(model.id, "replicate"),
        status: "active",
        model_type: inferType(model.id),
        page_url: model.page_url,
      },
      {
        description: model.description,
        modelTypeHint: model.id,
      },
    );
    if (model.github_url) entry.github_url = model.github_url;
    if (model.paper_url) entry.paper_url = model.paper_url;
    if (model.license_url) entry.license_url = model.license_url;
    written += upsertModel("replicate", entry) ? 1 : 0;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
