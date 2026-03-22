/**
 * Shared parsing utilities for fetch scripts.
 * Eliminates repeated HTML/Markdown parsing, price extraction, etc.
 */

// ── HTTP ──

/** Fetch a URL and return text content. Throws on non-OK status. */
export async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  return res.text();
}

/** Fetch a URL and return parsed JSON. */
export async function fetchJson<T = unknown>(
  url: string,
  headers?: Record<string, string>,
): Promise<T> {
  const res = await fetch(url, headers ? { headers } : undefined);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
  return res.json() as Promise<T>;
}

// ── HTML ──

/** Strip all HTML tags and normalize whitespace. */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Parse an HTML table into rows of cell strings (stripped of tags). */
export function parseHtmlTable(tableHtml: string): string[][] {
  const rows = [...tableHtml.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)];
  return rows.map((row) => {
    return [...row[1].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/g)].map((c) =>
      stripHtml(c[1]),
    );
  });
}

/** Extract all HTML tables from a page, each as rows of cells. */
export function parseAllHtmlTables(html: string): string[][][] {
  const tables = [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)];
  return tables.map((t) => parseHtmlTable(t[1]));
}

/** Find all HTML tables, returning raw HTML + parsed rows. */
export function findHtmlTables(
  html: string,
): { raw: string; rows: string[][] }[] {
  return [...html.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)].map((m) => ({
    raw: m[0],
    rows: parseHtmlTable(m[1]),
  }));
}

// ── Markdown ──

/**
 * Parse a markdown table into array of objects.
 * Handles `| col1 | col2 |` format. First row is headers.
 */
export function parseMdTable(md: string): Record<string, string>[] {
  const lines = md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("|"));
  if (lines.length < 3) return []; // header + separator + at least 1 row

  const headers = lines[0]
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

  // Skip separator line (|---|---|)
  const dataLines = lines.slice(2);

  return dataLines.map((line) => {
    const cells = line
      .split("|")
      .map((s) => s.trim())
      .filter((_, i, a) => i > 0 && i < a.length); // drop empty first/last
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = cells[i] ?? "";
    });
    return obj;
  });
}

/**
 * Split markdown into sections by headings.
 * Returns array of { level, title, content }.
 */
export function parseMdSections(
  md: string,
): { level: number; title: string; content: string }[] {
  const sections: { level: number; title: string; content: string }[] = [];
  const parts = md.split(/^(#{1,6})\s+(.+)$/m);

  for (let i = 1; i < parts.length; i += 3) {
    const level = parts[i].length;
    const title = parts[i + 1]?.trim() ?? "";
    const content = parts[i + 2]?.trim() ?? "";
    sections.push({ level, title, content });
  }
  return sections;
}

// ── Price extraction ──

/** Extract a dollar amount from text. Returns number or undefined. */
export function extractPrice(text: string): number | undefined {
  const m = text.match(/\$([\d,.]+)/);
  if (!m) return undefined;
  return Number(m[1].replace(/,/g, ""));
}

/** Extract all dollar amounts from text. */
export function extractAllPrices(text: string): number[] {
  return [...text.matchAll(/\$([\d,.]+)/g)].map((m) =>
    Number(m[1].replace(/,/g, "")),
  );
}

/**
 * Parse a price string like "$2.5 / 1M tokens" or "$0.50" into a number.
 * Alias for extractPrice — kept for call-site readability.
 */
export const parsePrice = extractPrice;

// ── Token counts ──

/** Parse token count strings like "128K", "1M", "200,000", "1048576". */
export function parseTokenCount(text: string): number | undefined {
  const cleaned = text.replace(/,/g, "").trim();
  const m = cleaned.match(/([\d.]+)\s*([KkMm])?/);
  if (!m) return undefined;
  const num = Number(m[1]);
  if (m[2] === "K" || m[2] === "k") return num * 1000;
  if (m[2] === "M" || m[2] === "m") return num * 1_000_000;
  return num;
}

// ── Date extraction ──

/** Extract a date-like string from text (e.g. "October 2024", "2024-10-01"). */
export function extractDate(text: string): string | undefined {
  // YYYY-MM-DD
  const iso = text.match(/\d{4}-\d{2}-\d{2}/);
  if (iso) return iso[0];
  // Month YYYY
  const monthYear = text.match(
    /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w*\s+\d{4}/i,
  );
  if (monthYear) return monthYear[0];
  return undefined;
}

// ── HTML page helpers ──

/** Find the nearest heading (h2-h6) before a position in HTML. */
export function findPrecedingHeading(
  html: string,
  position: number,
  maxLookback = 500,
): string | undefined {
  const before = html.slice(Math.max(0, position - maxLookback), position);
  const headings = [...before.matchAll(/<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/g)];
  if (headings.length === 0) return undefined;
  return stripHtml(headings[headings.length - 1][1]);
}

/** Extract all heading IDs and their text from HTML. */
export function extractHeadings(
  html: string,
): { id: string; text: string; index: number }[] {
  return [
    ...html.matchAll(/<h[2-6][^>]*id="([^"]*)"[^>]*>([\s\S]*?)<\/h[2-6]>/g),
  ].map((m) => ({
    id: m[1],
    text: stripHtml(m[2]),
    index: m.index!,
  }));
}

/**
 * Split HTML into sections by heading IDs.
 * Returns a map of heading ID → section content (HTML between this heading and the next).
 */
export function splitByHeadings(
  html: string,
  filter?: (id: string) => boolean,
): Map<string, string> {
  const headings = extractHeadings(html);
  const filtered = filter ? headings.filter((h) => filter(h.id)) : headings;
  const map = new Map<string, string>();

  for (let i = 0; i < filtered.length; i++) {
    const start = filtered[i].index;
    const end = i + 1 < filtered.length ? filtered[i + 1].index : html.length;
    map.set(filtered[i].id, html.slice(start, end));
  }
  return map;
}
