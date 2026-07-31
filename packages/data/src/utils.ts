import { allModels, providers } from "./data";
import { priceHistory } from "./price-history";
import type { Model, PricePoint, ProviderWithModels } from "./types";

export function getModel(provider: string, id: string): Model | undefined {
  return allModels.find((m) => m.provider === provider && m.id === id);
}

export function getModelsByProvider(provider: string): Model[] {
  return allModels.filter((m) => m.provider === provider);
}

export function getActiveModels(): Model[] {
  return allModels.filter((m) => m.status !== "deprecated");
}

export function getModelsByFamily(family: string): Model[] {
  return allModels.filter((m) => m.family === family);
}

export function getModelsByCreator(creator: string): Model[] {
  return allModels.filter((m) => m.created_by === creator);
}

export function getProvider(id: string): ProviderWithModels | undefined {
  return (
    providers.find((p) => p.id === id) ??
    providers.find((p) => p.aliases?.includes(id))
  );
}

export function getAllProviders(): ProviderWithModels[] {
  return providers;
}

/** Get the inline SVG icon string for a provider. */
export function getProviderIcon(id: string): string | undefined {
  return providers.find((p) => p.id === id)?.icon;
}

/**
 * Price steps for a model, oldest first, or undefined if its price never moved.
 * Snapshots fall back to their alias, mirroring how they inherit pricing.
 */
export function getPriceHistory(
  provider: string,
  id: string,
): PricePoint[] | undefined {
  const own = priceHistory[`${provider}/${id}`];
  if (own) return own;
  const alias = getModel(provider, id)?.alias;
  return alias ? priceHistory[`${provider}/${alias}`] : undefined;
}

/** Every model whose price moved on or after `since` (YYYY-MM-DD). */
export function getPriceChanges(
  since?: string,
): Array<{ provider: string; model: string; points: PricePoint[] }> {
  const out: Array<{ provider: string; model: string; points: PricePoint[] }> =
    [];
  for (const [key, points] of Object.entries(priceHistory)) {
    const last = points[points.length - 1];
    if (since && last.date < since) continue;
    const slash = key.indexOf("/");
    out.push({
      provider: key.slice(0, slash),
      model: key.slice(slash + 1),
      points,
    });
  }
  return out.sort(
    (a, b) =>
      b.points[b.points.length - 1].date.localeCompare(
        a.points[a.points.length - 1].date,
      ) || a.model.localeCompare(b.model),
  );
}
