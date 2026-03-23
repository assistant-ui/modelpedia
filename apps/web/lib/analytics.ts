import type { Model, ProviderWithModels } from "./data";

/** Minimal model for detail panel (serializable) */
export interface AnalyticsModel {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  providerIcon?: string;
  region?: string;
  input?: number;
  output?: number;
  performance?: number;
  context_window?: number;
  release_date?: string;
  open_weight?: boolean;
  model_type?: string;
  license?: string;
  family?: string;
  modalities_input?: string[];
  modalities_output?: string[];
  caps: string[];
}

/** Scatter point: price vs intelligence */
export interface PriceVsIntelligencePoint {
  id: string;
  name: string;
  provider: string;
  providerName: string;
  input: number;
  performance: number;
}

/** Monthly release count */
export interface ReleaseMonth {
  month: string; // YYYY-MM
  count: number;
}

/** Monthly max context window */
export interface ContextMonth {
  month: string;
  maxContext: number;
}

/** Provider capability row */
export interface CapabilityRow {
  provider: string;
  providerName: string;
  icon?: string;
  caps: Record<string, number>; // capability key → % of models with it
  modelCount: number;
}

/** Price bucket */
export interface PriceBucket {
  label: string;
  count: number;
}

/** Monthly open weight trend */
export interface OpenWeightMonth {
  month: string;
  open: number;
  proprietary: number;
}

export interface ReleaseSummary {
  total: number;
  avgPerMonth: number;
  peakMonth: string;
  peakCount: number;
}

export interface ContextSummary {
  currentMax: number;
  growthFactor: number;
}

export interface OpenWeightSummary {
  openTotal: number;
  proprietaryTotal: number;
  openPct: number;
}

export interface PriceSummary {
  totalPriced: number;
  medianRange: string;
}

export interface ModelTypeCount {
  type: string;
  count: number;
}

export interface ParamsMonth {
  month: string;
  maxParams: number;
  avgParams: number;
}

export interface PricingMonth {
  month: string;
  medianInput: number;
  count: number;
}

export interface LicenseCount {
  license: string;
  count: number;
}

export interface FamilyCount {
  family: string;
  count: number;
  provider: string;
}

export interface ProviderModelCount {
  provider: string;
  providerName: string;
  icon?: string;
  count: number;
}

export interface ContextBucket {
  label: string;
  count: number;
}

export interface ModalityCombo {
  input: string;
  output: string;
  count: number;
}

export interface ProviderGeo {
  region: string;
  headquarters: string;
  providers: { id: string; name: string; icon?: string; modelCount: number }[];
}

export interface AnalyticsData {
  providerGeo: ProviderGeo[];
  priceVsIntelligence: PriceVsIntelligencePoint[];
  releaseTimeline: ReleaseMonth[];
  releaseSummary: ReleaseSummary;
  contextTimeline: ContextMonth[];
  contextSummary: ContextSummary;
  capabilityHeatmap: CapabilityRow[];
  priceDistribution: PriceBucket[];
  priceSummary: PriceSummary;
  openWeightTrend: OpenWeightMonth[];
  openWeightSummary: OpenWeightSummary;
  modelTypeDistribution: ModelTypeCount[];
  paramsTrend: ParamsMonth[];
  pricingTrend: PricingMonth[];
  licenseDistribution: LicenseCount[];
  topFamilies: FamilyCount[];
  providerRanking: ProviderModelCount[];
  contextDistribution: ContextBucket[];
  modalityCoverage: ModalityCombo[];
  models: AnalyticsModel[];
}

/** Selection state for detail panel */
export type Selection =
  | { type: "model"; id: string }
  | {
      type: "month";
      month: string;
      chart: "releases" | "context" | "openweight";
    }
  | { type: "capability"; provider: string; cap: string }
  | { type: "price"; label: string }
  | { type: "region"; region: string }
  | { type: "modelType"; modelType: string }
  | { type: "license"; license: string }
  | { type: "family"; family: string }
  | { type: "providerRank"; provider: string }
  | { type: "contextRange"; label: string }
  | { type: "modality"; input: string; output: string };

const CAP_KEYS = [
  "vision",
  "tool_call",
  "reasoning",
  "streaming",
  "structured_output",
  "fine_tuning",
] as const;

