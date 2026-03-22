/** Format token count as human-readable string (e.g. 128000 → "128K") */
export function formatTokens(n: number): string {
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(n);
}

/** Format ISO timestamp as localized date string */
export function formatDate(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format unknown value for display in change diffs */
export function formatValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  if (typeof v === "boolean") return v ? "yes" : "no";
  return JSON.stringify(v);
}

/** Format a price value as a dollar string, max 2 decimal places, or dash for null */
export function formatPrice(value: number | null | undefined): string {
  if (value == null) return "—";
  // Round to avoid floating point artifacts (e.g. 1.6300000000000001 → 1.63)
  const rounded = Math.round(value * 100) / 100;
  return `$${rounded}`;
}

/** Convert ISO 3166-1 alpha-2 region code to flag emoji */
export function regionFlag(region: string): string {
  const code = region.toUpperCase();
  if (code.length !== 2) return region;
  return String.fromCodePoint(
    ...code.split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65),
  );
}
