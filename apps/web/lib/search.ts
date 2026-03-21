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

/** Normalize model IDs for cross-provider comparison */
export function normalizeModelId(id: string): string {
  return id
    .toLowerCase()
    .replace(/[@/]/g, "-")
    .replace(/-(?:vertex|bedrock|azure)$/, "")
    .replace(/^(?:openai-|meta-|anthropic-|google-)/, "")
    .replace(/-/g, "");
}
