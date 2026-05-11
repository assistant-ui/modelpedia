import { fetchJson } from "./parse.ts";
import { toPerMillion } from "./provider-fetch-utils.ts";
import {
  buildPricing,
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

interface AI21Model {
  id: string;
  name?: string;
  updated?: string;
  context_length?: number;
  max_completion_tokens?: number;
  quantization?: string;
  pricing?: {
    prompt?: string;
    completion?: string;
  };
}

const sources = readSources("ai21");

async function main() {
  console.log("Fetching AI21 models...");
  const json = await fetchJson<{ data: AI21Model[] }>(sources.models as string);

  let written = 0;
  for (const model of json.data ?? []) {
    const entry: ModelEntry = {
      id: model.id,
      name: model.name?.replace(/^AI21:\s*/i, "") ?? model.id,
      created_by: "ai21",
      family: inferFamily(model.id),
      release_date: model.updated,
      context_window: model.context_length,
      max_output_tokens: model.max_completion_tokens,
      model_type: "chat",
      modalities: { input: ["text"], output: ["text"] },
      capabilities: { streaming: true },
      endpoints: ["chat_completions"],
      pricing: buildPricing({
        input: toPerMillion(model.pricing?.prompt),
        output: toPerMillion(model.pricing?.completion),
      }),
    };
    if (model.quantization) entry.quantization = model.quantization;
    written += upsertWithSnapshot("ai21", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
