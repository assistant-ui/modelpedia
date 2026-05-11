import {
  createdByFromModelId,
  dateOnly,
  displayNameFromId,
  enrichEntry,
  modelTypeFromCategory,
} from "./provider-fetch-utils.ts";
import {
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

interface FalModel {
  endpoint_id: string;
  metadata?: {
    display_name?: string;
    category?: string;
    description?: string;
    status?: string;
    tags?: string[];
    updated_at?: string;
    model_url?: string;
    date?: string;
    kind?: string;
    stream_url?: string;
  };
}

interface FalResponse {
  models: FalModel[];
  next_cursor?: string;
  has_more?: boolean;
}

const sources = readSources("fal");

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchFalPage(url: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(url);
      if (res.ok) return (await res.json()) as FalResponse;
      if (res.status !== 429) {
        throw new Error(`Fetch failed: ${res.status} ${url}`);
      }
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter)
        ? retryAfter * 1000
        : 750 * (attempt + 1);
      console.warn(`fal rate limited; retrying in ${waitMs}ms`);
      await sleep(waitMs);
    } catch (err) {
      if (attempt === 4) throw err;
      const waitMs = 750 * (attempt + 1);
      console.warn(`fal fetch failed; retrying in ${waitMs}ms`);
      await sleep(waitMs);
    }
  }
  throw new Error(`Fetch failed after retries: ${url}`);
}

async function fetchAllModels() {
  const models: FalModel[] = [];
  let cursor: string | undefined;
  const seenCursors = new Set<string>();

  for (;;) {
    const url = new URL(sources.models as string);
    if (cursor) url.searchParams.set("cursor", cursor);
    const json = await fetchFalPage(url.toString());
    models.push(...(json.models ?? []));
    if (!json.has_more || !json.next_cursor) break;
    if (seenCursors.has(json.next_cursor)) break;
    seenCursors.add(json.next_cursor);
    cursor = json.next_cursor;
    await sleep(250);
  }

  return models;
}

async function main() {
  console.log("Fetching fal models...");
  const models = await fetchAllModels();
  console.log(`Got ${models.length} models from fal`);

  let written = 0;
  for (const model of models) {
    const meta = model.metadata ?? {};
    const type = modelTypeFromCategory(
      meta.category,
    ) as ModelEntry["model_type"];
    const hint = `${meta.category ?? ""} ${(meta.tags ?? []).join(" ")}`;
    const entry = enrichEntry(
      {
        id: model.endpoint_id,
        name: meta.display_name ?? displayNameFromId(model.endpoint_id),
        created_by: createdByFromModelId(model.endpoint_id, "fal"),
        status: meta.status === "active" || !meta.status ? "active" : "preview",
        release_date: dateOnly(meta.date),
        model_type: type,
        page_url: meta.model_url,
        capabilities: meta.stream_url ? { streaming: true } : undefined,
      },
      { description: meta.description, modelTypeHint: hint },
    );
    if (meta.updated_at) entry.last_seen_at = dateOnly(meta.updated_at);
    written += upsertModel("fal", entry) ? 1 : 0;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
