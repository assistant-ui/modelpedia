import type { PriceField, PricePoint } from "./data";
import { priceHistory } from "./data";

export type { PriceField, PricePoint };

/** Price fields shown in history, labelled to match the pricing grid. */
export const PRICE_FIELDS: { key: PriceField; label: string }[] = [
  { key: "input", label: "Input" },
  { key: "output", label: "Output" },
  { key: "cached_input", label: "Cache read" },
  { key: "cache_write", label: "Cache write" },
  { key: "batch_input", label: "Batch in" },
  { key: "batch_output", label: "Batch out" },
];

export interface ResolvedPriceHistory {
  points: PricePoint[];
  /** Set when the series belongs to the alias this model inherits pricing from */
  inheritedFrom?: string;
  /** Fields present anywhere in the series, in PRICE_FIELDS order */
  fields: PriceField[];
  /** Field to open on, the first one whose value actually changes */
  defaultField: PriceField;
}

/** Distinct states a field takes across the series, absent and null included. */
function movesAcross(points: PricePoint[], field: PriceField): boolean {
  const seen = new Set(points.map((p) => String(p[field])));
  return seen.size > 1;
}

export function resolvePriceHistory(
  provider: string,
  id: string,
  alias?: string,
): ResolvedPriceHistory | null {
  const own = priceHistory[`${provider}/${id}`];
  const points = own ?? (alias ? priceHistory[`${provider}/${alias}`] : null);
  if (!points || points.length < 2) return null;

  const fields = PRICE_FIELDS.map((f) => f.key).filter((key) =>
    points.some((p) => typeof p[key] === "number"),
  );

  // A step that only reshuffled the nested tier tables leaves every displayed
  // field flat, which reads as "no history" with extra chrome around it.
  const defaultField = fields.find((key) => movesAcross(points, key));
  if (!defaultField) return null;

  return {
    points,
    ...(own ? {} : { inheritedFrom: alias }),
    fields,
    defaultField,
  };
}

export interface PriceDelta {
  from: number;
  to: number;
  /** Signed percent change, negative for a price cut */
  pct: number;
  since: string;
}

/** First-to-last change for one field, or null if it never moved. */
export function priceDelta(
  points: PricePoint[],
  field: PriceField,
): PriceDelta | null {
  const known = points.filter((p) => typeof p[field] === "number");
  if (known.length < 2) return null;
  const from = known[0][field] as number;
  const to = known[known.length - 1][field] as number;
  if (from === to || from === 0) return null;
  return { from, to, pct: ((to - from) / from) * 100, since: known[0].date };
}

/** Change across the most recent step only, used for the pricing grid cells. */
export function latestPriceDelta(
  points: PricePoint[],
  field: PriceField,
): PriceDelta | null {
  const known = points.filter((p) => typeof p[field] === "number");
  if (known.length < 2) return null;
  const prev = known[known.length - 2];
  const last = known[known.length - 1];
  const from = prev[field] as number;
  const to = last[field] as number;
  if (from === to || from === 0) return null;
  return { from, to, pct: ((to - from) / from) * 100, since: last.date };
}

export function formatPct(pct: number): string {
  const abs = Math.abs(pct);
  const digits = abs < 1 ? 1 : 0;
  return `${pct < 0 ? "↓" : "↑"}${abs.toFixed(digits)}%`;
}

export interface PriceSegment {
  point: PricePoint;
  value: number | null;
  /** Percentage of the track width, proportional to how long the price held */
  width: number;
  /** Percentage of the track height, relative to the series maximum */
  height: number;
  start: string;
  end: string;
  isLast: boolean;
}

const DAY_MS = 86_400_000;
/**
 * Repricings cluster: a listing can hold one price for a month and then cut
 * twice in a day. Without a generous floor the long step eats the whole track
 * and the cut, which is the part worth seeing, collapses to a sliver.
 */
const MIN_WIDTH = 14;

function daysBetween(a: string, b: string): number {
  return Math.max(0, (Date.parse(b) - Date.parse(a)) / DAY_MS);
}

/**
 * Lay the series out as duration-weighted steps rather than evenly spaced
 * points, so a price that held for a month reads wider than one that held a
 * day. Most series have only two or three points, where even spacing would
 * imply a trend that is not there.
 */
export function buildSegments(
  points: PricePoint[],
  field: PriceField,
  today: string,
): { segments: PriceSegment[]; max: number } {
  const values = points
    .map((p) => p[field])
    .filter((v): v is number => typeof v === "number");
  const max = Math.max(...values, 0) || 1;

  const spans = points.map((p, i) => {
    const end = i < points.length - 1 ? points[i + 1].date : today;
    return { start: p.date, end, days: daysBetween(p.date, end) };
  });

  const total = spans.reduce((sum, s) => sum + s.days, 0);
  const floor = Math.min(MIN_WIDTH, 60 / points.length);
  const free = 100 - floor * points.length;

  return {
    max,
    segments: points.map((point, i) => {
      const value = typeof point[field] === "number" ? point[field] : null;
      return {
        point,
        value,
        width:
          total > 0
            ? floor + (free * spans[i].days) / total
            : 100 / points.length,
        height: value != null ? Math.max((value / max) * 100, 2) : 0,
        start: spans[i].start,
        end: spans[i].end,
        isLast: i === points.length - 1,
      };
    }),
  };
}
