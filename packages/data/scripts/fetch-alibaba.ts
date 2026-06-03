import { fetchText, parseTokenCount } from "./parse.ts";
import { modalitiesForType } from "./provider-fetch-utils.ts";
import {
  assertParsed,
  inferFamily,
  inferModelType,
  inferParameters,
  type ModelEntry,
  readSources,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Alibaba Cloud Model Studio (Qwen) models from docs. No API key needed.
 *
 * The aggregate models.md page became a link hub in 2026: it no longer embeds
 * per-model tables, only `[More]` links to per-category detail pages
 * (text-generation-model.md, vision-model.md, embedding-rerank-model.md, ...).
 * We discover those detail pages from models.md, then parse each one's
 * `Model | Context | ...` tables. Pricing is no longer in these tables (it
 * lives on a separate pricing console), so existing pricing on disk is left
 * untouched by the upsert merge.
 */

const sources = readSources("alibaba");
const DOCS_MD = sources.docs as string;
const _ORIGIN = "https://www.alibabacloud.com";

// Models created by other labs but hosted on Bailian; not Qwen/Alibaba models.
const THIRD_PARTY =
  /^(deepseek|glm|kimi|minimax|moonshot|ernie|baichuan|llama|gpt|claude|gemini|mistral|yi-|internlm|chatglm|step|abab|spark|hunyuan|doubao|seed|gte-)/i;

function inferLicense(id: string): string {
  if (
    /^qwen-(max|plus|turbo|vl-max|vl-plus|long|math|omni-turbo)/i.test(id) ||
    /^qwen3\.5-(plus|max)/i.test(id)
  )
    return "proprietary";
  if (/^(qwen|qwq|qvq)/i.test(id)) return "apache-2.0";
  return "proprietary";
}

/** Parse HTML tables into header + rows, keeping the first cell's <code> ids. */
function parseTables(
  html: string,
): { header: string[]; rows: { cells: string[]; ids: string[] }[] }[] {
  return [...html.matchAll(/<table>([\s\S]*?)<\/table>/g)].map((t) => {
    const trMatches = [...t[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
    const rows = trMatches.map((tr) => {
      const cellHtml = [...tr[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)];
      const cells = cellHtml.map((c) =>
        c[1]
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim(),
      );
      const ids = cellHtml[0]
        ? [...cellHtml[0][1].matchAll(/<code>([^<]+)<\/code>/g)].map(
            (m) => m[1],
          )
        : [];
      return { cells, ids };
    });
    return {
      header: (rows[0]?.cells ?? []).map((h) => h.toLowerCase()),
      rows: rows.slice(1),
    };
  });
}

/** Discover per-category detail page URLs linked from the models.md hub. */
function discoverDetailPages(hubMd: string): string[] {
  const links = [
    ...hubMd.matchAll(
      /\((https:\/\/www\.alibabacloud\.com\/help\/en\/document_detail\/\d+\.html)\)/g,
    ),
  ].map((m) => `${m[1]}.md`);
  return [...new Set(links)];
}

const CHAT_TYPES = new Set(["chat", "reasoning", "code"]);

async function main() {
  console.log("Fetching Alibaba Cloud models from docs...");

  const hub = await fetchText(DOCS_MD);
  const detailPages = discoverDetailPages(hub);
  console.log(`Discovered ${detailPages.length} detail pages`);
  assertParsed(detailPages.length, "alibaba (detail page discovery)");

  const seen = new Set<string>();
  let written = 0;

  for (const url of detailPages) {
    let html: string;
    let finalUrl = url;
    try {
      const res = await fetch(url, { redirect: "follow" });
      if (!res.ok) {
        console.warn(`Could not fetch ${url}: ${res.status}`);
        continue;
      }
      finalUrl = res.url.replace(/\.md$/, "");
      html = await res.text();
    } catch {
      console.warn(`Could not fetch ${url}`);
      continue;
    }

    for (const table of parseTables(html)) {
      // Only model tables have a leading "Model" / "Model ID" column.
      if (!(table.header[0] === "model" || table.header[0] === "model id"))
        continue;
      const ctxIdx = table.header.indexOf("context");
      const outIdx = table.header.findIndex((h) => h.includes("max output"));
      const capCols = table.header
        .map((h, i) => ({ h, i }))
        .filter(({ h }) =>
          /function calling|thinking|structured output|batch/.test(h),
        );

      for (const row of table.rows) {
        const id = row.ids[0];
        // Skip non-model cells (prose, format lists) and combined "a/b" cells.
        if (!id || id.includes("/") || id.includes(" ")) continue;
        if (THIRD_PARTY.test(id)) continue;
        // Skip dated snapshots and latest pointers (upsert handles snapshots
        // via the alias; we ingest the stable ids only here).
        if (/latest$/.test(id) || /-\d{4}-\d{2}-\d{2}$/.test(id)) continue;
        if (seen.has(id)) continue;
        seen.add(id);

        const modelType = inferModelType(id) ?? "chat";
        const allText = row.cells.join(" ").toLowerCase();

        const capabilities: Record<string, boolean> = { streaming: true };
        for (const { h, i } of capCols) {
          if (!/supported/i.test(row.cells[i] ?? "")) continue;
          if (h.includes("function calling")) capabilities.tool_call = true;
          if (h.includes("structured output"))
            capabilities.structured_output = true;
          if (h.includes("thinking")) capabilities.reasoning = true;
          if (h.includes("batch")) capabilities.batch = true;
        }
        if (/\bvl\b|vision|-vl-|omni/.test(id)) capabilities.vision = true;

        const entry: ModelEntry = {
          id,
          name: id,
          created_by: "qwen",
          family: inferFamily(id),
          page_url: finalUrl,
          license: inferLicense(id),
          model_type: modelType,
          capabilities,
          modalities: modalitiesForType(
            modelType as ModelEntry["model_type"],
            `${id} ${allText}`,
          ),
          ...(inferParameters(id) ?? {}),
        };
        if (capabilities.reasoning) entry.reasoning_tokens = true;

        // Token-count columns are only meaningful for text models; for image /
        // audio models "Context" / "Max output" mean pixels, images, duration.
        if (CHAT_TYPES.has(modelType)) {
          if (ctxIdx >= 0)
            entry.context_window = parseTokenCount(row.cells[ctxIdx] ?? "");
          if (outIdx >= 0)
            entry.max_output_tokens = parseTokenCount(row.cells[outIdx] ?? "");
        }

        written += upsertWithSnapshot("alibaba", entry);
      }
    }
  }

  assertParsed(seen.size, "alibaba");
  console.log(`Parsed ${seen.size} models, wrote ${written}`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
