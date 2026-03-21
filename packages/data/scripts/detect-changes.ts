import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Detect model/provider changes by comparing current files with a git ref.
 *
 * Usage:
 *   bun scripts/detect-changes.ts            # compare with HEAD~1
 *   bun scripts/detect-changes.ts HEAD~3      # compare with 3 commits ago
 *   bun scripts/detect-changes.ts v0.0.1      # compare with a tag
 *   bun scripts/detect-changes.ts --dry-run   # print changes without writing
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const CHANGES_DIR = path.join(ROOT, "changes");
const PROVIDERS_REL = "providers/";

// ── Types ──

interface ChangeEntry {
  ts: string;
  provider: string;
  model: string;
  type: "added" | "removed" | "updated" | "backfill";
  field?: string;
  old?: unknown;
  new?: unknown;
}

// Fields to ignore when diffing (metadata, not model data)
const IGNORE_FIELDS = new Set(["last_updated", "source"]);

// ── Git helpers ──

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf-8" }).trim();
}

function getChangedFiles(ref: string): {
  added: string[];
  modified: string[];
  deleted: string[];
} {
  // Tracked changes (committed or staged)
  const output = git(`diff --name-status ${ref} -- ${PROVIDERS_REL}`);

  const added: string[] = [];
  const modified: string[] = [];
  const deleted: string[] = [];

  if (output) {
    for (const line of output.split("\n")) {
      const [status, ...rest] = line.split("\t");
      const filePath = rest.join("\t");
      if (!filePath.endsWith(".json") || filePath.endsWith("_provider.json"))
        continue;

      if (status === "A") added.push(filePath);
      else if (status === "M") modified.push(filePath);
      else if (status === "D") deleted.push(filePath);
    }
  }

  // Also detect untracked new model files (not yet committed)
  try {
    const untracked = git(
      `ls-files --others --exclude-standard -- ${PROVIDERS_REL}`,
    );
    if (untracked) {
      for (const filePath of untracked.split("\n")) {
        if (!filePath.endsWith(".json") || filePath.endsWith("_provider.json"))
          continue;
        if (!added.includes(filePath)) added.push(filePath);
      }
    }
  } catch {
    // ignore
  }

  return { added, modified, deleted };
}

