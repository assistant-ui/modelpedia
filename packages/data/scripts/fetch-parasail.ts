import {
  createdByFromModelId,
  dateOnly,
  displayNameFromId,
  enrichEntry,
  fetchJsonWithOptionalBearer,
} from "./provider-fetch-utils.ts";
import { envOrNull, readSources, runGenerate, upsertModel } from "./shared.ts";

interface ParasailModel {
  id: string;
  name?: string;
  created?: number;
  object?: string;
  owned_by?: string;
  context_length?: number;
  max_completion_tokens?: number;
}

const sources = readSources("parasail");

function normalizeResponse(json: unknown): ParasailModel[] {
  if (Array.isArray(json)) return json as ParasailModel[];
  if (json && typeof json === "object") {
    const record = json as Record<string, unknown>;
    if (Array.isArray(record.data)) return record.data as ParasailModel[];
    if (Array.isArray(record.models)) return record.models as ParasailModel[];
  }
  return [];
}

async function main() {
  const token = envOrNull("PARASAIL_API_KEY");
  if (!token) {
    console.warn(
      "No PARASAIL_API_KEY and no key-free public model list for Parasail; skipping. Set PARASAIL_API_KEY locally to fetch.",
    );
    return;
  }

  console.log("Fetching Parasail models from official API...");
  const json = await fetchJsonWithOptionalBearer<unknown>(
    sources.models as string,
    token,
  );
  const models = normalizeResponse(json);
  console.log(`Got ${models.length} Parasail models`);

  let written = 0;
  for (const model of models) {
    const entry = enrichEntry(
      {
        id: model.id,
        name: model.name ?? displayNameFromId(model.id),
        created_by: createdByFromModelId(model.id, "parasail"),
        release_date: dateOnly(model.created),
        context_window: model.context_length,
        max_output_tokens: model.max_completion_tokens,
        status: "active",
      },
      { modelTypeHint: model.id },
    );
    written += upsertModel("parasail", entry) ? 1 : 0;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
