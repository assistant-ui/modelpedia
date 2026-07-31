import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Assert every fetch script is wired into the CI workflow.
 *
 * A script that exists but is never invoked drifts with no signal at all: the
 * fail-loud guards only fire on a run, so a missing workflow entry is invisible.
 * fetch-cursor.ts went 96 days without running for exactly this reason.
 */

const SCRIPTS_DIR = import.meta.dirname;
const WORKFLOW = path.resolve(
  SCRIPTS_DIR,
  "../../../.github/workflows/fetch-models.yml",
);

/** Scripts deliberately kept out of the daily run, with the reason. */
const EXCLUDED = new Map([
  ["provider-icons", "writes provider icons, not model data; run on demand"],
]);

function main() {
  const onDisk = fs
    .readdirSync(SCRIPTS_DIR)
    .filter((f) => f.startsWith("fetch-") && f.endsWith(".ts"))
    .map((f) => f.slice("fetch-".length, -".ts".length))
    .filter((name) => name !== "provider-fetch-utils")
    .sort();

  const workflow = fs.readFileSync(WORKFLOW, "utf-8");
  const wired = new Set(
    [...workflow.matchAll(/fetch:([a-z0-9-]+)/g)].map((m) => m[1]),
  );

  const missing = onDisk.filter((n) => !wired.has(n) && !EXCLUDED.has(n));
  const orphaned = [...wired].filter((n) => !onDisk.includes(n)).sort();

  for (const [name, reason] of EXCLUDED) {
    if (onDisk.includes(name)) console.log(`  excluded: ${name} (${reason})`);
  }

  if (missing.length === 0 && orphaned.length === 0) {
    console.log(
      `All ${onDisk.length - EXCLUDED.size} fetch scripts are wired into CI.`,
    );
    return;
  }

  for (const n of missing) {
    console.error(
      `  MISSING from workflow: fetch:${n} (scripts/fetch-${n}.ts)`,
    );
  }
  for (const n of orphaned) {
    console.error(
      `  workflow runs fetch:${n} but scripts/fetch-${n}.ts is gone`,
    );
  }
  throw new Error(
    `fetch coverage mismatch: ${missing.length} unwired, ${orphaned.length} orphaned`,
  );
}

main();