function readFileAtRef(
  ref: string,
  filePath: string,
): Record<string, unknown> | null {
  try {
    const content = git(`show ${ref}:${filePath}`);
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function readCurrentFile(filePath: string): Record<string, unknown> | null {
  const fullPath = path.join(ROOT, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

// ── Parsing provider/model from file path ──

function parseFilePath(
  filePath: string,
): { provider: string; model: string } | null {
  // providers/openai/models/gpt-5.4.json → provider=openai, model from JSON id
  const match = filePath.match(/^providers\/([^/]+)\/models\/(.+)\.json$/);
  if (!match) return null;
  return { provider: match[1], model: match[2] };
}

// ── Deep diff ──

function flattenObject(
  obj: Record<string, unknown>,
  prefix = "",
): Map<string, unknown> {
  const map = new Map<string, unknown>();

  for (const [key, value] of Object.entries(obj)) {
    if (IGNORE_FIELDS.has(key)) continue;

    const fieldPath = prefix ? `${prefix}.${key}` : key;

    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      for (const [k, v] of flattenObject(
        value as Record<string, unknown>,
        fieldPath,
      )) {
        map.set(k, v);
      }
    } else if (Array.isArray(value)) {
      // Store arrays as sorted JSON strings for comparison
      map.set(fieldPath, JSON.stringify([...value].sort()));
    } else {
      map.set(fieldPath, value);
    }
  }

  return map;
}

function diffModel(
  provider: string,
  modelId: string,
  oldData: Record<string, unknown> | null,
  newData: Record<string, unknown> | null,
  ts: string,
): ChangeEntry[] {
  const model = (newData?.id as string) ?? (oldData?.id as string) ?? modelId;

  if (!oldData && newData) {
    return [{ ts, provider, model, type: "added" }];
  }

  if (oldData && !newData) {
    return [{ ts, provider, model, type: "removed" }];
  }

  if (!oldData || !newData) return [];

  const oldFlat = flattenObject(oldData);
  const newFlat = flattenObject(newData);

  const changes: ChangeEntry[] = [];
  const allKeys = new Set([...oldFlat.keys(), ...newFlat.keys()]);

  for (const field of allKeys) {
    const oldVal = oldFlat.get(field);
    const newVal = newFlat.get(field);

    // No change
    if (oldVal === newVal) continue;
    if (oldVal === undefined && newVal === undefined) continue;

    if (oldVal === undefined && newVal !== undefined) {
      // Backfill: field was missing, now has a value
      changes.push({
        ts,
        provider,
        model,
        type: "backfill",
        field,
        new: deserialize(newVal),
      });
    } else if (oldVal !== undefined && newVal === undefined) {
      // Field removed (unusual)
      changes.push({
        ts,
        provider,
        model,
        type: "updated",
        field,
        old: deserialize(oldVal),
        new: undefined,
      });
    } else {
      // Value changed
      changes.push({
        ts,
        provider,
        model,
        type: "updated",
        field,
        old: deserialize(oldVal),
        new: deserialize(newVal),
      });
    }
  }

  return changes;
}

/** Restore array values from sorted JSON strings for output */
function deserialize(val: unknown): unknown {
  if (typeof val === "string" && val.startsWith("[")) {
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  }
  return val;
}

// ── Write changes ──

function writeChanges(changes: ChangeEntry[], dryRun: boolean): void {
  if (changes.length === 0) {
    console.log("No changes detected.");
    return;
  }

  // Group by type for summary
  const added = changes.filter((c) => c.type === "added");
  const removed = changes.filter((c) => c.type === "removed");
  const updated = changes.filter((c) => c.type === "updated");
  const backfill = changes.filter((c) => c.type === "backfill");

  console.log(`\nChanges detected:`);
  if (added.length) console.log(`  added:    ${added.length} models`);
  if (removed.length) console.log(`  removed:  ${removed.length} models`);
  if (updated.length) console.log(`  updated:  ${updated.length} fields`);
  if (backfill.length) console.log(`  backfill: ${backfill.length} fields`);

  // Show details
  for (const c of added) {
    console.log(`  + ${c.provider}/${c.model}`);
  }
  for (const c of removed) {
    console.log(`  - ${c.provider}/${c.model}`);
  }
  for (const c of updated) {
    console.log(
      `  Δ ${c.provider}/${c.model} ${c.field}: ${JSON.stringify(c.old)} → ${JSON.stringify(c.new)}`,
    );
  }
  for (const c of backfill) {
    console.log(
      `  ○ ${c.provider}/${c.model} ${c.field}: → ${JSON.stringify(c.new)}`,
    );
  }

  if (dryRun) {
    console.log("\n(dry run — not writing to disk)");
    return;
  }

  // Write NDJSON
  const dateStr = new Date().toISOString().split("T")[0];
  const file = path.join(CHANGES_DIR, `${dateStr}.ndjson`);
  fs.mkdirSync(CHANGES_DIR, { recursive: true });

  const lines = `${changes.map((c) => JSON.stringify(c)).join("\n")}\n`;
  fs.appendFileSync(file, lines, "utf-8");
  console.log(`\nWrote ${changes.length} entries to changes/${dateStr}.ndjson`);
}

// ── Main ──

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ref = args.find((a) => !a.startsWith("--")) ?? "HEAD~1";

  // Verify ref exists
  try {
    git(`rev-parse ${ref}`);
  } catch {
    console.error(`Invalid git ref: ${ref}`);
    process.exit(1);
  }

  console.log(`Comparing with: ${ref}`);

  const { added, modified, deleted } = getChangedFiles(ref);
  console.log(
    `Changed files: ${added.length} added, ${modified.length} modified, ${deleted.length} deleted`,
  );

  const ts = new Date().toISOString();
  const allChanges: ChangeEntry[] = [];

  // Added models
  for (const file of added) {
    const info = parseFilePath(file);
    if (!info) continue;
    const newData = readCurrentFile(file);
    if (!newData) continue;
    allChanges.push(...diffModel(info.provider, info.model, null, newData, ts));
  }

  // Modified models
  for (const file of modified) {
    const info = parseFilePath(file);
    if (!info) continue;
    const oldData = readFileAtRef(ref, file);
    const newData = readCurrentFile(file);
    allChanges.push(
      ...diffModel(info.provider, info.model, oldData, newData, ts),
    );
  }

  // Deleted models
  for (const file of deleted) {
    const info = parseFilePath(file);
    if (!info) continue;
    const oldData = readFileAtRef(ref, file);
    if (!oldData) continue;
    allChanges.push(...diffModel(info.provider, info.model, oldData, null, ts));
  }

  writeChanges(allChanges, dryRun);
}

main();
