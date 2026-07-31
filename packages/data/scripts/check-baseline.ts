import * as fs from "node:fs";
import * as path from "node:path";
import { providers } from "../src/data.ts";

/**
 * Ratchet each provider against its own recorded baseline.
 *
 * The fail-loud guard in shared.ts only fires when a scraper parses nothing at
 * all, which is a cliff detector. It cannot see a scraper that keeps working
 * while shedding coverage: recraft parses zero prices yet exits 0, and google
 * and mistral carry no release_date on any model. This compares model count and
 * per-field coverage against the last accepted run and fails on a real drop.
 *
 *   bun scripts/check-baseline.ts            # compare, fail on regression
 *   bun scripts/check-baseline.ts --update   # accept current state as baseline
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const BASELINE_PATH = path.join(ROOT, "baseline.json");

/** Fields worth tracking coverage for; losing one is a silent degradation. */
const TRACKED = [
  "pricing",
  "context_window",
  "release_date",
  "description",
  "capabilities",
  "modalities",
] as const;

/** A provider may lose this share of its models or field coverage before it fails. */
const TOLERANCE = 0.1;

interface Snapshot {
  models: number;
  active: number;
  fields: Record<string, number>;
}

function snapshot(): Record<string, Snapshot> {
  const out: Record<string, Snapshot> = {};
  for (const p of providers) {
    const n = p.models.length;
    // Tracked separately from the total because retiring a model does not
    // delete its file: a wrongful mass deprecation leaves `models` unchanged
    // and would slip past a total-only ratchet.
    const active = p.models.filter((m) => m.status !== "deprecated").length;
    const fields: Record<string, number> = {};
    for (const field of TRACKED) {
      // The absolute count, not the share. Coverage as a ratio falls whenever
      // models are added without the field, so recovering models a scraper had
      // been dropping reads as a regression; only losing the field on models
      // that had it is one.
      fields[field] = p.models.filter(
        (m) => (m as Record<string, unknown>)[field] != null,
      ).length;
    }
    out[p.id] = { models: n, active, fields };
  }
  return out;
}

function main() {
  const current = snapshot();

  if (process.argv.includes("--update")) {
    fs.writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify(current, null, 2)}\n`,
      "utf-8",
    );
    const total = Object.values(current).reduce((s, p) => s + p.models, 0);
    console.log(
      `Baseline updated: ${Object.keys(current).length} providers, ${total} models.`,
    );
    return;
  }

  if (!fs.existsSync(BASELINE_PATH)) {
    console.log("No baseline recorded yet; run with --update to create one.");
    return;
  }

  const base = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf-8")) as Record<
    string,
    Snapshot
  >;

  const regressions: string[] = [];
  const notes: string[] = [];

  for (const [id, was] of Object.entries(base)) {
    const now = current[id];
    if (!now) {
      regressions.push(`${id}: provider disappeared entirely`);
      continue;
    }

    if (was.models > 0) {
      const drop = (was.models - now.models) / was.models;
      if (drop > TOLERANCE) {
        regressions.push(
          `${id}: ${was.models} → ${now.models} models (${Math.round(drop * 100)}% drop)`,
        );
      }
    }

    // Retiring a model keeps its file, so a wrongful mass deprecation moves
    // only this number. Reported rather than failed: the sweep landing on a
    // catalog that never retired anything legitimately retires a lot at once,
    // and a wave of real delistings must not read as a broken build.
    if (was.active && was.active - now.active > was.active * TOLERANCE) {
      notes.push(
        `${id}: active models ${was.active} → ${now.active} (${was.active - now.active} retired)`,
      );
    }

    for (const field of TRACKED) {
      const before = was.fields?.[field] ?? 0;
      const after = now.fields[field] ?? 0;
      if (before > 0 && before - after > before * TOLERANCE) {
        regressions.push(
          `${id}: ${field} present on ${before} → ${after} models`,
        );
      }
    }
  }

  for (const id of Object.keys(current)) {
    if (!base[id]) notes.push(`${id}: new provider, not in baseline`);
  }

  for (const n of notes) console.log(`  ${n}`);

  if (regressions.length === 0) {
    console.log(
      `No regression against baseline across ${Object.keys(base).length} providers.`,
    );
    return;
  }

  for (const r of regressions) console.error(`  REGRESSION ${r}`);
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### ${regressions.length} baseline regression(s)\n\n${regressions
        .map((r) => `- ${r}`)
        .join("\n")}\n`,
    );
  }
  throw new Error(
    `${regressions.length} provider(s) regressed against the baseline`,
  );
}

main();
