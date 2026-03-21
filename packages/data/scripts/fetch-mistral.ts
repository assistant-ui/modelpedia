import {
  envOrNull,
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Mistral AI models from:
 * 1. Docs models page (model ID list from RSC payload)
 * 2. Individual model detail pages (specs + pricing via WebFetch)
 * 3. /v1/models API (optional, needs key — for release dates + capabilities)
 */

const MODELS_PAGE = "https://docs.mistral.ai/getting-started/models";
const MODEL_DETAIL_BASE = "https://docs.mistral.ai/models/";
const API_URL = "https://api.mistral.ai/v1/models";

// ── Extract model slugs from docs RSC payload ──

async function fetchModelSlugs(): Promise<string[]> {
  const res = await fetch(MODELS_PAGE);
  const html = await res.text();

  // Extract model page slugs from href patterns in RSC payload
  const slugs = [
    ...new Set(
      [
        ...html.matchAll(
          /\/models\/((?:mistral|codestral|devstral|ministral|pixtral|magistral|voxtral)[a-z0-9-]+)/g,
        ),
      ].map((m) => m[1]),
    ),
  ];

  // Also parse the legacy/deprecated table
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
  const deprecated = new Map<
    string,
    { deprecation?: string; retirement?: string }
  >();
  for (const table of tables) {
    const rows = [...table[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    for (const row of rows) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
      const texts = cells.map((c) =>
        c[1]
          .replace(/<[^>]+>/g, "")
          .replace(/\s+/g, " ")
          .trim(),
      );
      if (texts.length < 4) continue;
      const apiId = texts[2]?.toLowerCase();
      if (!apiId) continue;
      // Column 3 has "October 31, 2025November 30, 2025" (deprecation + retirement)
      const dates = texts[3]?.match(/([A-Z][a-z]+ \d+, \d{4})/g);
      deprecated.set(apiId, {
        deprecation: dates?.[0],
        retirement: dates?.[1],
      });
    }
  }

  return { slugs, deprecated };
}

// ── Fetch individual model detail page ──

interface ModelDetail {
  id: string;
  slug: string;
  name?: string;
  description?: string;
  context_window?: number;
  max_output_tokens?: number;
  pricing_input?: number;
  pricing_output?: number;
  capabilities: string[];
  vision?: boolean;
  deprecated?: boolean;
}

function _parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

async function fetchModelDetail(slug: string): Promise<ModelDetail | null> {
  const res = await fetch(`${MODEL_DETAIL_BASE}${slug}`);
  if (!res.ok) return null;
  const html = await res.text();

  // Extract main content text for spec parsing
  const mainHtml = html.match(/<main[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? "";
  const mainText = mainHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

  // Extract model API ID from RSC payload
  const idMatch =
    html.match(
      /(?:API Model|model_?id|"id")[^"]*"((?:mistral|codestral|devstral|ministral|pixtral|magistral|voxtral)[a-z0-9-]+)"/i,
    ) ??
    html.match(
      /((?:mistral|codestral|devstral|ministral|pixtral|magistral|voxtral)-[a-z0-9-]+-(?:latest|\d{4}))/,
    );

  // Context window: "Context 256k" or "Context i 128k"
  const contextMatch = mainText.match(/Context\s*(?:i)?\s*(\d+)[kK]/i);

  // Pricing: "Price i $ 0.15 /M Tokens $ 0.6 /M Tokens"
  const priceMatch = mainText.match(
    /Price\s*(?:i)?\s*\$\s*([\d.]+)\s*\/M\s*Tokens\s*\$\s*([\d.]+)/i,
  );

  // Vision: check main content only
  const hasVision = /Vision|Multimodal|OCR|Image input|image → text/i.test(
    mainText,
  );

  // Reconstruct API ID from slug
  const apiId = idMatch?.[1] ?? slug.replace(/-(\d+)-(\d+)$/, "-$1$2");

  return {
    id: apiId,
    slug,
    context_window: contextMatch ? Number(contextMatch[1]) * 1000 : undefined,
    pricing_input: priceMatch ? Number(priceMatch[1]) : undefined,
    pricing_output: priceMatch ? Number(priceMatch[2]) : undefined,
    capabilities: [],
    vision: hasVision,
    deprecated: false,
  };
}

// ── API fetch (optional) ──

interface MistralApiModel {
  id: string;
  created: number;
  capabilities: {
    completion_chat: boolean;
    function_calling: boolean;
    fine_tuning: boolean;
    vision: boolean;
  };
  max_context_length: number;
  description: string;
  deprecation?: string | null;
}

async function fetchApiModels(
  apiKey: string,
): Promise<Map<string, MistralApiModel>> {
  const res = await fetch(API_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) return new Map();
  const json = (await res.json()) as { data: MistralApiModel[] };
  const map = new Map<string, MistralApiModel>();
  for (const m of json.data) map.set(m.id, m);
  return map;
}

// ── Main ──

async function main() {
  console.log("Fetching Mistral model slugs from docs...");
  const { slugs, deprecated } = await fetchModelSlugs();
  console.log(
    `Found ${slugs.length} model slugs, ${deprecated.size} deprecated`,
  );

  // Fetch detail pages in parallel (batch of 5)
  const details: ModelDetail[] = [];
  for (let i = 0; i < slugs.length; i += 5) {
    const batch = slugs.slice(i, i + 5);
    const results = await Promise.all(batch.map(fetchModelDetail));
    for (const r of results) {
      if (r) details.push(r);
    }
  }
  console.log(`Fetched ${details.length} model details`);

  // Optional API
  const apiKey = envOrNull("MISTRAL_API_KEY");
  let apiModels = new Map<string, MistralApiModel>();
  if (apiKey) {
    console.log("Fetching from API...");
    apiModels = await fetchApiModels(apiKey);
    console.log(`Found ${apiModels.size} models from API`);
  }

  let written = 0;
  for (const detail of details) {
    const apiModel = apiModels.get(detail.id);
    const depInfo = deprecated.get(detail.id);
    const isDeprecated =
      detail.deprecated || !!apiModel?.deprecation || !!depInfo;

    const entry: ModelEntry = {
      id: detail.id,
      name: detail.id,
      family: inferFamily(detail.id),
      description: apiModel?.description ?? detail.description,
      status: isDeprecated ? "deprecated" : "active",
      context_window: apiModel?.max_context_length ?? detail.context_window,
      modalities: {
        input:
          detail.vision || apiModel?.capabilities?.vision
            ? ["text", "image"]
            : ["text"],
        output: ["text"],
      },
      capabilities: {
        streaming: true,
        ...(apiModel?.capabilities?.function_calling
          ? { tool_call: true }
          : {}),
        ...(apiModel?.capabilities?.vision || detail.vision
          ? { vision: true }
          : {}),
        ...(apiModel?.capabilities?.fine_tuning ? { fine_tuning: true } : {}),
      },
    };

    if (detail.pricing_input != null && detail.pricing_output != null) {
      entry.pricing = {
        input: detail.pricing_input,
        output: detail.pricing_output,
      };
    }

    if (apiModel?.created) {
      entry.release_date = new Date(apiModel.created * 1000)
        .toISOString()
        .split("T")[0];
    }
    if (apiModel?.deprecation) {
      entry.deprecation_date = apiModel.deprecation;
    } else if (depInfo?.deprecation) {
      entry.deprecation_date = depInfo.deprecation;
    }

    written += upsertWithSnapshot("mistral", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
