import { fetchText, fetchWithRetry, parseTokenCount } from "./parse.ts";
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
 * models.md is a link hub: it links per-category pages (text-generation-model,
 * vision-model, ...) whose `.md` variants carry the `Model ID | Context | ...`
 * tables. Pricing is not in these tables (it lives on a separate pricing
 * console), so existing pricing on disk is left untouched by the upsert merge.
 */

const sources = readSources("alibaba");
const DOCS_MD = sources.docs as string;
const ORIGIN = "https://www.alibabacloud.com";
const MODEL_ID = /^[a-z][a-z0-9._-]*$/i;

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

function extractModelIds(cellHtml: string, cell: string): string[] {
  const ids = [
    ...cellHtml.matchAll(/<code[^>]*>([^<]+)<\/code>/gi),
    ...cellHtml.matchAll(/`([^`]+)`/g),
  ].map((match) => match[1].trim());

  if (ids.length === 0 && MODEL_ID.test(cell)) ids.push(cell);
  return [...new Set(ids)];
}

function parseTables(html: string): {
  header: string[];
  rows: { cells: string[]; ids: string[]; isSectionLabel: boolean }[];
}[] {
  return [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)].map((t) => {
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
        ? extractModelIds(cellHtml[0][1], cells[0] ?? "")
        : [];
      const isSectionLabel = /<t[hd]\b[^>]*\bcolspan=/i.test(
        cellHtml[0]?.[0] ?? "",
      );
      return { cells, ids, isSectionLabel };
    });
    const headerIndex = rows.findIndex((row) =>
      /^model(?: id)?$/i.test(row.cells[0] ?? ""),
    );
    return {
      header: (rows[headerIndex]?.cells ?? []).map((h) => h.toLowerCase()),
      rows: headerIndex === -1 ? [] : rows.slice(headerIndex + 1),
    };
  });
}

function detailPageUrl(href: string): string | undefined {
  const url = new URL(href, ORIGIN);
  if (
    url.origin !== ORIGIN ||
    !url.pathname.startsWith("/help/en/model-studio/")
  ) {
    return undefined;
  }
  url.hash = "";
  if (!url.pathname.endsWith(".md")) url.pathname += ".md";
  return url.href;
}

function discoverDetailPages(hubMd: string): string[] {
  const links = [...hubMd.matchAll(/\]\(([^)\s]+)\)/g)]
    .map((match) => detailPageUrl(match[1]))
    .filter((url): url is string => url !== undefined);
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
  const skipped = {
    invalid: new Set<string>(),
    thirdParty: new Set<string>(),
    datedSnapshot: new Set<string>(),
    latestPointer: new Set<string>(),
  };
  let written = 0;

  for (const url of detailPages) {
    let html: string;
    let finalUrl = url;
    try {
      const res = await fetchWithRetry(url, { redirect: "follow" });
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
      const ctxIdx = table.header.findIndex((h) => /^context(?:\s|$)/.test(h));
      const outIdx = table.header.findIndex((h) =>
        /\bmax(?:imum)?\s+output\b/.test(h),
      );
      const capCols = table.header
        .map((h, i) => ({ h, i }))
        .filter(({ h }) =>
          /function calling|thinking|structured output|batch/.test(h),
        );

      for (const row of table.rows) {
        if (row.isSectionLabel) {
          for (const id of row.ids) skipped.invalid.add(id);
          continue;
        }
        for (const id of row.ids) {
          if (!MODEL_ID.test(id)) {
            skipped.invalid.add(id);
            continue;
          }
          if (THIRD_PARTY.test(id)) {
            skipped.thirdParty.add(id);
            continue;
          }
          if (/latest$/i.test(id)) {
            skipped.latestPointer.add(id);
            continue;
          }
          if (/-\d{4}-\d{2}-\d{2}$/.test(id)) {
            skipped.datedSnapshot.add(id);
            continue;
          }
          if (seen.has(id)) continue;
          seen.add(id);

          const modelType = inferModelType(id) ?? "chat";
          const allText = row.cells.join(" ").toLowerCase();

          const capabilities: Record<string, boolean> = { streaming: true };
          for (const { h, i } of capCols) {
            if (!/\b(?:supported|yes|available)\b/i.test(row.cells[i] ?? ""))
              continue;
            if (
              /\b(?:unsupported|not supported|no)\b/i.test(row.cells[i] ?? "")
            )
              continue;
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

          if (CHAT_TYPES.has(modelType)) {
            if (ctxIdx >= 0)
              entry.context_window = parseTokenCount(row.cells[ctxIdx] ?? "");
            if (outIdx >= 0)
              entry.max_output_tokens = parseTokenCount(
                row.cells[outIdx] ?? "",
              );
          }

          written += upsertWithSnapshot("alibaba", entry);
        }
      }
    }
  }

  assertParsed(seen.size, "alibaba");
  for (const [reason, ids] of Object.entries(skipped)) {
    if (ids.size > 0) console.log(`Skipped ${reason}: ${[...ids].join(", ")}`);
  }
  console.log(`Parsed ${seen.size} models, wrote ${written}`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
