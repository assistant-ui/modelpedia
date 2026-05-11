import {
  createdByFromModelId,
  dateOnly,
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

interface SiliconFlowModel {
  id: string;
  object?: string;
  created?: number;
  owned_by?: string;
}

const sources = readSources("siliconflow");

const SUB_TYPES: [string, ModelEntry["model_type"]][] = [
  ["chat", "chat"],
  ["embedding", "embed"],
  ["reranker", "rerank"],
  ["text-to-image", "image"],
  ["image-to-image", "image"],
  ["speech-to-text", "transcription"],
  ["text-to-video", "video"],
];

async function fetchSubType(token: string, subType: string) {
  const url = new URL(sources.models as string);
  url.searchParams.set("sub_type", subType);
  const json = await fetchJsonWithOptionalBearer<{ data: SiliconFlowModel[] }>(
    url.toString(),
    token,
  );
  return json.data ?? [];
}

async function main() {
  const token = envOrNull("SILICONFLOW_API_KEY", "SILICONCLOUD_API_KEY");
  if (!token) {
    console.warn("Missing SILICONFLOW_API_KEY — skipping official model fetch");
    runGenerate();
    return;
  }

  console.log("Fetching SiliconFlow models from official API...");
  const byId = new Map<string, ModelEntry>();
  for (const [subType, type] of SUB_TYPES) {
    const models = await fetchSubType(token, subType);
    for (const model of models) {
      byId.set(
        model.id,
        enrichEntry(
          {
            id: model.id,
            name: displayNameFromId(model.id),
            created_by: createdByFromModelId(model.id, "siliconflow"),
            release_date: dateOnly(model.created),
            model_type: type,
            status: "active",
          },
          { modelTypeHint: subType },
        ),
      );
    }
  }

  let written = 0;
  for (const entry of byId.values()) {
    written += upsertModel("siliconflow", entry) ? 1 : 0;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