export function computeAnalytics(
  models: Model[],
  providers: ProviderWithModels[],
): AnalyticsData {
  const providerMap = new Map(providers.map((p) => [p.id, p]));
  const directProviderIds = new Set(
    providers.filter((p) => p.type === "direct").map((p) => p.id),
  );
  // Provider geo distribution (direct only)
  const geoMap = new Map<string, ProviderGeo>();
  for (const p of providers) {
    if (p.type !== "direct") continue;
    const key = p.headquarters ?? p.region;
    const entry = geoMap.get(key) ?? {
      region: p.region,
      headquarters: key,
      providers: [],
    };
    entry.providers.push({
      id: p.id,
      name: p.name,
      icon: p.icon,
      modelCount: p.models.filter((m) => m.status !== "deprecated" && !m.alias)
        .length,
    });
    geoMap.set(key, entry);
  }
  const providerGeo = [...geoMap.values()].sort(
    (a, b) =>
      b.providers.reduce((s, p) => s + p.modelCount, 0) -
      a.providers.reduce((s, p) => s + p.modelCount, 0),
  );

  // All charts use direct providers only
  const active = models.filter(
    (m) =>
      m.status !== "deprecated" &&
      !m.alias &&
      directProviderIds.has(m.provider),
  );

  // 1. Price vs Intelligence
  const priceVsIntelligence = active
    .filter((m) => m.pricing?.input != null && m.performance != null)
    .map((m) => ({
      id: `${m.provider}/${m.id}`,
      name: m.name,
      provider: m.provider,
      providerName: providerMap.get(m.provider)?.name ?? m.provider,
      input: m.pricing!.input!,
      performance: m.performance!,
    }));

  // 2. Release timeline (by month)
  const releaseCounts = new Map<string, number>();
  for (const m of active) {
    if (!m.release_date) continue;
    const month = m.release_date.slice(0, 7); // YYYY-MM
    releaseCounts.set(month, (releaseCounts.get(month) ?? 0) + 1);
  }
  const releaseTimeline = [...releaseCounts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18) // last 18 months
    .map(([month, count]) => ({ month, count }));

  // 3. Context window evolution (max per month)
  const contextByMonth = new Map<string, number>();
  for (const m of active) {
    if (!m.release_date || !m.context_window) continue;
    const month = m.release_date.slice(0, 7);
    contextByMonth.set(
      month,
      Math.max(contextByMonth.get(month) ?? 0, m.context_window),
    );
  }
  // Running max
  let runningMax = 0;
  const contextTimeline = [...contextByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([month, maxCtx]) => {
      runningMax = Math.max(runningMax, maxCtx);
      return { month, maxContext: runningMax };
    });

  // 4. Capability heatmap (direct providers only)
  const capabilityHeatmap: CapabilityRow[] = providers
    .filter((p) => p.type === "direct")
    .map((p) => {
      const pModels = p.models.filter(
        (m) => m.status !== "deprecated" && !m.alias,
      );
      const caps: Record<string, number> = {};
      for (const key of CAP_KEYS) {
        const count = pModels.filter((m) => m.capabilities?.[key]).length;
        caps[key] =
          pModels.length > 0 ? Math.round((count / pModels.length) * 100) : 0;
      }
      return {
        provider: p.id,
        providerName: p.name,
        icon: p.icon,
        caps,
        modelCount: pModels.length,
      };
    })
    .filter((r) => r.modelCount > 0)
    .sort((a, b) => b.modelCount - a.modelCount);

  // 5. Price distribution (input price buckets)
  const BUCKETS = [
    { label: "Free", min: 0, max: 0 },
    { label: "<$0.5", min: 0.001, max: 0.5 },
    { label: "$0.5–2", min: 0.5, max: 2 },
    { label: "$2–5", min: 2, max: 5 },
    { label: "$5–15", min: 5, max: 15 },
    { label: "$15–30", min: 15, max: 30 },
    { label: "$30+", min: 30, max: Infinity },
  ];
  const priceDist = BUCKETS.map((b) => ({ ...b, count: 0 }));
  for (const m of active) {
    const price = m.pricing?.input;
    if (price == null) continue;
    for (const b of priceDist) {
      if (price >= b.min && price < b.max) {
        b.count++;
        break;
      }
    }
  }
  // Handle exact 0
  for (const m of active) {
    if (m.pricing?.input === 0) {
      priceDist[0].count++;
    }
  }
  const priceDistribution = priceDist.map(({ label, count }) => ({
    label,
    count,
  }));

  // 6. Open weight trend (by month)
  const openByMonth = new Map<string, { open: number; proprietary: number }>();
  for (const m of active) {
    if (!m.release_date) continue;
    const month = m.release_date.slice(0, 7);
    const entry = openByMonth.get(month) ?? { open: 0, proprietary: 0 };
    if (m.open_weight) {
      entry.open++;
    } else {
      entry.proprietary++;
    }
    openByMonth.set(month, entry);
  }
  const openWeightTrend = [...openByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([month, data]) => ({ month, ...data }));

  // 7. Model type distribution
  const typeMap = new Map<string, number>();
  for (const m of active) {
    const t = m.model_type ?? "other";
    typeMap.set(t, (typeMap.get(t) ?? 0) + 1);
  }
  const typeSorted = [...typeMap.entries()].sort(([, a], [, b]) => b - a);
  let otherCount = 0;
  const modelTypeDistribution: ModelTypeCount[] = [];
  for (const [type, count] of typeSorted) {
    if (count < 3) {
      otherCount += count;
    } else {
      modelTypeDistribution.push({ type, count });
    }
  }
  if (otherCount > 0) {
    modelTypeDistribution.push({ type: "other", count: otherCount });
  }

  // 8. Parameters trend (max & avg per month, last 18 months)
  const paramsByMonth = new Map<string, number[]>();
  for (const m of active) {
    if (!m.release_date || m.parameters == null) continue;
    const month = m.release_date.slice(0, 7);
    const arr = paramsByMonth.get(month) ?? [];
    arr.push(m.parameters);
    paramsByMonth.set(month, arr);
  }
  const paramsTrend: ParamsMonth[] = [...paramsByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([month, params]) => ({
      month,
      maxParams: Math.max(...params),
      avgParams: Math.round(params.reduce((s, v) => s + v, 0) / params.length),
    }));

  // 9. Pricing trend (median input price per month, last 18 months)
  const pricesByMonth = new Map<string, number[]>();
  for (const m of active) {
    if (!m.release_date || m.pricing?.input == null) continue;
    const month = m.release_date.slice(0, 7);
    const arr = pricesByMonth.get(month) ?? [];
    arr.push(m.pricing.input);
    pricesByMonth.set(month, arr);
  }
  const pricingTrend: PricingMonth[] = [...pricesByMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-18)
    .map(([month, prices]) => {
      const sorted = [...prices].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      const median =
        sorted.length % 2 === 0
          ? (sorted[mid - 1] + sorted[mid]) / 2
          : sorted[mid];
      return {
        month,
        medianInput: Math.round(median * 100) / 100,
        count: prices.length,
      };
    });

  // 10. License distribution (top 10 + "other")
  const licenseMap = new Map<string, number>();
  for (const m of active) {
    if (!m.license) continue;
    licenseMap.set(m.license, (licenseMap.get(m.license) ?? 0) + 1);
  }
  const licenseSorted = [...licenseMap.entries()].sort(([, a], [, b]) => b - a);
  const licenseDistribution: LicenseCount[] = licenseSorted
    .slice(0, 10)
    .map(([license, count]) => ({ license, count }));
  const licenseRest = licenseSorted.slice(10).reduce((s, [, c]) => s + c, 0);
  if (licenseRest > 0) {
    licenseDistribution.push({ license: "other", count: licenseRest });
  }

  // 11. Top families (top 15 by count)
  const familyMap = new Map<string, { count: number; provider: string }>();
  for (const m of active) {
    if (!m.family) continue;
    const entry = familyMap.get(m.family) ?? { count: 0, provider: m.provider };
    entry.count++;
    familyMap.set(m.family, entry);
  }
  const topFamilies: FamilyCount[] = [...familyMap.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .slice(0, 15)
    .map(([family, { count, provider }]) => ({
      family,
      count,
      provider: providerMap.get(provider)?.name ?? provider,
    }));

  // 12. Provider ranking (by active direct model count)
  const providerCountMap = new Map<string, number>();
  for (const m of active) {
    providerCountMap.set(
      m.provider,
      (providerCountMap.get(m.provider) ?? 0) + 1,
    );
  }
  const providerRanking: ProviderModelCount[] = [...providerCountMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([provider, count]) => ({
      provider,
      providerName: providerMap.get(provider)?.name ?? provider,
      icon: providerMap.get(provider)?.icon,
      count,
    }));

  // 13. Context window distribution (buckets)
  const CTX_BUCKETS = [
    { label: "<8K", min: 0, max: 8_000 },
    { label: "8-32K", min: 8_000, max: 32_000 },
    { label: "32-128K", min: 32_000, max: 128_000 },
    { label: "128-512K", min: 128_000, max: 512_000 },
    { label: "512K-1M", min: 512_000, max: 1_000_000 },
    { label: "1M+", min: 1_000_000, max: Infinity },
  ];
  const ctxDist = CTX_BUCKETS.map((b) => ({ ...b, count: 0 }));
  for (const m of active) {
    if (m.context_window == null) continue;
    for (const b of ctxDist) {
      if (m.context_window >= b.min && m.context_window < b.max) {
        b.count++;
        break;
      }
    }
  }
  const contextDistribution: ContextBucket[] = ctxDist.map(
    ({ label, count }) => ({ label, count }),
  );

  // 14. Modality coverage (unique input→output combos, top 10)
  const modalityMap = new Map<string, number>();
  for (const m of active) {
    if (!m.modalities?.input?.length || !m.modalities?.output?.length) continue;
    const inputKey = [...m.modalities.input].sort().join("+");
    const outputKey = [...m.modalities.output].sort().join("+");
    const key = `${inputKey}→${outputKey}`;
    modalityMap.set(key, (modalityMap.get(key) ?? 0) + 1);
  }
  const modalityCoverage: ModalityCombo[] = [...modalityMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([key, count]) => {
      const [input, output] = key.split("→");
      return { input, output, count };
    });

  // Minimal model list for detail panel
  const analyticsModels: AnalyticsModel[] = active.map((m) => ({
    id: `${m.provider}/${m.id}`,
    name: m.name,
    provider: m.provider,
    providerName: providerMap.get(m.provider)?.name ?? m.provider,
    providerIcon: providerMap.get(m.provider)?.icon,
    region: providerMap.get(m.provider)?.region,
    input: m.pricing?.input ?? undefined,
    output: m.pricing?.output ?? undefined,
    performance: m.performance ?? undefined,
    context_window: m.context_window ?? undefined,
    release_date: m.release_date ?? undefined,
    open_weight: m.open_weight ?? undefined,
    model_type: (m.model_type as string) ?? undefined,
    license: (m.license as string) ?? undefined,
    family: (m.family as string) ?? undefined,
    modalities_input: m.modalities?.input as string[] | undefined,
    modalities_output: m.modalities?.output as string[] | undefined,
    caps: CAP_KEYS.filter((k) => m.capabilities?.[k]),
  }));

  // ── Summaries ──

  // Release summary
  const releaseTotal = releaseTimeline.reduce((s, d) => s + d.count, 0);
  const peakRelease = releaseTimeline.reduce(
    (best, d) => (d.count > best.count ? d : best),
    releaseTimeline[0] ?? { month: "—", count: 0 },
  );
  const releaseSummary: ReleaseSummary = {
    total: releaseTotal,
    avgPerMonth:
      releaseTimeline.length > 0
        ? Math.round(releaseTotal / releaseTimeline.length)
        : 0,
    peakMonth: peakRelease.month,
    peakCount: peakRelease.count,
  };

  // Context summary
  const ctxFirst = contextTimeline[0]?.maxContext ?? 1;
  const ctxLast = contextTimeline[contextTimeline.length - 1]?.maxContext ?? 1;
  const contextSummary: ContextSummary = {
    currentMax: ctxLast,
    growthFactor: Math.round((ctxLast / ctxFirst) * 10) / 10,
  };

  // Open weight summary
  const openTotal = openWeightTrend.reduce((s, d) => s + d.open, 0);
  const propTotal = openWeightTrend.reduce((s, d) => s + d.proprietary, 0);
  const owTotal = openTotal + propTotal;
  const openWeightSummary: OpenWeightSummary = {
    openTotal,
    proprietaryTotal: propTotal,
    openPct: owTotal > 0 ? Math.round((openTotal / owTotal) * 100) : 0,
  };

  // Price summary
  const totalPriced = priceDistribution.reduce((s, d) => s + d.count, 0);
  let cumulative = 0;
  let medianRange = priceDistribution[0]?.label ?? "—";
  for (const b of priceDistribution) {
    cumulative += b.count;
    if (cumulative >= totalPriced / 2) {
      medianRange = b.label;
      break;
    }
  }
  const priceSummary: PriceSummary = { totalPriced, medianRange };

  return {
    providerGeo,
    priceVsIntelligence,
    releaseTimeline,
    releaseSummary,
    contextTimeline,
    contextSummary,
    capabilityHeatmap,
    priceDistribution,
    priceSummary,
    openWeightTrend,
    openWeightSummary,
    modelTypeDistribution,
    paramsTrend,
    pricingTrend,
    licenseDistribution,
    topFamilies,
    providerRanking,
    contextDistribution,
    modalityCoverage,
    models: analyticsModels,
  };
}
