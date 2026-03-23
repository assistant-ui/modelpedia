export const CAP_LABELS: [string, string][] = [
  ["reasoning", "R"],
  ["vision", "V"],
  ["tool_call", "T"],
  ["streaming", "S"],
  ["structured_output", "J"],
  ["fine_tuning", "F"],
];

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

export const PROVIDER_TYPE_TIER: Record<string, number> = {
  direct: 15,
  cloud: 5,
  aggregator: 0,
};

export const TYPE_LABELS: Record<string, string> = {
  direct: "Model Provider",
  aggregator: "API Gateway",
  cloud: "Cloud Platform",
};
