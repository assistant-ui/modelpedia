import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Detect model/provider changes by comparing current files with a git ref.
 * Writes results to changes.jsonl in the format consumed by the web app.
 *
 * Usage:
 *   bun scripts/detect-changes.ts            # compare with HEAD~1
 *   bun scripts/detect-changes.ts HEAD~3      # compare with 3 commits ago
 *   bun scripts/detect-changes.ts --dry-run   # print changes without writing
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const CHANGES_PATH = path.join(ROOT, "changes", "changes.jsonl");
const PROVIDERS_REL = "providers/";

// Fields to ignore when diffing
const IGNORE_FIELDS = new Set(["last_updated", "source"]);

// ── Types ──

interface ChangeEntry {
  ts: string;
  provider: string;
  model: string;
  action: "create" | "update" | "delete";
  commit?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

// ── Git helpers ──

function git(cmd: string): string {
  return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf-8" }).trim();
}

function getChangedFiles(ref: string): {
  added: string[];
  modified: string[];
  deleted: string[];
} {
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

  // Also detect untracked new model files
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

const REPO_ROOT = path.resolve(ROOT, "../..");

function readCurrentFile(filePath: string): Record<string, unknown> | null {
  const fullPath = path.join(REPO_ROOT, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, "utf-8"));
}

// ── Parsing provider/model from file path ──

function parseFilePath(
  filePath: string,
): { provider: string; model: string } | null {
  const match = filePath.match(
    /(?:^|\/)?providers\/([^/]+)\/models\/(.+)\.json$/,
  );
  if (!match) return null;
  return { provider: match[1], model: match[2] };
}

// ── Diff ──

function diffFields(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  const allKeys = new Set([...Object.keys(oldData), ...Object.keys(newData)]);
  for (const key of allKeys) {
    if (IGNORE_FIELDS.has(key)) continue;
    const oldVal = oldData[key];
    const newVal = newData[key];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[key] = { from: oldVal, to: newVal };
    }
  }
  return changes;
}

// ── Write changes ──

function writeChanges(entries: ChangeEntry[], dryRun: boolean): void {
  if (entries.length === 0) {
    console.log("No changes detected.");
    return;
  }

  const creates = entries.filter((e) => e.action === "create");
  const updates = entries.filter((e) => e.action === "update");
  const deletes = entries.filter((e) => e.action === "delete");

  console.log("\nChanges detected:");
  if (creates.length) console.log(`  created: ${creates.length} models`);
  if (updates.length) console.log(`  updated: ${updates.length} models`);
  if (deletes.length) console.log(`  deleted: ${deletes.length} models`);

  for (const e of creates) console.log(`  + ${e.provider}/${e.model}`);
  for (const e of deletes) console.log(`  - ${e.provider}/${e.model}`);
  for (const e of updates) {
    const fields = Object.keys(e.changes ?? {}).join(", ");
    console.log(`  Δ ${e.provider}/${e.model} [${fields}]`);
  }

  if (dryRun) {
    console.log("\n(dry run — not writing to disk)");
    return;
  }

  fs.mkdirSync(path.dirname(CHANGES_PATH), { recursive: true });
  const newLines = entries.map((e) => JSON.stringify(e)).join("\n");

  // Read existing changes, append new entries
  let existing = "";
  if (fs.existsSync(CHANGES_PATH)) {
    existing = fs.readFileSync(CHANGES_PATH, "utf-8").trimEnd();
  }
  const content = existing ? `${existing}\n${newLines}\n` : `${newLines}\n`;
  fs.writeFileSync(CHANGES_PATH, content, "utf-8");

  console.log(`\nAppended ${entries.length} entries to changes.jsonl`);
}

// ── Main ──

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ref = args.find((a) => !a.startsWith("--")) ?? "HEAD~1";

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
  const entries: ChangeEntry[] = [];

  for (const file of added) {
    const info = parseFilePath(file);
    if (!info) continue;
    const newData = readCurrentFile(file);
    if (!newData) continue;
    const model = (newData.id as string) ?? info.model;
    entries.push({ ts, provider: info.provider, model, action: "create" });
  }

  for (const file of modified) {
    const info = parseFilePath(file);
    if (!info) continue;
    const oldData = readFileAtRef(ref, file);
    const newData = readCurrentFile(file);
    if (!oldData || !newData) continue;
    const model = (newData.id as string) ?? info.model;
    const changes = diffFields(oldData, newData);
    if (Object.keys(changes).length > 0) {
      entries.push({
        ts,
        provider: info.provider,
        model,
        action: "update",
        changes,
      });
    }
  }

  for (const file of deleted) {
    const info = parseFilePath(file);
    if (!info) continue;
    const oldData = readFileAtRef(ref, file);
    if (!oldData) continue;
    const model = (oldData.id as string) ?? info.model;
    entries.push({ ts, provider: info.provider, model, action: "delete" });
  }

  writeChanges(entries, dryRun);
}

main();
