import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROVIDERS_DIR = path.join(ROOT, "providers");
const NPM_DIR = path.resolve(ROOT, "..", "npm");
const DATA_OUTPUT = path.join(ROOT, "src", "data.ts");
const NPM_OUTPUT = path.join(NPM_DIR, "src", "data.ts");
const PROVIDERS_OUT_DIR = path.join(NPM_DIR, "src", "providers");

function generate() {
  const providerDirs = fs
    .readdirSync(PROVIDERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  const providers: Array<{
    id: string;
    provider: Record<string, unknown>;
    models: Record<string, unknown>[];
  }> = [];

  for (const dir of providerDirs) {
    const providerPath = path.join(PROVIDERS_DIR, dir, "_provider.json");
    if (!fs.existsSync(providerPath)) continue;

    const provider = JSON.parse(fs.readFileSync(providerPath, "utf-8"));

    // Read icon.svg if present
    const iconPath = path.join(PROVIDERS_DIR, dir, "icon.svg");
    if (fs.existsSync(iconPath)) {
      provider.icon = fs.readFileSync(iconPath, "utf-8").trim();
    }

    const modelsDir = path.join(PROVIDERS_DIR, dir, "models");
    const models: Record<string, unknown>[] = [];

    if (fs.existsSync(modelsDir)) {
      const modelFiles = fs
        .readdirSync(modelsDir)
        .filter((f) => f.endsWith(".json"))
        .sort();

      for (const file of modelFiles) {
        const model = JSON.parse(
          fs.readFileSync(path.join(modelsDir, file), "utf-8"),
        );
        // Strip internal/runtime fields from generated output
        delete model._generated;
        delete model.provider;
        models.push(model);
      }
    }

    providers.push({ id: dir, provider, models });
  }

  // Cross-provider inheritance: aggregator/cloud models inherit missing fields
  // from the direct provider's canonical model (e.g., openrouter's claude-opus-4-6
  // inherits description, context_window, etc. from anthropic's claude-opus-4-6)
  const INHERIT_FIELDS = [
    "description",
    "tagline",
    "context_window",
    "max_output_tokens",
    "max_input_tokens",
    "knowledge_cutoff",
    "training_data_cutoff",
    "license",
    "parameters",
    "active_parameters",
    "architecture",
    "open_weight",
    "modalities",
  ];

  // Build lookup: created_by → model name → canonical model data
  const directModels = new Map<string, Map<string, Record<string, unknown>>>();
  for (const { provider, models } of providers) {
    if (provider.type !== "direct") continue;
    const byName = new Map<string, Record<string, unknown>>();
    for (const m of models) {
      const id = (m.id as string).toLowerCase();
      const name = (m.name as string).toLowerCase();
      byName.set(id, m);
      if (id !== name) byName.set(name, m);
    }
    directModels.set(provider.id as string, byName);
  }

  // Normalize model ID for cross-provider matching
  const normalizeForMatch = (id: string): string =>
    id
      .toLowerCase()
      .replace(/^[^/]*\//, "")
      .replace(/@.*$/, "")
      .replace(/[-_]/g, "");

  let inherited = 0;
  for (const { provider, models } of providers) {
    if (provider.type === "direct") continue;
    for (const m of models) {
      const createdBy = m.created_by as string | undefined;
      if (!createdBy) continue;
      const lookup = directModels.get(createdBy);
      if (!lookup) continue;

      const rawId = (m.id as string).toLowerCase();
      const bareId = rawId.replace(/^[^/]*\//, "").replace(/@.*$/, "");
      const normalized = normalizeForMatch(rawId);

      // Try exact match, then bare ID, then normalized
      const source =
        lookup.get(bareId) ??
        [...lookup.values()].find(
          (s) => normalizeForMatch(s.id as string) === normalized,
        );
      if (!source) continue;

      let didInherit = false;
      for (const field of INHERIT_FIELDS) {
        if (m[field] == null && source[field] != null) {
          m[field] = source[field];
          didInherit = true;
        }
      }
      // Inherit capabilities (merge, don't overwrite)
      if (source.capabilities) {
        const srcCaps = source.capabilities as Record<string, unknown>;
        const mCaps = (m.capabilities ?? {}) as Record<string, unknown>;
        for (const [k, v] of Object.entries(srcCaps)) {
          if (mCaps[k] == null) mCaps[k] = v;
        }
        m.capabilities = mCaps;
      }
      if (didInherit) inherited++;
    }
  }
  if (inherited > 0) {
    console.log(`Inherited fields for ${inherited} aggregator/cloud models`);
  }

  // Auto-infer capabilities
  for (const { models } of providers) {
    for (const m of models) {
      if (!m.capabilities) continue;
      const caps = m.capabilities as Record<string, unknown>;
      // Non-proprietary (open-weight) models can always be fine-tuned
      if (
        m.license &&
        m.license !== "proprietary" &&
        caps.fine_tuning == null
      ) {
        caps.fine_tuning = true;
      }
      // structured_output implies json_mode
      if (caps.structured_output && !caps.json_mode) {
        caps.json_mode = true;
      }
      // endpoints containing "batch" implies batch capability
      if (
        Array.isArray(m.endpoints) &&
        (m.endpoints as string[]).includes("batch") &&
        caps.batch == null
      ) {
        caps.batch = true;
      }
    }
  }

  const HEADER = [
    "// This file is auto-generated by scripts/generate.ts",
    "// Do not edit manually",
    "",
  ];

  const ALL_MODELS_SNIPPET = [
    "export const allModels: Model[] = providers.flatMap((p) =>",
    "  p.models.map((m) => ({ ...m, provider: p.id }))",
    ");",
    "",
  ];

  // 1. Generate main data.ts (all providers)
  const allData = providers.map(({ provider, models }) => ({
    ...provider,
    models,
  }));

  const mainLines = [
    ...HEADER,
    "import type { ProviderWithModels, Model } from './types';",
    "",
    `export const providers: ProviderWithModels[] = ${JSON.stringify(allData, null, 2)};`,
    "",
    ...ALL_MODELS_SNIPPET,
  ];

  // Write to data/src (for internal apps — single file with all data)
  fs.writeFileSync(DATA_OUTPUT, mainLines.join("\n"), "utf-8");

  // 2. Generate per-provider files (modelpedia/openai, modelpedia/anthropic, etc.)
  fs.mkdirSync(PROVIDERS_OUT_DIR, { recursive: true });

  for (const { id, provider, models } of providers) {
    const providerData = { ...provider, models };
    const providerLines = [
      ...HEADER,
      "import type { ProviderWithModels, Model } from '../types';",
      "",
      `export const provider: ProviderWithModels = ${JSON.stringify(providerData)};`,
      "",
      "export const models: Model[] = provider.models.map((m) => ({ ...m, provider: provider.id }));",
      "",
    ];

    fs.writeFileSync(
      path.join(PROVIDERS_OUT_DIR, `${id}.ts`),
      providerLines.join("\n"),
      "utf-8",
    );
  }

  // 3. Generate npm/src/data.ts — aggregates from per-provider files
  const providerIds = providers.map((p) => p.id);
  const toVarName = (id: string) => id.replace(/[^a-zA-Z0-9]/g, "_");
  const npmDataLines = [
    ...HEADER,
    "import type { ProviderWithModels, Model } from './types';",
    ...providerIds.map(
      (id) =>
        `import { provider as ${toVarName(id)} } from './providers/${id}';`,
    ),
    "",
    `export const providers: ProviderWithModels[] = [${providerIds.map(toVarName).join(", ")}];`,
    "",
    ...ALL_MODELS_SNIPPET,
  ];
  fs.writeFileSync(NPM_OUTPUT, npmDataLines.join("\n"), "utf-8");

  const totalModels = providers.reduce((sum, p) => sum + p.models.length, 0);
  console.log(
    `Generated ${providers.length} providers (${totalModels} models) → data.ts + ${providers.length} provider files`,
  );
}

generate();
