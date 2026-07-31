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
  let s = id.toLowerCase().trim();
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
  ownNewest: string;
  witnessNewest: string;
  lagDays: number;
  missing: { id: string; seenOn: string; released: string }[];
}

function main() {
  const direct = providers.filter((p) => p.type === "direct");
  const ownIds = new Map(
    providers.map((p) => [
      p.id,
      new Map(p.models.map((m) => [normalize(m.id), m])),
    ]),
  );

  const findings: Finding[] = [];

  for (const p of direct) {
    const mine = p.models
      .map((m) => m.release_date)
      .filter((d): d is string => Boolean(d))
      .sort();
    const ownNewest = mine[mine.length - 1];
    // Without a dated catalog of our own there is nothing to compare against;
    // release_date coverage is its own problem, reported separately.
    if (!ownNewest) continue;

    const seen = ownIds.get(p.id)!;
    const missing = allModels
      .filter(
        (m) =>
          m.created_by === p.id &&
          m.provider !== p.id &&
          WITNESSES.includes(m.provider) &&
          m.release_date != null &&
          m.release_date > ownNewest &&
          !known(seen, m),
      )
      .map((m) => ({
        id: m.id,
        seenOn: m.provider,
        released: m.release_date as string,
      }))
      .sort((a, b) => b.released.localeCompare(a.released));

    if (missing.length === 0) continue;

    const witnessNewest = missing[0].released;
    findings.push({
      provider: p.id,
      ownNewest,
      witnessNewest,
      lagDays: Math.round(
        (Date.parse(witnessNewest) - Date.parse(ownNewest)) / 86_400_000,
      ),
      missing: missing.slice(0, 5),
    });
  }

  findings.sort((a, b) => b.lagDays - a.lagDays);

  if (findings.length === 0) {
    console.log("No first-party catalog is behind its aggregators.");
    return;
  }

  console.log(`${findings.length} provider(s) behind their aggregators:\n`);
  for (const f of findings) {
    console.log(
      `${f.provider}: own catalog stops at ${f.ownNewest}, aggregators list ${f.witnessNewest} (${f.lagDays} days behind)`,
    );
    for (const m of f.missing) {
      console.log(`    ${m.released}  ${m.id}  [${m.seenOn}]`);
    }
    console.log();
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const lines = [
      `### ${findings.length} provider catalog(s) behind their aggregators`,
      "",
      "| Provider | Own newest | Aggregators have | Days behind |",
      "| --- | --- | --- | ---: |",
      ...findings.map(
        (f) =>
          `| \`${f.provider}\` | ${f.ownNewest} | ${f.witnessNewest} | ${f.lagDays} |`,
      ),
    ];
    require("node:fs").appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `${lines.join("\n")}\n`,
    );
  }
}

main();
