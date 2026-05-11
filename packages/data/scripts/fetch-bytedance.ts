import { fetchText } from "./parse.ts";
import { enrichEntry } from "./provider-fetch-utils.ts";
import {
  type ModelEntry,
  readSources,
  runGenerate,
  sanitizeModelId,
  upsertModel,
} from "./shared.ts";

interface SeedCard {
  title: string;
  description?: string;
  link?: string;
}

const sources = readSources("bytedance");

function parseRouterData(html: string): SeedCard[] {
  const match = html.match(
    /window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})<\/script>/,
  );
  if (!match) throw new Error("Could not find ByteDance Seed router data");
  const data = JSON.parse(match[1]);
  const page = data.loaderData?.["(locale$)/models/page"];
  const tabs = page?.research_tabs?.en;
  if (!Array.isArray(tabs)) throw new Error("Could not find Seed model tabs");
  return tabs.flatMap((tab: { cards?: SeedCard[] }) => tab.cards ?? []);
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
  const cards = parseRouterData(html);
  console.log(`Parsed ${cards.length} models from ByteDance Seed`);

  let written = 0;
  for (const card of cards) {
    const modelType = inferSeedType(card.title);
    const entry = enrichEntry(
      {
        id: idFromTitle(card.title),
        name: card.title,
        created_by: "bytedance",
        model_type: modelType,
        page_url: card.link,
        status: "active",
      },
      { description: card.description, modelTypeHint: card.title },
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
