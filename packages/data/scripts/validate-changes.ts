import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const CHANGES_PATH = path.join(ROOT, "changes", "changes.jsonl");
const PROVIDERS_DIR = path.join(ROOT, "providers");

const VALID_ACTIONS = ["create", "update", "delete"] as const;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}.\d{3}Z$/;
const SHA_RE = /^[0-9a-f]{40}$/;

// Load known providers from filesystem
const knownProviders = new Set(
  fs
    .readdirSync(PROVIDERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name),
);

let errors = 0;
let warnings = 0;

function error(line: number, msg: string) {
  console.error(`  ERROR L${line}: ${msg}`);
  errors++;
}

function warn(line: number, msg: string) {
  console.warn(`  WARN  L${line}: ${msg}`);
  warnings++;
}

function main() {
  if (!fs.existsSync(CHANGES_PATH)) {
    console.error("changes.jsonl not found");
    process.exit(1);
  }

  const content = fs.readFileSync(CHANGES_PATH, "utf-8");
  const lines = content.split("\n");

  // File must end with a single newline
  if (!content.endsWith("\n")) {
    console.error("  ERROR: file must end with a newline");
    errors++;
  }

  const nonEmptyLines = lines.filter((l) => l.trim());
  console.log(`Validating ${nonEmptyLines.length} entries...`);

  let prevTs = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Allow trailing newline
    if (line.trim() === "") {
      if (i < lines.length - 1 && lines.slice(i).every((l) => l.trim() === ""))
        break;
      if (i < lines.length - 1) {
        error(lineNum, "unexpected empty line");
      }
      continue;
    }

    // Parse JSON
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch (e) {
      error(lineNum, `invalid JSON: ${(e as Error).message}`);
      continue;
    }

    // Required fields
    if (typeof entry.ts !== "string" || !ISO_DATE_RE.test(entry.ts)) {
      error(lineNum, `ts: must be ISO 8601 timestamp, got "${entry.ts}"`);
    }

    if (typeof entry.provider !== "string" || !entry.provider) {
      error(lineNum, "provider: required non-empty string");
    } else if (!knownProviders.has(entry.provider)) {
      warn(lineNum, `provider: "${entry.provider}" not found in providers/`);
    }

    if (typeof entry.model !== "string" || !entry.model) {
      error(lineNum, "model: required non-empty string");
    }

    if (
      !VALID_ACTIONS.includes(entry.action as (typeof VALID_ACTIONS)[number])
    ) {
      error(
        lineNum,
        `action: must be one of ${VALID_ACTIONS.join(", ")}, got "${entry.action}"`,
      );
    }

    // Optional fields
    if (entry.commit !== undefined) {
      if (typeof entry.commit !== "string" || !SHA_RE.test(entry.commit)) {
        error(
          lineNum,
          `commit: must be a 40-char hex SHA, got "${entry.commit}"`,
        );
      }
    }

    if (entry.action === "update") {
      if (entry.changes === undefined || entry.changes === null) {
        warn(lineNum, "update entry missing changes field");
      } else if (
        typeof entry.changes !== "object" ||
        Array.isArray(entry.changes)
      ) {
        error(lineNum, "changes: must be an object");
      } else {
        const changes = entry.changes as Record<string, unknown>;
        for (const [key, val] of Object.entries(changes)) {
          if (typeof val !== "object" || val === null || Array.isArray(val)) {
            error(lineNum, `changes.${key}: must be {from?, to?}`);
          } else {
            const diff = val as Record<string, unknown>;
            if (!("from" in diff) && !("to" in diff)) {
              error(
                lineNum,
                `changes.${key}: must have at least "from" or "to"`,
              );
            }
          }
        }
      }
    }

    // Chronological order
    if (typeof entry.ts === "string" && entry.ts < prevTs) {
      error(lineNum, `ts out of order: "${entry.ts}" < "${prevTs}"`);
    }
    if (typeof entry.ts === "string") {
      prevTs = entry.ts;
    }
  }

  // Summary
  console.log(
    `\n${nonEmptyLines.length} entries, ${errors} errors, ${warnings} warnings`,
  );

  if (errors > 0) {
    console.log("\nChanges validation failed.");
    process.exit(1);
  }
  console.log("\nChanges validation passed.");
}

main();
