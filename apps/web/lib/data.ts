/**
 * Re-export the model data from the workspace data package.
 * Explicit type annotations prevent literal union types from leaking
 * when Turbopack resolves through the workspace symlink to source.
 */

import type { Model, ProviderWithModels } from "ai-model";
import {
  allModels as _allModels,
  getModel as _getModel,
  getProvider as _getProvider,
  providers as _providers,
  getActiveModels,
  getAllProviders,
  getModelsByCreator,
  getModelsByFamily,
  getModelsByProvider,
} from "ai-model";

export type { Model, ModelData, Provider, ProviderWithModels } from "ai-model";

export const allModels: Model[] = _allModels;
export const providers: ProviderWithModels[] = _providers;
export function getModel(provider: string, id: string): Model | undefined {
  const decoded = decodeURIComponent(id);
  // Direct match first
  const direct = _getModel(provider, decoded);
  if (direct) return direct;
  // Fallback: search by snapshot ID → find the alias model that lists it
  return allModels.find(
    (m) => m.provider === provider && m.snapshots?.includes(decoded),
  );
}
export const getProvider: (id: string) => ProviderWithModels | undefined =
  _getProvider;
export {
  getActiveModels,
  getAllProviders,
  getModelsByCreator,
  getModelsByFamily,
  getModelsByProvider,
};

/**
 * Fields that can be inherited from the creator's canonical model.
 * Excludes identity fields (id, name, provider, source, etc.).
 */
const INHERITABLE_FIELDS = [
  "description",
  "status",
  "context_window",
  "max_output_tokens",
  "max_input_tokens",
  "pricing",
  "performance",
  "speed",
  "knowledge_cutoff",
  "release_date",
  "deprecation_date",
  "model_type",
  "reasoning_tokens",
] as const;

export interface EnrichedModel extends Model {
  /** Fields that were inherited from the creator's canonical model */
  inheritedFields?: Set<string>;
  /** The creator provider's name (for display) */
  inheritedFrom?: string;
}

/**
 * Get a model with missing fields filled in from the creator's canonical version.
 * When created_by differs from provider, look up the same model ID under the creator.
 */
export function getModelWithInheritance(
  provider: string,
  id: string,
): EnrichedModel | undefined {
  const model = getModel(provider, id);
  if (!model) return undefined;

  // Only inherit if created_by differs from provider
  if (model.created_by === model.provider) return model;

  // Find the canonical model from the creator
  const canonical = _getModel(model.created_by, model.id);
  if (!canonical) return model;

  const enriched: EnrichedModel = { ...model };
  const inherited = new Set<string>();

  for (const field of INHERITABLE_FIELDS) {
    if (enriched[field] == null && canonical[field] != null) {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic field copy
      (enriched as any)[field] = canonical[field];
      inherited.add(field);
    }
  }

  // Merge capabilities: fill in missing capability flags
  if (canonical.capabilities) {
    const caps: Record<string, boolean> = { ...enriched.capabilities };
    for (const [key, val] of Object.entries(canonical.capabilities)) {
      if (caps[key] == null && val != null) {
        caps[key] = val;
        inherited.add(`capabilities.${key}`);
      }
    }
    enriched.capabilities = caps;
  }

  // Merge modalities if missing
  if (!enriched.modalities && canonical.modalities) {
    enriched.modalities = canonical.modalities;
    inherited.add("modalities");
  }

  if (inherited.size > 0) {
    enriched.inheritedFields = inherited;
    const creatorProvider = _getProvider(model.created_by);
    enriched.inheritedFrom = creatorProvider?.name ?? model.created_by;
  }

  return enriched;
}
