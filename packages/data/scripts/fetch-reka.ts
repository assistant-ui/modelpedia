import { fetchText, stripHtml } from "./parse.ts";
import {
  assertParsed,
  inferFamily,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

const CATALOG_URL = readSources("reka").models as string;

const HOSTED_CREATORS: [RegExp, string][] = [
  [/^deepseek/, "deepseek"],
  [/^glm/, "zai"],
  [/^qwen/, "qwen"],
];

function parsePrice(
  card: string,
  kind: "input" | "output" | "cached",
): number | undefined {
  const match = card.match(
    new RegExp(`\\$([\\d.]+)\\/M ${kind}(?: tokens)?<\\/span>`),
  );
  return match ? Number(match[1]) : undefined;
}

function parseContext(card: string): number | undefined {
  const match = card.match(
    /class="mlist-headline">([\d.]+)([kM])(?:<!-- -->)? context<\/span>/,
  );
  if (!match) return undefined;
  const approximate = Number(match[1]) * (match[2] === "M" ? 1_000_000 : 1_000);
  const binary = 2 ** Math.round(Math.log2(approximate));
  // The catalog rounds binary limits for display, including 262k for 262,144 tokens.
  return Math.abs(binary - approximate) / approximate < 0.05
    ? binary
    : approximate;
}

function parseCatalog(html: string): ModelEntry[] {
  const models: ModelEntry[] = [];

  for (const [, card] of html.matchAll(
    /<li class="mlist-card">([\s\S]*?)<\/li>/g,
  )) {
    const id = card.match(/class="mlist-id"><code>([^<]+)<\/code>/)?.[1];
    if (!id) continue;

    const label = card
      .match(/class="mlist-name">[\s\S]*?<\/span>([^<]+)<\/span>/)?.[1]
      ?.trim();
    const description = card.match(
      /<p class="mlist-blurb">([\s\S]*?)<\/p>/,
    )?.[1];
    const features = new Set(
      [...card.matchAll(/class="mlist-feature-label">([^<]+)<\/span>/g)].map(
        (match) => match[1],
      ),
    );
    const contextWindow = parseContext(card);
    const maxOutput = card.match(/<span>([\d,]+) max output<\/span>/)?.[1];
    const input = parsePrice(card, "input");
    const output = parsePrice(card, "output");
    const cachedInput = parsePrice(card, "cached");

    models.push({
      id,
      name: label || id,
      created_by:
        HOSTED_CREATORS.find(([pattern]) => pattern.test(id))?.[1] ?? "reka",
      family: inferFamily(id),
      page_url: `${CATALOG_URL}/${encodeURIComponent(id)}`,
      status: "active",
      model_type: features.has("Reasoning") ? "reasoning" : "chat",
      ...(description ? { description: stripHtml(description) } : {}),
      ...(contextWindow ? { context_window: contextWindow } : {}),
      ...(maxOutput
        ? { max_output_tokens: Number(maxOutput.replaceAll(",", "")) }
        : {}),
      capabilities: {
        streaming: features.has("Streaming"),
        tool_call: features.has("Tool calling"),
        structured_output: features.has("Structured outputs"),
        reasoning: features.has("Reasoning"),
        vision: features.has("Image input"),
      },
      modalities: {
        input: features.has("Image input") ? ["text", "image"] : ["text"],
        output: ["text"],
      },
      endpoints: ["chat_completions"],
      pricing: {
        ...(input != null ? { input } : {}),
        ...(output != null ? { output } : {}),
        ...(cachedInput != null ? { cached_input: cachedInput } : {}),
      },
    });
  }

  return models;
}

async function main() {
  console.log("Fetching Reka AI models...");
  const models = parseCatalog(await fetchText(CATALOG_URL));
  console.log(`Parsed ${models.length} models from Reka catalog`);
  assertParsed(models.length, "reka");

  let written = 0;
  for (const model of models) {
    if (upsertModel("reka", model)) written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
