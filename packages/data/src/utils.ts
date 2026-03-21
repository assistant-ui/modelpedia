import { allModels, providers } from "./data";
import type { Model, ProviderWithModels } from "./types";

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
  return providers.find((p) => p.id === id);
}

export function getAllProviders(): ProviderWithModels[] {
  return providers;
}
