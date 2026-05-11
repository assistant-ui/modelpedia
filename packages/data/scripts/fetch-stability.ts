import { fetchJson } from "./parse.ts";
import {
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

interface HuggingFaceModel {
  modelId: string;
  pipeline_tag?: string;
  createdAt?: string;
  lastModified?: string;
  downloads?: number;
  tags?: string[];
}

const sources = readSources("stability");

const PIPELINE_TYPE: Record<string, ModelEntry["model_type"]> = {
  "text-to-image": "image",
  "image-to-image": "image",
  "image-to-video": "video",
  "text-to-video": "video",
  "text-to-audio": "audio",
  "text-generation": "chat",
};

function licenseFromTags(tags: string[]) {
  const tag = tags.find((item) => item.startsWith("license:"));
  return tag?.replace(/^license:/, "").toLowerCase();
}

async function main() {
  console.log("Fetching Stability AI Hugging Face models...");
  const models = await fetchJson<HuggingFaceModel[]>(
    sources.huggingface as string,
  );
  console.log(`Got ${models.length} Stability AI models from Hugging Face`);

  let written = 0;
  for (const model of models) {
    const tags = model.tags ?? [];
    const downloads = model.downloads;
    const type =
      PIPELINE_TYPE[model.pipeline_tag ?? ""] ??
      (model.modelId.includes("vae") ? "other" : undefined);
    const entry = enrichEntry(
      {
        id: model.modelId.replace(/^stabilityai\//, ""),
        name: displayNameFromId(model.modelId),
        created_by: "stability",
        release_date: dateOnly(model.createdAt),
        page_url: `https://huggingface.co/${model.modelId}`,
        status: "active",
        model_type: type,
        license: licenseFromTags(tags),
        open_weight: true,
      },
      {
        description: `${displayNameFromId(model.modelId)} is a Stability AI model published on the official Stability AI Hugging Face organization.`,
        modelTypeHint: `${model.pipeline_tag ?? ""} ${tags.join(" ")}`,
      },
    );
    if (downloads != null) entry.huggingface_downloads = downloads;
    if (model.lastModified) entry.last_modified = dateOnly(model.lastModified);
    written += upsertModel("stability", entry) ? 1 : 0;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
