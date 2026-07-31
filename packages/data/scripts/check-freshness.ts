import type { ModelData } from "../src/types.ts";
import { allModels, providers } from "../src/data.ts";

/**
 * Flag first-party catalogs that have fallen behind what aggregators know.
 *
 * Every self-reported metric is blind to a frozen catalog: a scraper pointed at
 * a stale listing parses the same models successfully forever, so exit codes,
 * parse counts and count-vs-disk ratios all read healthy. meta sat 449 days
 * behind at a perfect 1.00 ratio.
 *
 * Aggregators carry `created_by`, so they are an independent witness. When one
 * lists a model attributed to a direct provider, and that provider's own
 * directory has nothing matching, the provider's scraper is behind.
 *
 * Matching is deliberately literal. An aggregator that renames a model past
 * what `normalize` folds (deepinfra's `claude-4-opus` for anthropic's
 * `claude-opus-4-0`) is reported as missing even though it is present. That is
 * the safe direction to be wrong in: this is a review queue rather than a gate,
 * and fuzzy matching bought at the cost of false negatives would hide the next
 * genuinely missing model the way a `created_by` mismatch hid kimi-k3.
 */

/** Aggregators with canonical `vendor/model` ids, refreshed daily. */
const WITNESSES = [
  "openrouter",
  "vercel",
  "together",
  "deepinfra",
  "novita",
  "fireworks",
  "azure",
  "baseten",
  "groq",
];

