import { fetchText } from "./parse.ts";
import { enrichEntry } from "./provider-fetch-utils.ts";
import {
  type ModelEntry,
  readSources,
  runGenerate,
  sanitizeModelId,
  upsertModel,
} from "./shared.ts";

type LocalizedText = string | { en?: string; zh?: string };

interface SeedCard {
  title?: LocalizedText;
  description?: LocalizedText;
  links?: { learnMore?: LocalizedText };
  actions?: {
    en?: { text?: string; link?: string }[];
    zh?: { text?: string; link?: string }[];
  };
}

interface SeedArticle {
  ArticleSubContentEn?: {
    ImageTitle?: string;
    Abstract?: string;
    TitleKey?: string;
  };
}

interface ParsedSeedCard {
  title: string;
  description?: string;
  pageUrl: string;
}

const sources = readSources("bytedance");

function localizedText(value?: LocalizedText): string | undefined {
  const text = typeof value === "string" ? value : value?.en || value?.zh;
  return text?.trim() || undefined;
}

function parseRouterPage(html: string, key: string): Record<string, unknown> {
  const match = html.match(
    /window\._ROUTER_DATA\s*=\s*(\{[\s\S]*?\})<\/script>/,
  );
  if (!match) throw new Error("Could not find ByteDance Seed router data");
  const data = JSON.parse(match[1]);
  const page = data.loaderData?.[key] as Record<string, unknown> | undefined;
  if (!page) throw new Error(`Could not find ByteDance Seed page data: ${key}`);
  return page;
}

function parseRouterData(html: string, modelsUrl: string): ParsedSeedCard[] {
  const page = parseRouterPage(html, "(locale$)/models/page");

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
    const title = localizedText(card?.title);
    const description = localizedText(card?.description);
    const actions = card?.actions?.en?.length
      ? card.actions.en
      : card?.actions?.zh;
    const learnMore =
      localizedText(card?.links?.learnMore) ||
      actions?.find(
        (action) => action.text === "Learn more" || action.text === "了解更多",
      )?.link;
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

function parseBlogCards(html: string, modelsUrl: string): ParsedSeedCard[] {
  const page = parseRouterPage(html, "(locale$)/blog_list/(category)/page");
  if (!Array.isArray(page.article_list) || page.article_list.length === 0) {
    throw new Error("Could not find ByteDance Seed release articles");
  }
  return (page.article_list as SeedArticle[]).flatMap((article) => {
    const content = article.ArticleSubContentEn;
    const title = content?.ImageTitle?.trim();
    const description = content?.Abstract?.trim();
    const slug = content?.TitleKey?.trim();
    if (!title || !description || !slug) return [];
    return [
      {
        title,
        description,
        pageUrl: new URL(`blog/${slug}`, modelsUrl).href,
      },
    ];
  });
}

function parseSeedVariants(html: string, pageUrl: string): ParsedSeedCard[] {
  const route = new URL(pageUrl).pathname.split("/").pop();
  const page = parseRouterPage(html, `(locale$)/${route}/page`);
  const family = (page.header as { title?: string } | undefined)?.title;
  const rows = page.tableDataSource as Record<string, unknown>[] | undefined;
  const headingRows = page.tableHeaderRows as number[] | undefined;
  if (!family || !rows || !headingRows) {
    throw new Error(`Could not find ByteDance Seed variant labels: ${pageUrl}`);
  }
  const models = new Map<string, ParsedSeedCard>();
  for (const index of headingRows) {
    for (const value of Object.values(rows[index] ?? {})) {
      if (typeof value !== "string" || !value.startsWith(`${family} `))
        continue;
      const title = value.replace(/（\d{4}）$/, "").trim();
      models.set(idFromTitle(title), { title, pageUrl });
    }
  }
  if (models.size === 0) {
    throw new Error(`Could not find ByteDance Seed variant labels: ${pageUrl}`);
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
  if (
    lower.includes("voice") ||
    lower.includes("interpret") ||
    lower.includes("duplex")
  )
    return "audio";
  if (lower.includes("music")) return "audio";
  if (lower.includes("diffusion")) return "code";
  if (
    lower.includes("3d") ||
    lower.includes("depth anything") ||
    lower.includes("protenix") ||
    lower.includes("gr-")
  )
    return "other";
  return "chat";
}

async function main() {
  console.log("Fetching ByteDance Seed models page...");
  const modelsUrl = sources.models as string;
  const html = await fetchText(modelsUrl);
  const cards = new Map(
    parseRouterData(html, modelsUrl).map((card) => [
      idFromTitle(card.title),
      card,
    ]),
  );
  for (const category of ["foundation", "visual", "audio"]) {
    const url = new URL(`blog_list/${category}`, modelsUrl).href;
    for (const card of parseBlogCards(await fetchText(url), modelsUrl)) {
      const id = idFromTitle(card.title);
      if (!cards.has(id)) cards.set(id, card);
    }
  }
  for (const path of ["seed2", "seed2_1"]) {
    const url = new URL(path, modelsUrl).href;
    for (const card of parseSeedVariants(await fetchText(url), url)) {
      const id = idFromTitle(card.title);
      if (!cards.has(id)) cards.set(id, card);
    }
  }
  console.log(`Parsed ${cards.size} models from ByteDance Seed`);

  let written = 0;
  for (const card of cards.values()) {
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
