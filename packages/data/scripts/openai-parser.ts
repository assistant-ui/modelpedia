/**
 * Parsers for OpenAI's developers.openai.com JS bundle.
 * Extracts pricing, compare (technical specs), and detail (metadata) entries.
 */

const MODELS_PAGE = "https://developers.openai.com/api/docs/models/all";

// ── Types ──

export interface PricingEntry {
  name: string;
  main: Record<string, number>;
  batch: Record<string, number>;
}

export interface PricingSectionEntry {
  label: string;
  unit: string;
  columns: string[];
  rows: { label: string; values: (number | null)[] }[];
}

/** Per-model map of pricing sections (e.g. text tokens, audio tokens, image gen) */
export type ModelPricingSections = Map<string, PricingSectionEntry[]>;

export interface CompareEntry {
  name: string;
  context_window?: number;
  max_output_tokens?: number;
  max_input_tokens?: number;
  modalities?: { input: string[]; output: string[] };
  knowledge_cutoff?: Date;
  supported_features?: string[];
  supported_endpoints?: string[];
  reasoning_tokens?: boolean;
  performance?: number;
  latency?: number;
}

export interface DetailEntry {
  name: string;
  slug?: string;
  display_name?: string;
  description?: string;
  tagline?: string;
  type?: string;
  supported_tools?: string[];
  deprecated?: boolean;
  current_snapshot?: string;
  snapshots?: string[];
  point_to?: string;
  pricing_notes?: string[];
  playground_url?: string;
}

// ── Bundle discovery ──

export async function fetchBundle(): Promise<string> {
  console.log("Fetching models page...");
  const res = await fetch(MODELS_PAGE);
  if (!res.ok) throw new Error(`Failed to fetch models page: ${res.status}`);
  const html = await res.text();

  const islandMatch = html.match(
    /component-url="(\/_astro\/AllModels\.[^"]+\.js)"/,
  );
  if (!islandMatch) throw new Error("Could not find AllModels component URL");

  const allModelsUrl = `https://developers.openai.com${islandMatch[1]}`;
  console.log("Found AllModels bundle:", islandMatch[1]);

  const jsRes = await fetch(allModelsUrl);
  if (!jsRes.ok)
    throw new Error(`Failed to fetch AllModels bundle: ${jsRes.status}`);
  const allModelsJs = await jsRes.text();

  const dataMatch = allModelsJs.match(
    /from"(\.\/models-page-data\.react\.[^"]+\.js)"/,
  );
  if (!dataMatch)
    throw new Error(
      "Could not find models-page-data import in AllModels bundle",
    );

  const base = allModelsUrl.replace(/\/[^/]+$/, "/");
  const bundleUrl = base + dataMatch[1].replace("./", "");
  console.log("Fetching JS bundle:", bundleUrl);

  const bundleRes = await fetch(bundleUrl);
  if (!bundleRes.ok)
    throw new Error(`Failed to fetch bundle: ${bundleRes.status}`);
  const js = await bundleRes.text();
  console.log(`Bundle size: ${(js.length / 1024).toFixed(0)}KB`);

  return js;
}

// ── Parsers ──

