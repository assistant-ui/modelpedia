import type { Model, ProviderWithModels } from "@modelpedia/data";
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
} from "@modelpedia/data";
import { normalizeModelId } from "./search";

export type {
  Model,
  ModelCapabilities,
  ModelData,
  ModelPricing,
  Provider,
  ProviderWithModels,
} from "@modelpedia/data";

export const allModels: Model[] = _allModels;
export const providers: ProviderWithModels[] = _providers;
export function getModel(provider: string, id: string): Model | undefined {
  const decoded = decodeURIComponent(id);
  return (
    _getModel(provider, decoded) ??
    allModels.find(
      (m) => m.provider === provider && m.snapshots?.includes(decoded),
    )
  );
}
export const getProvider = _getProvider;
export {
  getActiveModels,
  getAllProviders,
  getModelsByCreator,
  getModelsByFamily,
  getModelsByProvider,
};

const INHERITABLE_FIELDS = [
  "description",
  "status",
  "context_window",
  "max_output_tokens",
  "max_input_tokens",
  "pricing",
  "performance",
  "reasoning",
  "speed",
  "knowledge_cutoff",
  "release_date",
  "deprecation_date",
  "model_type",
  "reasoning_tokens",
  "license",
  "parameters",
  "active_parameters",
] as const;

export interface EnrichedModel extends Model {
  inheritedFields?: Set<string>;
  inheritedFrom?: string;
}

function inheritFields(
  enriched: EnrichedModel,
  source: Model,
  inherited: Set<string>,
): void {
  const target = enriched as Record<string, unknown>;
  const src = source as Record<string, unknown>;
  for (const field of INHERITABLE_FIELDS) {
    if (target[field] == null && src[field] != null) {
      target[field] = src[field];
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

export function getModelWithInheritance(
  provider: string,
  id: string,
): EnrichedModel | undefined {
  const model = getModel(provider, id);
  if (!model) return undefined;

  const enriched: EnrichedModel = { ...model };
  const inherited = new Set<string>();

  if (model.alias) {
    const alias = _getModel(model.provider, model.alias);
    if (alias) {
      inheritFields(enriched, alias, inherited);
    }
  }

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
    enriched.inheritedFrom = model.alias
      ? model.alias
      : (_getProvider(model.created_by)?.name ?? model.created_by);
  }

  return enriched;
}

export interface ChangeEntry {
  ts: string;
  provider: string;
  model: string;
  action: "create" | "update" | "delete";
  commit?: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
}

let _changes: ChangeEntry[] | null = null;

export function getChanges(): ChangeEntry[] {
  if (_changes) return _changes;
  try {
    const fs = require("node:fs");
    const path = require("node:path");
    const filePath = path.resolve(
      process.cwd(),
      "../../packages/data/changes/changes.jsonl",
    );
    const content = fs.readFileSync(filePath, "utf-8");
    const entries: ChangeEntry[] = content
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line: string) => JSON.parse(line))
      .reverse();
    _changes = entries;
    return entries;
  } catch {
    return [];
  }
}