/** Ids differ cosmetically across providers; compare on a reduced form. */
function normalize(id: string): string {
  // OpenRouter marks its floating alias entries with a leading tilde
  // (`~anthropic/claude-opus-latest`).
  let s = id.toLowerCase().trim().replace(/^~/, "");
  s = s.replace(/^(us|eu|apac|global)\./, "");
  // Bedrock revisions look like `vendor.model-v1:0`
  if (s.includes(":")) {
    s = s.replace(/^[a-z0-9-]+\./, "").replace(/-v\d+:\d+$/, "");
  }
  s = s.replace(/^[a-z0-9-]+\//, "");
  // Everything after a colon is an aggregator routing variant (:batch, :free)
  s = s.replace(/:.*$/, "").replace(/@.*$/, "");
  // Version separators disagree across providers: anthropic writes
  // claude-opus-4-8, openrouter writes claude-opus-4.8. Drop both so the same
  // model compares equal. Runs last, after any vendor prefix is removed, since
  // stripping dots earlier would eat the prefix boundary in `gpt-5.6-luna`.
  return s.replace(/[-_.\s]/g, "");
}

/** Words an aggregator appends purely to name a serving mode. */
const SERVING_SUFFIXES = new Set([
  "fast",
  "thinking",
  "batch",
  "online",
  "nitro",
  "turbo",
  // A floating pointer to whatever is current, not a model of its own.
  "latest",
  "preview",
]);

/**
 * True when the aggregator's model is one the provider already lists, or a
 * serving variant of one.
 *
 * A suffix allowlist cannot decide this: `-pro` is a distinct product for
 * o3-pro and a pure routing tier for openrouter's gpt-5.6-luna-pro, whose own
 * description says it is "the same underlying model as GPT-5.6 Luna". So the
 * specs decide instead. Dropping one trailing segment and requiring the context
 * window and price to match is evidence rather than a naming guess.
 */
function known(own: Map<string, ModelData>, candidate: ModelData): boolean {
  // A floating pointer is never a model the first party is missing: it names
  // whatever is current. OpenRouter marks these with a leading tilde, and the
  // `-latest` convention says the same thing in the id itself. Their base
  // ("claude-opus") is not a concrete model either, so base matching cannot
  // resolve them.
  if (/^~/.test(candidate.id) || /-latest$/.test(candidate.id)) return true;

  const n = normalize(candidate.id);
  if (own.has(n)) return true;

  // A trailing word on top of a model we already list. The segment has to come
  // off the raw id: normalize() drops separators, so `gpt-5.6-luna-pro` becomes
  // `gpt56lunapro` and the trailing word is no longer findable.
  const raw = candidate.id.replace(/^[a-z0-9-]+\//, "").replace(/[:@].*$/, "");
  const cut = raw.lastIndexOf("-");
  if (cut <= 0) return false;
  const suffix = raw.slice(cut + 1).toLowerCase();
  const mine = own.get(normalize(raw.slice(0, cut)));
  if (!mine) return false;

  // Price cannot corroborate: the same model is priced differently per
  // provider, which is the point of tracking price at all. Context can.

  if (SERVING_SUFFIXES.has(suffix)) return true;
  return (
    mine.context_window != null &&
    mine.context_window === candidate.context_window
  );
}

interface Finding {
  provider: string;
  ownNewest?: string;
  witnessNewest?: string;
  lagDays?: number;
  missing: { id: string; seenOn: string; released?: string }[];
}

/**
 * Resolve a `created_by` value to a provider id.
 *
 * Creators are written inconsistently across sources: kimi models arrive as
 * `moonshot`, `moonshotai` and `~moonshotai`, and GLM as `zai`, `z-ai` and
 * `zhipu`. Matching on the raw string hid moonshot's missing kimi-k3 behind a
 * name mismatch, so the provider's own `aliases` resolve it, with a normalised
 * fallback for the spellings no alias list covers.
 */
function buildCreatorIndex(): Map<string, string> {
  const index = new Map<string, string>();
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  for (const p of providers) {
    index.set(key(p.id), p.id);
    for (const alias of p.aliases ?? []) index.set(key(alias), p.id);
  }
  return index;
}

function main() {
  const direct = providers.filter((p) => p.type === "direct");
  const ownIds = new Map(
    providers.map((p) => [
      p.id,
      new Map(p.models.map((m) => [normalize(m.id), m])),
    ]),
  );
  const creatorIndex = buildCreatorIndex();
  const creatorOf = (raw: string | undefined) =>
    raw
      ? creatorIndex.get(raw.toLowerCase().replace(/[^a-z0-9]/g, ""))
      : undefined;

  const findings: Finding[] = [];

  for (const p of direct) {
    const dates = p.models
      .map((m) => m.release_date)
      .filter((d): d is string => Boolean(d))
      .sort();
    // May be undefined: 10 of 24 direct providers carry no release_date at all.
    // Presence, not recency, decides whether a model is missing; dates only
    // rank the report.
    const ownNewest = dates[dates.length - 1];

    const seen = ownIds.get(p.id)!;
    const missing = allModels
      .filter(
        (m) =>
          creatorOf(m.created_by) === p.id &&
          m.provider !== p.id &&
          WITNESSES.includes(m.provider) &&
          (ownNewest == null ||
            m.release_date == null ||
            m.release_date > ownNewest) &&
          !known(seen, m),
      )
      .map((m) => ({
        id: m.id,
        seenOn: m.provider,
        released: m.release_date ?? undefined,
      }))
      .sort((a, b) => (b.released ?? "").localeCompare(a.released ?? ""));

    if (missing.length === 0) continue;

    const witnessNewest = missing.find((m) => m.released)?.released;
    findings.push({
      provider: p.id,
      ownNewest,
      witnessNewest,
      lagDays:
        ownNewest && witnessNewest
          ? Math.round(
              (Date.parse(witnessNewest) - Date.parse(ownNewest)) / 86_400_000,
            )
          : undefined,
      missing: missing.slice(0, 5),
    });
  }

  // Rank by lag where both sides are dated, then by how much is missing.
  findings.sort(
    (a, b) =>
      (b.lagDays ?? -1) - (a.lagDays ?? -1) ||
      b.missing.length - a.missing.length,
  );

  if (findings.length === 0) {
    console.log("No first-party catalog is behind its aggregators.");
    return;
  }

  console.log(`${findings.length} provider(s) behind their aggregators:\n`);
  for (const f of findings) {
    const lag =
      f.lagDays != null
        ? `own catalog stops at ${f.ownNewest}, aggregators list ${f.witnessNewest} (${f.lagDays} days behind)`
        : `${f.missing.length} model(s) aggregators attribute to it are absent from its own catalog`;
    console.log(`${f.provider}: ${lag}`);
    for (const m of f.missing) {
      console.log(`    ${m.released ?? "undated"}  ${m.id}  [${m.seenOn}]`);
    }
    console.log();
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      `### ${findings.length} provider catalog(s) behind their aggregators`,
      "",
      "| Provider | Own newest | Aggregators have | Days behind | Missing |",
      "| --- | --- | --- | ---: | ---: |",
      ...findings.map(
        (f) =>
          `| \`${f.provider}\` | ${f.ownNewest ?? "undated"} | ${f.witnessNewest ?? "undated"} | ${f.lagDays ?? "n/a"} | ${f.missing.length} |`,
      ),
    ];
    require("node:fs").appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${lines.join("\n")}\n`,
    );
  }
}

main();