function parseKV(s: string): Record<string, number> {
  const obj: Record<string, number> = {};
  for (const pair of s.split(",")) {
    const [k, v] = pair.split(":");
    const key = k.replace(/"/g, "");
    const num = Number(v?.replace(/"/g, ""));
    if (!Number.isNaN(num)) obj[key] = num;
  }
  return obj;
}

function parseArr(s: string): string[] {
  return s
    ? s
        .split(",")
        .map((x) => x.replace(/"/g, "").trim())
        .filter(Boolean)
    : [];
}

/**
 * Extract all top-level object chunks that match an anchor regex.
 * Tracks brace/bracket/backtick depth so nested structures are handled.
 * Uses slug as map key when available, falls back to the captured name.
 */
function extractObjects(js: string, anchor: RegExp): Map<string, string> {
  const map = new Map<string, string>();
  let m: RegExpExecArray | null;
  while ((m = anchor.exec(js)) !== null) {
    // Walk back to the opening brace
    let start = m.index;
    while (start > 0 && js[start] !== "{") start--;
    // Walk forward tracking depth (braces, brackets, backtick templates)
    let depth = 0;
    let inBacktick = false;
    let end = start;
    for (; end < js.length; end++) {
      const ch = js[end];
      if (inBacktick) {
        if (ch === "`") inBacktick = false;
        continue;
      }
      if (ch === "`") {
        inBacktick = true;
        continue;
      }
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
      if (depth === 0) {
        end++;
        break;
      }
    }
    const chunk = js.slice(start, end);
    // Use name field as key (the real API model ID); slug is a URL-safe variant that
    // loses dots (e.g. gpt-3.5-turbo → gpt-3-5-turbo), so we avoid it as key.
    const nameMatch = chunk.match(/name:"([^"]+)"/);
    const key = nameMatch ? nameMatch[1] : m[1];
    if (map.has(key)) continue;
    map.set(key, chunk);
  }
  return map;
}

/** Extract a numeric field value (handles scientific notation like 2e5, 128e3). */
function numField(chunk: string, field: string): number | undefined {
  const m = chunk.match(new RegExp(`${field}:([\\de.+]+)`));
  return m ? Number(m[1]) : undefined;
}

/** Extract a string field value. */
function strField(chunk: string, field: string): string | undefined {
  const m = chunk.match(new RegExp(`${field}:"([^"]*)"`));
  return m ? m[1] : undefined;
}

/** Extract an array field value (e.g. ["a","b"]). */
function arrField(chunk: string, field: string): string[] | undefined {
  const m = chunk.match(new RegExp(`${field}:\\[([^\\]]*)\\]`));
  return m ? parseArr(m[1]) : undefined;
}

/** Extract a boolean field (minified !0 = true, !1 = false). */
function boolField(chunk: string, field: string): boolean | undefined {
  const m = chunk.match(new RegExp(`${field}:(!?[01])`));
  return m ? m[1] === "!0" : undefined;
}

export function parsePricing(js: string): Map<string, PricingEntry> {
  const map = new Map<string, PricingEntry>();
  const regex =
    /\{"name":"([^"]+)"(?:,"current_snapshot":"[^"]*")?(?:,"description":"[^"]*")?(?:,"units":\{[^}]*\})?,"values":\{"main":\{([^}]+)\}(?:,"batch":\{([^}]+)\})?/g;

  let match;
  while ((match = regex.exec(js)) !== null) {
    const name = match[1];
    if (map.has(name) || /\d{4}-\d{2}-\d{2}/.test(name)) continue;
    map.set(name, {
      name,
      main: parseKV(match[2]),
      batch: parseKV(match[3] ?? ""),
    });
  }
  return map;
}

const TIER_LABELS: Record<string, string> = {
  main: "Standard",
  batch: "Batch",
  flex: "Flex",
  priority: "Priority",
};

/**
 * Parse the structured pricing JSON block from the bundle.
 * Returns a map of model name → array of pricing sections.
 */
export function parsePricingSections(js: string): ModelPricingSections {
  const map: ModelPricingSections = new Map();

  // 1. Parse the JSON.parse('...') block containing token pricing sections
  const jsonMatch = js.match(
    /JSON\.parse\('(\{"name":"Latest models".*?\})'\)/s,
  );
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      // Collect rows per model per price_type, so flex sections merge into the main one
      const modelSectionRows = new Map<
        string,
        Map<string, { label: string; values: (number | null)[] }[]>
      >();

      for (const sec of data.subsections ?? []) {
        // Use price_type as canonical label (e.g. "Text tokens") not title (e.g. "Flagship models")
        const sectionLabel =
          (sec.price_type as string) || (sec.title as string);
        const colNames = (sec.columns as { name: string; label: string }[]).map(
          (c) => c.name,
        );
        const tiers = ["main", "batch", "flex", "priority"];

        for (const item of sec.items ?? []) {
          const name = item.name as string;
          if (/\d{4}-\d{2}-\d{2}/.test(name)) continue;

          if (!modelSectionRows.has(name))
            modelSectionRows.set(name, new Map());
          const sectionMap = modelSectionRows.get(name)!;
          if (!sectionMap.has(sectionLabel)) sectionMap.set(sectionLabel, []);
          const rows = sectionMap.get(sectionLabel)!;

          // Determine which tier label to use based on context
          for (const tier of tiers) {
            const vals = item.values?.[tier] as
              | Record<string, number>
              | undefined;
            if (!vals) continue;
            // For "Text tokens (Flex Processing)" subsection, the "main" tier IS flex
            const tierLabel =
              tier === "main" && (sec.title as string).includes("Flex")
                ? "Flex"
                : (TIER_LABELS[tier] ?? tier);
            // Skip if this tier label already exists (avoid duplicates)
            if (rows.some((r) => r.label === tierLabel)) continue;
            rows.push({
              label: tierLabel,
              values: colNames.map((cn) => vals[cn] ?? null),
            });
          }
        }
      }

      // Build a map of sectionLabel → column labels
      const sectionColumns = new Map<string, string[]>();
      for (const sec of data.subsections ?? []) {
        const sectionLabel =
          (sec.price_type as string) || (sec.title as string);
        if (!sectionColumns.has(sectionLabel)) {
          sectionColumns.set(
            sectionLabel,
            (sec.columns as { label: string }[]).map((c) => c.label),
          );
        }
      }

      for (const [name, sectionMap] of modelSectionRows) {
        const existing = map.get(name) ?? [];
        for (const [label, rows] of sectionMap) {
          if (rows.length === 0) continue;
          const columns = sectionColumns.get(label) ?? [];
          const unit = label === "Pricing" ? "" : "Per 1M tokens";
          existing.push({ label, unit, columns, rows });
        }
        map.set(name, existing);
      }
    } catch {
      console.warn("Failed to parse pricing JSON block");
    }
  }

  // 2. Parse standalone pricing variables (Image generation, Sora, Embeddings, etc.)
  const standaloneAnchor = /=\{name:"([^"]+)"[^}]*?subsections:\[/g;
  let standalone;
  while ((standalone = standaloneAnchor.exec(js)) !== null) {
    const varName = standalone[1];
    // Extract the full object using depth tracking from the = sign
    const objStart = standalone.index + 1; // skip =
    let depth = 0;
    let inBt = false;
    let objEnd = objStart;
    for (; objEnd < js.length; objEnd++) {
      const ch = js[objEnd];
      if (inBt) {
        if (ch === "`") inBt = false;
        continue;
      }
      if (ch === "`") {
        inBt = true;
        continue;
      }
      if (ch === "{" || ch === "[") depth++;
      else if (ch === "}" || ch === "]") depth--;
      if (depth === 0) {
        objEnd++;
        break;
      }
    }
    const fullObj = js.slice(objStart, objEnd);

    // Find unit from parent
    const unitMatch = fullObj.match(/price_unit:"([^"]+)"/);
    const parentUnit = unitMatch ? `Per ${unitMatch[1]}` : "";

    // Extract subsections array content
    const subIdx = fullObj.indexOf("subsections:[");
    if (subIdx === -1) continue;
    const subsectionsStr = fullObj.slice(subIdx + 13); // after "subsections:["

    // Parse each subsection — find columns:[...],items:[...] blocks
    const colsRegex = /columns:\[/g;
    let colsMatch;
    while ((colsMatch = colsRegex.exec(subsectionsStr)) !== null) {
      // Extract the subsection object by going back to its opening brace
      let ssStart = colsMatch.index;
      while (ssStart > 0 && subsectionsStr[ssStart] !== "{") ssStart--;
      // Extract price_type from this subsection
      const ssHeader = subsectionsStr.slice(ssStart, colsMatch.index);
      const ptMatch = ssHeader.match(/price_type:"([^"]*)"/);
      const priceType = ptMatch?.[1] || varName;

      // Extract columns array
      const colArrStart = colsMatch.index + 9; // after "columns:["
      let cd = 1;
      let colArrEnd = colArrStart;
      for (; colArrEnd < subsectionsStr.length && cd > 0; colArrEnd++) {
        if (subsectionsStr[colArrEnd] === "[") cd++;
        if (subsectionsStr[colArrEnd] === "]") cd--;
      }
      const colsStr = subsectionsStr.slice(colArrStart, colArrEnd - 1);

      // Extract items array
      const itemsIdx = subsectionsStr.indexOf("items:[", colArrEnd);
      if (itemsIdx === -1 || itemsIdx - colArrEnd > 200) continue;
      const itemArrStart = itemsIdx + 7;
      let id2 = 1;
      let itemArrEnd = itemArrStart;
      for (; itemArrEnd < subsectionsStr.length && id2 > 0; itemArrEnd++) {
        if (subsectionsStr[itemArrEnd] === "[") id2++;
        if (subsectionsStr[itemArrEnd] === "]") id2--;
      }
      const itemsStr = subsectionsStr.slice(itemArrStart, itemArrEnd - 1);

      // Extract column definitions (labels may use "..." or `...`)
      const colDefs = [
        ...colsStr.matchAll(
          /\{name:"(\w+)",label:(?:"([^"]*?)"|`([^`]*?)`)\}/g,
        ),
      ].map((c) => ({
        name: c[1],
        label: (c[2] ?? c[3] ?? c[1]).replace(/\n/g, " "),
      }));

      // Determine unit from subsection or parent
      const subUnitMatch = subsectionsStr
        .slice(ssStart, itemArrStart)
        .match(/price_unit:"([^"]+)"/);
      const unit = subUnitMatch ? `Per ${subUnitMatch[1]}` : parentUnit;

      // Extract items by finding each {name:"..."...values:{...}} in itemsStr
      // Can't use extractObjects because same model may appear multiple times (e.g. quality rows)
      const itemNameRegex = /name:"([^"]+)"/g;
      let itemAnchor;

      // Group rows by model name
      const modelRows = new Map<
        string,
        { label: string; values: (number | null)[] }[]
      >();

      while ((itemAnchor = itemNameRegex.exec(itemsStr)) !== null) {
        const name = itemAnchor[1];
        // Find enclosing object
        let iStart = itemAnchor.index;
        while (iStart > 0 && itemsStr[iStart] !== "{") iStart--;
        let iDepth = 0;
        let iEnd = iStart;
        for (; iEnd < itemsStr.length; iEnd++) {
          if (itemsStr[iEnd] === "{" || itemsStr[iEnd] === "[") iDepth++;
          if (itemsStr[iEnd] === "}" || itemsStr[iEnd] === "]") iDepth--;
          if (iDepth === 0) {
            iEnd++;
            break;
          }
        }
        const chunk = itemsStr.slice(iStart, iEnd);
        itemNameRegex.lastIndex = iEnd; // skip past this object

        // Extract each tier (main, batch, flex, priority)
        for (const tierKey of ["main", "batch", "flex", "priority"]) {
          const tierMatch = chunk.match(new RegExp(`${tierKey}:\\{([^}]+)\\}`));
          if (!tierMatch) continue;

          const rawVals = tierMatch[1];
          const vals = parseKV(rawVals);

          // Detect quality label for image/video rows
          const qualityMatch = rawVals.match(/quality:"([^"]+)"/);
          const tierLabel = qualityMatch
            ? qualityMatch[1]
            : (TIER_LABELS[tierKey] ?? tierKey);

          const colValues = colDefs.map((c) => {
            if (c.name === "quality") return null;
            return vals[c.name] ?? null;
          });

          const existing = modelRows.get(name) ?? [];
          if (!existing.some((r) => r.label === tierLabel)) {
            existing.push({ label: tierLabel, values: colValues });
            modelRows.set(name, existing);
          }
        }
      }

      const columns = colDefs.map((c) =>
        c.name === "quality" ? "Quality" : c.label,
      );
      for (const [name, rows] of modelRows) {
        if (rows.length === 0) continue;
        const existing = map.get(name) ?? [];
        existing.push({ label: priceType, unit, columns, rows });
        map.set(name, existing);
      }
    }
  }

  return map;
}

