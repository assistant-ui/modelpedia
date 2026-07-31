import * as fs from "node:fs";
import * as path from "node:path";
import type { PriceField, PricePoint } from "../src/types";

/**
 * Rebuild per-model price history from the append-only change log.
 *
 * The log records `create` entries without pricing and `update` entries with a
 * whole-object `pricing` diff, so a series is reconstructed as
 * `first change's from` → each `to` → live model pricing. The final point comes
 * from the model files rather than the log because the changes workflow commits
 * one step behind the data commit it describes.
 */

const SCALAR_FIELDS: PriceField[] = [
  "input",
  "output",
  "cached_input",
  "cache_write",
  "cache_write_1h",
  "batch_input",
  "batch_output",
  "cached_output",
];

interface RawChange {
  ts: string;
  provider: string;
  model: string;
  action: "create" | "update" | "delete";
  commit?: string;
  changes?: Record<string, { from?: unknown; to?: unknown }>;
}

type Scalars = Partial<Record<PriceField, number | null>>;

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function scalarsOf(pricing: unknown): Scalars {
  if (!isObj(pricing)) return {};
  const out: Scalars = {};
  for (const field of SCALAR_FIELDS) {
    const v = pricing[field];
    if (typeof v === "number" || v === null) out[field] = v;
  }
  return out;
}

function sameScalars(a: Scalars, b: Scalars): boolean {
  return SCALAR_FIELDS.every((f) => (a[f] ?? null) === (b[f] ?? null));
}

function hasValue(s: Scalars): boolean {
  return SCALAR_FIELDS.some((f) => typeof s[f] === "number");
}

function tiersOf(pricing: unknown): string {
  return isObj(pricing) ? JSON.stringify(pricing.tiers ?? null) : "null";
}

function day(ts: string): string {
  return ts.slice(0, 10);
}

export function buildPriceHistory(
  providers: Array<{ id: string; models: Record<string, unknown>[] }>,
  changesPath: string,
): Record<string, PricePoint[]> {
  if (!fs.existsSync(changesPath)) return {};

  const raw: RawChange[] = fs
    .readFileSync(changesPath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as RawChange);

  // Earliest date each listing was seen, used to date the pre-first-change price
  const firstSeen = new Map<string, string>();
  const priceChanges = new Map<string, RawChange[]>();

  for (const e of raw) {
    const key = `${e.provider}/${e.model}`;
    const seen = firstSeen.get(key);
    if (!seen || e.ts < seen) firstSeen.set(key, e.ts);
    if (e.action !== "update" || !e.changes?.pricing) continue;
    const list = priceChanges.get(key);
    if (list) list.push(e);
    else priceChanges.set(key, [e]);
  }

  const live = new Map<string, Record<string, unknown>>();
  for (const { id, models } of providers) {
    for (const m of models) live.set(`${id}/${m.id as string}`, m);
  }

  const index: Record<string, PricePoint[]> = {};

  for (const [key, changes] of priceChanges) {
    changes.sort((a, b) => a.ts.localeCompare(b.ts));

    const points: PricePoint[] = [];
    const base = changes[0].changes!.pricing.from;
    let state = scalarsOf(base);
    let tierState = tiersOf(base);

    if (isObj(base)) {
      points.push({ date: day(firstSeen.get(key) ?? changes[0].ts), ...state });
    }

    for (const change of changes) {
      const { to } = change.changes!.pricing;
      const next = scalarsOf(to);
      const nextTiers = tiersOf(to);
      const tiersChanged = nextTiers !== tierState;

      if (sameScalars(state, next) && !tiersChanged) continue;

      const point: PricePoint = { date: day(change.ts), ...next };
      if (change.commit) point.commit = change.commit;
      if (tiersChanged) point.tiers = true;
      if (points.length === 0) point.introduced = true;
      if (!hasValue(next) && hasValue(state)) point.removed = true;
      points.push(point);

      state = next;
      tierState = nextTiers;
    }

    // Anchor the series on live data: the change log trails the data commit it
    // describes by one workflow run, so the last recorded `to` can be stale.
    const model = live.get(key);
    if (model) {
      const now = scalarsOf(model.pricing);
      const nowTiers = tiersOf(model.pricing);
      const drifted = !sameScalars(state, now) || nowTiers !== tierState;
      if (drifted) {
        const point: PricePoint = {
          date: (model.last_updated as string) ?? day(new Date().toISOString()),
          ...now,
          current: true,
        };
        if (nowTiers !== tierState) point.tiers = true;
        if (!hasValue(now) && hasValue(state)) point.removed = true;
        points.push(point);
      } else if (points.length > 0) {
        points[points.length - 1].current = true;
      }
    }

    if (points.length >= 2) index[key] = points;
  }

  return Object.fromEntries(
    Object.entries(index).sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function writePriceHistory(
  providers: Array<{ id: string; models: Record<string, unknown>[] }>,
  root: string,
  outputs: string[],
): number {
  const index = buildPriceHistory(
    providers,
    path.join(root, "changes", "changes.jsonl"),
  );

  const lines = [
    "// This file is auto-generated by scripts/generate.ts",
    "// Do not edit manually",
    "",
    "import type { PriceHistoryIndex } from './types';",
    "",
    `export const priceHistory: PriceHistoryIndex = ${JSON.stringify(index)};`,
    "",
  ];

  for (const output of outputs) {
    fs.writeFileSync(output, lines.join("\n"), "utf-8");
  }

  return Object.keys(index).length;
}
