import {
  inferFamily,
  type ModelEntry,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Alibaba Cloud Model Studio (Qwen) models from docs.
 * No API key needed — .md endpoint.
 */

const DOCS_MD = "https://www.alibabacloud.com/help/en/model-studio/models.md";

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDollar(s: string): number | undefined {
  const m = s.match(/\$([\d.]+)/);
  return m ? Number(m[1]) : undefined;
}

async function main() {
  console.log("Fetching Alibaba Cloud models from docs...");

  const res = await fetch(DOCS_MD);
  if (!res.ok) throw new Error(`Failed: ${res.status}`);
  const md = await res.text();

  // Parse HTML tables for flagship models
  // Format: table with model names in header, rows for context/pricing
  const tables = [...md.matchAll(/<table>([\s\S]*?)<\/table>/g)];
  console.log(`Found ${tables.length} tables`);

  const models = new Map<
    string,
    { context?: number; input?: number; output?: number }
  >();

  for (const table of tables) {
    const rows = [...table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)];
    if (rows.length < 3) continue;

    // Header row: extract model names
    const headerCells = [...rows[0][1].matchAll(/<td>([\s\S]*?)<\/td>/g)];
    const names = headerCells
      .map((c) => {
        const bold = c[1].match(/<b>(Qwen[\w.-]+)<\/b>/);
        return bold ? bold[1] : null;
      })
      .filter(Boolean) as string[];

    if (names.length === 0) continue;

    // Parse data rows
    for (const row of rows.slice(1)) {
      const cells = [...row[1].matchAll(/<td>([\s\S]*?)<\/td>/g)];
      const texts = cells.map((c) => stripHtml(c[1]));
      if (texts.length < 2) continue;

      const label = texts[0].toLowerCase();

      for (let i = 0; i < names.length; i++) {
        const val = texts[i + 1];
        if (!val) continue;
        const name = names[i];
        const existing = models.get(name) ?? {};

        if (label.includes("context")) {
          const num = val.replace(/,/g, "");
          const n = Number(num);
          if (n > 0 && (!existing.context || n > existing.context)) {
            existing.context = n;
          }
        } else if (label.includes("input price")) {
          const p = parseDollar(val);
          if (p != null && (!existing.input || p < existing.input)) {
            existing.input = p;
          }
        } else if (label.includes("output price")) {
          const p = parseDollar(val);
          if (p != null && (!existing.output || p < existing.output)) {
            existing.output = p;
          }
        }

        models.set(name, existing);
      }
    }
  }

  // Also extract model IDs from the full text (API IDs like qwen-max, qwen3-max etc.)
  const apiIds = [
    ...new Set(
      [...md.matchAll(/(?:^|\s)(qwen[\w.-]+?)(?:\s|$|\.|\))/gm)]
        .map((m) => m[1])
        .filter(
          (id) =>
            !id.endsWith(".") &&
            !id.includes("http") &&
            id.length > 4 &&
            id.length < 50,
        ),
    ),
  ];

  console.log(
    `Parsed ${models.size} models from tables, ${apiIds.length} API IDs from text`,
  );

  let written = 0;

  // Write table models (flagship, have pricing)
  for (const [name, spec] of models) {
    const id = name.toLowerCase();

    const entry: ModelEntry = {
      id,
      name,
      created_by: "qwen",
      family: inferFamily(id),
      context_window: spec.context,
      capabilities: {
        streaming: true,
        tool_call: true,
        ...(id.includes("max") ? { reasoning: true } : {}),
      },
    };

    if (spec.input != null && spec.output != null) {
      entry.pricing = { input: spec.input, output: spec.output };
    }

    written += upsertWithSnapshot("alibaba", entry);
  }

  // Write API-only models not in tables
  for (const id of apiIds) {
    if (models.has(id) || models.has(id.charAt(0).toUpperCase() + id.slice(1)))
      continue;
    // Skip dated snapshots, keep only base names
    if (/\d{4}-\d{2}-\d{2}/.test(id)) continue;
    // Skip TTS/ASR/image models
    if (
      id.includes("tts") ||
      id.includes("asr") ||
      id.includes("image") ||
      id.includes("livetranslate") ||
      id.includes("captioner") ||
      id.includes("filetrans")
    )
      continue;

    const entry: ModelEntry = {
      id,
      name: id,
      created_by: "qwen",
      family: inferFamily(id),
      capabilities: { streaming: true, tool_call: true },
    };

    written += upsertWithSnapshot("alibaba", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