export function parseCompareEntries(js: string): Map<string, CompareEntry> {
  const map = new Map<string, CompareEntry>();
  // Anchor: objects with name + performance (slug is optional)
  const chunks = extractObjects(
    js,
    /name:"([^"]+)",(?:slug:"[^"]+",)?performance:\d/g,
  );

  for (const [name, chunk] of chunks) {
    const inputMods = arrField(chunk, "input");
    const outputMods = arrField(chunk, "output");

    // knowledge_cutoff: new Date(17172e8) — extract the argument and eval as Number
    let knowledge_cutoff: Date | undefined;
    const kcMatch = chunk.match(/knowledge_cutoff:new Date\(([^)]+)\)/);
    if (kcMatch) knowledge_cutoff = new Date(Number(kcMatch[1]));

    map.set(name, {
      name,
      performance: numField(chunk, "performance"),
      latency: numField(chunk, "latency"),
      context_window: numField(chunk, "context_window"),
      max_output_tokens: numField(chunk, "max_output_tokens"),
      max_input_tokens: numField(chunk, "max_input_tokens"),
      modalities:
        inputMods && outputMods
          ? { input: inputMods, output: outputMods }
          : undefined,
      knowledge_cutoff,
      supported_features: arrField(chunk, "supported_features"),
      supported_endpoints: arrField(chunk, "supported_endpoints"),
      reasoning_tokens: boolField(chunk, "reasoning_tokens"),
    });
  }

  return map;
}

