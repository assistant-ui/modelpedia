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
import { normalizeModelId } from "./search";

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

function inheritFields(
  enriched: EnrichedModel,
  source: Model,
  inherited: Set<string>,
) {
  for (const field of INHERITABLE_FIELDS) {
    if (enriched[field] == null && source[field] != null) {
      (enriched as any)[field] = source[field];
      inherited.add(field);
    }
  }
  if (source.capabilities) {
    const caps: Record<string, boolean> = { ...enriched.capabilities };
    for (const [key, val] of Object.entries(source.capabilities)) {
      if (caps[key] == null && val != null) {
        caps[key] = val;
        inherited.add(`capabilities.${key}`);
      }
    }
    enriched.capabilities = caps;
  }
  if (!enriched.modalities && source.modalities) {
    enriched.modalities = source.modalities;
    inherited.add("modalities");
  }
}

/**
 * Get a model with missing fields filled in from alias and/or creator's canonical version.
 */
export function getModelWithInheritance(
  provider: string,
  id: string,
): EnrichedModel | undefined {
  const model = getModel(provider, id);
  if (!model) return undefined;

  const enriched: EnrichedModel = { ...model };
  const inherited = new Set<string>();

  // Inherit from alias model (snapshot → alias within same provider)
  if (model.alias) {
    const alias = _getModel(model.provider, model.alias);
    if (alias) {
      inheritFields(enriched, alias, inherited);
    }
  }

  // Inherit from creator's canonical model (cross-provider)
  if (model.created_by !== model.provider) {
    const canonical =
      _getModel(model.created_by, model.id) ??
      _getModel(model.created_by, model.name) ??
      allModels.find(
        (m) =>
          m.provider === model.created_by &&
          (normalizeModelId(m.id) === normalizeModelId(model.id) ||
            normalizeModelId(m.id) === normalizeModelId(model.name)),
      );
    if (canonical) {
      inheritFields(enriched, canonical, inherited);
    }
  }

  if (inherited.size > 0) {
    enriched.inheritedFields = inherited;
    if (model.alias) {
      enriched.inheritedFrom = model.alias;
    } else {
      const creatorProvider = _getProvider(model.created_by);
      enriched.inheritedFrom = creatorProvider?.name ?? model.created_by;
    }
  }

  return enriched;
}

// ── Changelog ──

export interface ChangelogEntry {
  ts: string;
  provider: string;
  model: string;
  action: "create" | "update" | "delete";
  commit?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

let _changelog: ChangelogEntry[] | null = null;

export function getChangelog(): ChangelogEntry[] {
  if (_changelog) return _changelog;
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    const filePath = path.resolve(
      process.cwd(),
      "../../packages/data/changes/changelog.jsonl",
    );
    const content = fs.readFileSync(filePath, "utf-8");
    _changelog = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line: string) => JSON.parse(line))
      .reverse(); // newest first
    return _changelog!;
  } catch {
    return [];
  }
}
