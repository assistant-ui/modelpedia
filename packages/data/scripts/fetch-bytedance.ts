import { fetchText } from "./parse.ts";
import { enrichEntry } from "./provider-fetch-utils.ts";
import {
  type ModelEntry,
  readSources,
  runGenerate,
  sanitizeModelId,
  upsertModel,
} from "./shared.ts";

type LocalizedText = string | { en?: string };

interface SeedCard {
  title?: LocalizedText;
  description?: LocalizedText;
  links?: { learnMore?: LocalizedText };
}

interface ParsedSeedCard {
  title: string;
  description: string;
  pageUrl: string;
}

const sources = readSources("bytedance");

function englishText(value?: LocalizedText): string | undefined {
  const text = typeof value === "string" ? value : value?.en;
  return text?.trim() || undefined;
}

function parseRouterData(html: string, modelsUrl: string): ParsedSeedCard[] {
  const match = html.match(
    /window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})<\/script>/,
  );
  if (!match) throw new Error("Could not find ByteDance Seed router data");
  const data = JSON.parse(match[1]);
  const page = data.loaderData?.["(locale$)/models/page"] as
    | Record<string, unknown>
    | undefined;
  if (!page) throw new Error("Could not find ByteDance Seed model cards");

  // Every card section is a model list except heroMediaCards, which are
  // feature highlights of the hero model.
  const cards = [
    page.heroCard as SeedCard | undefined,
    ...Object.entries(page)
      .filter(
        ([key, value]) =>
          key.endsWith("Cards") &&
          key !== "heroMediaCards" &&
          Array.isArray(value),
      )
      .flatMap(([, value]) => value as SeedCard[]),
  ];
  const models = new Map<string, ParsedSeedCard>();

  for (const card of cards) {
    const title = englishText(card?.title);
    const description = englishText(card?.description);
    const learnMore = englishText(card?.links?.learnMore);
    if (!title || !description || !learnMore) {
      throw new Error("Could not parse ByteDance Seed model card");
    }
    const id = idFromTitle(title);
    if (!models.has(id)) {
      models.set(id, {
        title,
        description,
        pageUrl: new URL(learnMore.replace(/^\//, ""), modelsUrl).href,
      });
    }
  }

  if (models.size === 0) {
    throw new Error("Could not find ByteDance Seed model cards");
  }
  return [...models.values()];
}

function idFromTitle(title: string) {
  return sanitizeModelId(
    title
      .replace(/[()]/g, "")
      .replace(/（/g, "-")
      .replace(/）/g, "")
      .replace(/\s+/g, "-"),
  );
}

function inferSeedType(title: string): ModelEntry["model_type"] {
  const lower = title.toLowerCase();
  if (lower.includes("seedance")) return "video";
  if (lower.includes("seedream") || lower.includes("seededit")) return "image";
  if (lower.includes("voice") || lower.includes("interpret")) return "audio";
  if (lower.includes("music")) return "audio";
  if (lower.includes("diffusion")) return "code";
  if (
    lower.includes("3d") ||
    lower.includes("protenix") ||
    lower.includes("gr-")
  )
    return "other";
  return "chat";
}

async function main() {
  console.log("Fetching ByteDance Seed models page...");
  const html = await fetchText(sources.models as string);
  const cards = parseRouterData(html, sources.models as string);
  console.log(`Parsed ${cards.length} models from ByteDance Seed`);

  let written = 0;
  for (const card of cards) {
    const { title, description } = card;
    const modelType = inferSeedType(title);
    const entry = enrichEntry(
      {
        id: idFromTitle(title),
        name: title,
        created_by: "bytedance",
        model_type: modelType,
        page_url: card.pageUrl,
        status: "active",
      },
      { description, modelTypeHint: title },
    );
    written += upsertModel("bytedance", entry) ? 1 : 0;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