export function parseDetailEntries(js: string): Map<string, DetailEntry> {
  const map = new Map<string, DetailEntry>();
  // Anchor: objects with name + current_snapshot + tagline (other fields in between are skipped)
  const chunks = extractObjects(
    js,
    /name:"([^"]+)"(?:,\w+:"[^"]*")*?,current_snapshot:"[^"]*",tagline:/g,
  );

  for (const [name, chunk] of chunks) {
    // Description: backtick template description:`...` or plain string description:"..."
    const descBt = chunk.match(/description:`([^`]*)`/);
    const descStr = !descBt ? strField(chunk, "description") : undefined;
    const desc = descBt
      ? descBt[1].split("\n")[0].trim()
      : descStr || undefined;

    // tagline: tagline:"..."
    const tagline = strField(chunk, "tagline");

    // point_to: point_to:"model-name"
    const point_to = strField(chunk, "point_to");

    // pricing_notes: pricing_notes:["...","..."]
    // These contain commas inside strings, so arrField won't work — parse manually
    let pricing_notes: string[] | undefined;
    const pnMatch = chunk.match(/pricing_notes:\[([^\]]+)\]/);
    if (pnMatch) {
      pricing_notes = [...pnMatch[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    }

    // playground_url: playground_url:"https://..."
    const rawPlayground = strField(chunk, "playground_url");
    const playground_url =
      rawPlayground && rawPlayground !== "none" ? rawPlayground : undefined;

    map.set(name, {
      name,
      slug: strField(chunk, "slug"),
      display_name: strField(chunk, "display_name"),
      description: desc,
      tagline,
      type: strField(chunk, "type"),
      supported_tools: arrField(chunk, "supported_tools"),
      current_snapshot: strField(chunk, "current_snapshot") || undefined,
      snapshots: arrField(chunk, "snapshots"),
      point_to,
      pricing_notes,
      playground_url,
    });
  }

  // Deprecated flag may appear in separate entries
  const deprecatedRegex = /\{name:"([^"]+)"[^}]*?deprecated:(!?[01])/g;
  let match;
  while ((match = deprecatedRegex.exec(js)) !== null) {
    const existing = map.get(match[1]);
    if (existing) existing.deprecated = match[2] === "!0";
  }
  return map;
}
