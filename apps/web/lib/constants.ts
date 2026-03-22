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

export const REASONING_LABELS = [
  "",
  "Basic",
  "Moderate",
  "Strong",
  "Advanced",
  "Frontier",
];

/**
 * Provider search ranking tiers.
 * Direct providers (original model creators) rank highest.
 * Cloud platforms rank above aggregators.
 * Aggregators/gateways rank lowest to avoid duplicates dominating results.
 */
export const PROVIDER_TIER: Record<string, number> = {
  // Direct providers: +15
  openai: 15,
  anthropic: 15,
  google: 15,
  mistral: 15,
  deepseek: 15,
  xai: 15,
  cohere: 15,
  meta: 15,
  minimax: 15,
  alibaba: 15,
  qwen: 15,
  moonshot: 15,
  zai: 15,
  perplexity: 15,
  // Cloud platforms: +5
  azure: 5,
  vertex: 5,
  amazon: 5,
  // Aggregators/gateways: 0 (default)
};

/** @deprecated Use PROVIDER_TIER instead */
export const OFFICIAL_PROVIDERS = new Set(
  Object.entries(PROVIDER_TIER)
    .filter(([, v]) => v >= 15)
    .map(([k]) => k),
);
