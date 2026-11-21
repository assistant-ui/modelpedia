import { fetchMarkdown, pMap } from "./parse.ts";
import { modelTypeFromCategory } from "./provider-fetch-utils.ts";
import {
  buildPricing,
  inferFamily,
  inferModelType,
  inferParameters,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertModel,
} from "./shared.ts";

/**
 * Fetch Cloudflare AI Gateway models from the public model catalog.
 *
 * The catalog index lists every model reachable through Cloudflare; each
 * third-party model has its own markdown page with a context window and
 * per-1M-token pricing. `@cf/` models belong to the Workers AI script.
 */

const PROVIDER = "cloudflare-ai-gateway";
const sources = readSources(PROVIDER);
const CATALOG_URL = sources.models as string;

// Public catalog provider slugs → the id prefix stored on disk (the gateway's
// legacy /compat/v1/models naming), so existing files are updated in place.
const PUBLIC_TO_GATEWAY_PREFIX: Record<string, string> = {
  google: "google-ai-studio",
  xai: "grok",
};

// Public catalog provider slugs → our internal provider ids.
const PUBLIC_TO_INTERNAL: Record<string, string> = {
  "deepseek-ai": "deepseek",
  moonshotai: "moonshot",
};

function priceFor(pricing: string, label: string): number | undefined {
  const match = pricing.match(
    new RegExp(`(?:^|<li>)${label} \\(per 1M tokens\\)\\$([\\d.,]+)`),
  );
  return match ? Number(match[1].replace(/,/g, "")) : undefined;
}

function parseContextWindow(text: string | undefined): number | undefined {
  const match = text?.match(/([\d,]+) tokens/);
  return match ? Number(match[1].replace(/,/g, "")) : undefined;
}

function modelTypeFromTask(task: string): ModelEntry["model_type"] | undefined {
  if (/speech recognition/i.test(task)) return "transcription";
  if (/music|sound/i.test(task)) return "audio";
  if (/video-to-video|video generation/i.test(task)) return "video";
  if (/to-document/i.test(task)) return "other";
  const type = modelTypeFromCategory(task.replace(/\s+/g, "-"));
  return type === "other" ? undefined : type;
}

function parseModelPage(md: string, slug: string): ModelEntry | null {
  const title = md.match(/^# (.+)$/m)?.[1]?.trim();
  const rawId = md.match(/Model ID\s+`([^`]+)`/)?.[1] ?? slug;
  if (!title || rawId.startsWith("@cf/")) return null;

  const slashIdx = rawId.indexOf("/");
  if (slashIdx < 0) return null;
  const publicProvider = rawId.slice(0, slashIdx);
  const bareModel = rawId.slice(slashIdx + 1);
  const gatewayPrefix =
    PUBLIC_TO_GATEWAY_PREFIX[publicProvider] ?? publicProvider;

  const task = md.match(/^([^\n•]+) • [^\n]+$/m)?.[1]?.trim() ?? "";
  const info: Record<string, string> = {};
  for (const [, key, value] of md.matchAll(/^\| ([^|]+?) \| (.+) \|$/gm)) {
    info[key.replace(/\s*\[.*$/, "")] = value;
  }
  const pricing = info.Pricing ?? "";
  const params = inferParameters(bareModel);

  const entry: ModelEntry = {
    id: `${gatewayPrefix}/${bareModel}`,
    name: title,
    created_by: PUBLIC_TO_INTERNAL[publicProvider] ?? publicProvider,
    family: inferFamily(bareModel),
    status: "active",
    model_type: modelTypeFromTask(task) ?? inferModelType(bareModel),
    context_window: parseContextWindow(info["Context Window"]),
    parameters: params?.parameters,
    active_parameters: params?.active_parameters,
  };
  entry.pricing = buildPricing({
    input: priceFor(pricing, "Input"),
    output: priceFor(pricing, "Output"),
    cached_input: priceFor(pricing, "Cached input"),
    cache_write: priceFor(pricing, "Cache creation"),
  });
  return entry;
}

async function main() {
  console.log(`Fetching Cloudflare model catalog from ${CATALOG_URL}...`);
  const index = await fetchMarkdown(CATALOG_URL);
  const slugs = [
    ...new Set(
      [
        ...index.matchAll(
          /\]\(https:\/\/developers\.cloudflare\.com\/ai\/models\/([^)]+?)\/\)/g,
        ),
      ]
        .map((m) => m[1])
        .filter((slug) => !slug.startsWith("@cf/")),
    ),
  ];
  console.log(`Got ${slugs.length} gateway models from catalog`);
  if (slugs.length === 0) {
    throw new Error(
      "cloudflare-ai-gateway: catalog listed 0 models (page structure changed?)",
    );
  }

  const entries = await pMap(
    slugs,
    async (slug) =>
      parseModelPage(await fetchMarkdown(`${CATALOG_URL}${slug}/`), slug),
    6,
  );

  let written = 0;
  let priced = 0;
  for (const entry of entries) {
    if (!entry) continue;
    if (entry.pricing) priced++;
    if (upsertModel(PROVIDER, entry)) written++;
  }

  console.log(`Wrote ${written} models (${priced} with token pricing)`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
