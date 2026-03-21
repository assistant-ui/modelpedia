/** Capability labels used in model lists and badges: [key, shortLetter] */
export const CAP_LABELS: [string, string][] = [
  ["reasoning", "R"],
  ["vision", "V"],
  ["tool_call", "T"],
  ["streaming", "S"],
  ["structured_output", "J"],
  ["fine_tuning", "F"],
];

/** Compact capability badges for family comparison tables */
export const CAP_BADGES: [string, string][] = [
  ["reasoning", "R"],
  ["vision", "V"],
  ["tool_call", "T"],
  ["streaming", "S"],
];

export const SPEED_LABELS = [
  "",
  "Very slow",
  "Slow",
  "Normal",
  "Fast",
  "Very fast",
];

export const PERF_LABELS = [
  "",
  "Basic",
  "Good",
  "Strong",
  "Excellent",
  "Frontier",
];

/** Official/direct model providers (ranked higher in search) */
export const OFFICIAL_PROVIDERS = new Set([
  "openai",
  "anthropic",
  "google",
  "mistral",
  "deepseek",
  "xai",
  "cohere",
  "meta",
  "zhipu",
  "minimax",
  "alibaba",
  "qwen",
]);
