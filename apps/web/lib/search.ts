/** Fuzzy match a pattern against text, returning a score or -1 if no match */
export function fuzzyMatch(text: string, pattern: string): number {
  let ti = 0;
  let pi = 0;
  let score = 0;
  let consecutive = 0;
  while (ti < text.length && pi < pattern.length) {
    if (text[ti] === pattern[pi]) {
      score += 1 + consecutive;
      consecutive++;
      pi++;
      if (
        ti === 0 ||
        text[ti - 1] === "-" ||
        text[ti - 1] === " " ||
        text[ti - 1] === "/"
      ) {
        score += 3;
      }
    } else {
      consecutive = 0;
    }
    ti++;
  }
  return pi === pattern.length ? score : -1;
}

/**
 * Multi-term fuzzy search. Splits query by whitespace, requires all terms
 * to fuzzy-match against the target string. Returns items sorted by score.
 */
export function multiSearch<T>(
  items: T[],
  query: string,
  options: {
    target: (item: T) => string;
    bonus?: (item: T) => number;
    limit?: number;
  },
): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return [];

  const results: { item: T; score: number }[] = [];
  for (const item of items) {
    const target = options.target(item).toLowerCase();
    let total = 0;
    let allMatch = true;
    for (const term of terms) {
      const s = fuzzyMatch(target, term);
      if (s < 0) {
        allMatch = false;
        break;
      }
      total += s;
    }
    if (allMatch) {
      results.push({ item, score: total + (options.bonus?.(item) ?? 0) });
    }
  }

  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, options.limit ?? 20)
    .map((r) => r.item);
}

/** Normalize model IDs for cross-provider comparison */
export function normalizeModelId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[@/]/g, "-")
    .replace(/-(?:vertex|bedrock|azure)$/, "")
    .replace(/^(?:openai-|meta-|anthropic-|google-)/, "")
    .replace(/-/g, "");
}
