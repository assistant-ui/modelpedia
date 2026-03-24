import type { Model } from "@modelpedia/data";
import { allModels, providers } from "@modelpedia/data";

// ── Filter ──

export interface FilterParams {
  provider?: string;
  family?: string;
  creator?: string;
  status?: string;
  capability?: string;
  model_type?: string;
  q?: string;
}

export function filterModels(models: Model[], params: FilterParams): Model[] {
  let result = models;

  if (params.provider)
    result = result.filter((m) => m.provider === params.provider);
  if (params.family) result = result.filter((m) => m.family === params.family);
  if (params.creator)
    result = result.filter((m) => m.created_by === params.creator);
  if (params.status) result = result.filter((m) => m.status === params.status);
  if (params.model_type)
    result = result.filter((m) => m.model_type === params.model_type);
  if (params.capability) {
    result = result.filter(
      (m) => m.capabilities?.[params.capability as keyof typeof m.capabilities],
    );
  }
  if (params.q) {
    const q = params.q.toLowerCase();
    result = result.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.description?.toLowerCase().includes(q) ||
        m.family?.toLowerCase().includes(q) ||
        m.created_by?.toLowerCase().includes(q),
    );
  }

  return result;
}

// ── Sort ──

export type SortField =
  | "price_input"
  | "price_output"
  | "context_window"
  | "name";

export function sortModels(
  models: Model[],
  sort: SortField,
  order: 1 | -1 = 1,
): Model[] {
  return models.sort((a, b) => {
    let va: number | string | undefined;
    let vb: number | string | undefined;
    if (sort === "price_input") {
      va = a.pricing?.input ?? undefined;
      vb = b.pricing?.input ?? undefined;
    } else if (sort === "price_output") {
      va = a.pricing?.output ?? undefined;
      vb = b.pricing?.output ?? undefined;
    } else if (sort === "context_window") {
      va = a.context_window ?? undefined;
      vb = b.context_window ?? undefined;
    } else if (sort === "name") {
      va = a.name.toLowerCase();
      vb = b.name.toLowerCase();
    }
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return va < vb ? -order : va > vb ? order : 0;
  });
}

// ── Aggregation ──

export interface AggEntry {
  name: string;
  model_count: number;
  provider_count: number;
}

export function aggregateByKey(
  models: Model[],
  keyFn: (m: Model) => string | string[] | undefined,
): AggEntry[] {
  const map = new Map<string, { count: number; providers: Set<string> }>();

  for (const m of models) {
    const keys = keyFn(m);
    if (keys == null) continue;
    const arr = Array.isArray(keys) ? keys : [keys];
    for (const key of arr) {
      if (!key) continue;
      const entry = map.get(key) ?? { count: 0, providers: new Set() };
      entry.count++;
      entry.providers.add(m.provider);
      map.set(key, entry);
    }
  }

  return [...map.entries()]
    .map(([name, info]) => ({
      name,
      model_count: info.count,
      provider_count: info.providers.size,
    }))
    .sort((a, b) => b.model_count - a.model_count);
}

export function aggregateCapabilities(models: Model[]): AggEntry[] {
  return aggregateByKey(models, (m) => {
    if (!m.capabilities) return undefined;
    return Object.entries(m.capabilities)
      .filter(([, v]) => v)
      .map(([k]) => k);
  });
}

export function aggregateFamilies(models: Model[]) {
  const map = new Map<
    string,
    { count: number; providers: Set<string>; creators: Set<string> }
  >();

  for (const m of models) {
    if (!m.family) continue;
    const entry = map.get(m.family) ?? {
      count: 0,
      providers: new Set(),
      creators: new Set(),
    };
    entry.count++;
    entry.providers.add(m.provider);
    if (m.created_by) entry.creators.add(m.created_by);
    map.set(m.family, entry);
  }

  return [...map.entries()]
    .map(([name, info]) => ({
      name,
      model_count: info.count,
      providers: [...info.providers],
      creators: [...info.creators],
    }))
    .sort((a, b) => b.model_count - a.model_count);
}

// ── Search ──

export function searchAll(q: string, limit = 20) {
  const query = q.toLowerCase();

  const matchedProviders = providers
    .filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.id.toLowerCase().includes(query),
    )
    .slice(0, 5)
    .map((p) => ({ type: "provider" as const, id: p.id, name: p.name }));

  const matchedModels = allModels
    .filter(
      (m) =>
        m.id.toLowerCase().includes(query) ||
        m.name.toLowerCase().includes(query) ||
        m.family?.toLowerCase().includes(query),
    )
    .slice(0, limit)
    .map((m) => ({
      type: "model" as const,
      id: `${m.provider}/${m.id}`,
      name: m.name,
      provider: m.provider,
    }));

  return { providers: matchedProviders, models: matchedModels };
}

// ── Pricing comparison ──

export function comparePricing(
  models: Model[],
  params: {
    min_price_input?: number;
    max_price_input?: number;
    sort?: "price_input" | "price_output";
    order?: 1 | -1;
    limit?: number;
    offset?: number;
  },
) {
  let filtered = models;

  if (params.min_price_input && params.min_price_input > 0) {
    filtered = filtered.filter(
      (m) => (m.pricing?.input ?? 0) >= params.min_price_input!,
    );
  }
  if (params.max_price_input && params.max_price_input > 0) {
    filtered = filtered.filter(
      (m) =>
        m.pricing?.input != null && m.pricing.input <= params.max_price_input!,
    );
  }

  sortModels(filtered, params.sort ?? "price_input", params.order ?? 1);

  const limit = params.limit ?? 20;
  const offset = params.offset ?? 0;

  return {
    items: filtered.slice(offset, offset + limit).map((m) => ({
      id: `${m.provider}/${m.id}`,
      name: m.name,
      provider: m.provider,
      model_type: m.model_type,
      pricing: m.pricing,
      context_window: m.context_window,
    })),
    total: filtered.length,
  };
}
