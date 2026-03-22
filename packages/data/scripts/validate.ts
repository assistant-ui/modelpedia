import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const PROVIDERS_DIR = path.join(ROOT, "providers");

const VALID_STATUSES = ["active", "deprecated", "preview"];
const VALID_SOURCES = ["official", "community"];
const VALID_MODALITIES = ["text", "image", "audio", "video"];
const DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

const CAPABILITY_KEYS = [
  "vision",
  "tool_call",
  "structured_output",
  "reasoning",
  "json_mode",
  "streaming",
  "fine_tuning",
  "batch",
  "prompt_caching",
];

/** Fields that contribute to completeness scoring */
const COMPLETENESS_FIELDS = [
  "description",
  "status",
  "release_date",
  "knowledge_cutoff",
  "context_window",
  "max_output_tokens",
  // capabilities (8)
  ...CAPABILITY_KEYS.map((k) => `capabilities.${k}`),
  // modalities (2)
  "modalities.input",
  "modalities.output",
  // pricing (2)
  "pricing.input",
  "pricing.output",
];

interface Result {
  file: string;
  errors: string[];
  warnings: string[];
  completeness: number;
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function validateModel(filePath: string, _providerId: string): Result {
  const relative = path.relative(PROVIDERS_DIR, filePath);
  const errors: string[] = [];
  const warnings: string[] = [];

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {
      file: relative,
      errors: ["Invalid JSON"],
      warnings: [],
      completeness: 0,
    };
  }

  // --- Required fields (errors) ---
  if (typeof data.id !== "string" || !data.id) {
    errors.push("id: required, must be a non-empty string");
  }
  if (typeof data.name !== "string" || !data.name) {
    errors.push("name: required, must be a non-empty string");
  }
  if (!VALID_SOURCES.includes(data.source as string)) {
    errors.push(`source: required, must be one of ${VALID_SOURCES.join(", ")}`);
  }
  if (
    typeof data.last_updated !== "string" ||
    !DATE_RE.test(data.last_updated)
  ) {
    errors.push("last_updated: required, must be a date string (YYYY-MM-DD)");
  }

  // File name should match sanitized model id
  const expectedFile = `${String(data.id)
    .replace(/[^a-z0-9._-]/gi, "-")
    .toLowerCase()}.json`;
  const actualFile = path.basename(filePath);
  if (data.id && actualFile !== expectedFile) {
    errors.push(
      `filename: expected "${expectedFile}" to match model id "${data.id}"`,
    );
  }

  // --- Required: created_by ---
  if (typeof data.created_by !== "string" || !data.created_by) {
    errors.push("created_by: required, must be a non-empty string");
  }

  // --- Optional fields type validation (errors if present but wrong type) ---
  if (data.family !== undefined && typeof data.family !== "string") {
    errors.push("family: must be a string");
  }
  if (data.description !== undefined && typeof data.description !== "string") {
    errors.push("description: must be a string");
  }
  if (
    data.status !== undefined &&
    !VALID_STATUSES.includes(data.status as string)
  ) {
    errors.push(`status: must be one of ${VALID_STATUSES.join(", ")}`);
  }

  // Date fields: string | null allowed, undefined = omit
  for (const field of [
    "release_date",
    "deprecation_date",
    "knowledge_cutoff",
  ]) {
    const val = data[field];
    if (val === undefined) continue;
    if (val !== null && (typeof val !== "string" || !DATE_RE.test(val))) {
      errors.push(
        `${field}: must be a date string (YYYY-MM-DD or YYYY-MM) or null`,
      );
    }
  }

  // Number | null fields
  for (const field of [
    "context_window",
    "max_output_tokens",
    "max_input_tokens",
  ]) {
    const val = data[field];
    if (val === undefined) continue;
    if (val !== null && (typeof val !== "number" || val <= 0)) {
      errors.push(`${field}: must be a positive number or null`);
    }
  }

  // Capabilities: object with boolean values
  if (data.capabilities !== undefined) {
    if (typeof data.capabilities !== "object" || data.capabilities === null) {
      errors.push("capabilities: must be an object");
    } else {
      const caps = data.capabilities as Record<string, unknown>;
      for (const [key, val] of Object.entries(caps)) {
        if (!CAPABILITY_KEYS.includes(key)) {
          errors.push(`capabilities.${key}: unknown capability key`);
        }
        if (typeof val !== "boolean") {
          errors.push(`capabilities.${key}: must be a boolean`);
        }
      }
    }
  }

  // Modalities
  if (data.modalities !== undefined) {
    if (typeof data.modalities !== "object" || data.modalities === null) {
      errors.push("modalities: must be an object");
    } else {
      const mods = data.modalities as Record<string, unknown>;
      for (const dir of ["input", "output"]) {
        const val = mods[dir];
        if (val === undefined) continue;
        if (!Array.isArray(val)) {
          errors.push(`modalities.${dir}: must be an array`);
        } else {
          for (const item of val) {
            if (!VALID_MODALITIES.includes(item as string)) {
              errors.push(
                `modalities.${dir}: invalid value "${item}", must be one of ${VALID_MODALITIES.join(", ")}`,
              );
            }
          }
        }
      }
    }
  }

  // Pricing
  if (data.pricing !== undefined) {
    if (typeof data.pricing !== "object" || data.pricing === null) {
      errors.push("pricing: must be an object");
    } else {
      const pricing = data.pricing as Record<string, unknown>;
      const validPricingKeys = [
        "input",
        "output",
        "cached_input",
        "cache_write",
        "batch_input",
        "batch_output",
        "cached_output",
        "tiers",
      ];
      for (const [key, val] of Object.entries(pricing)) {
        if (!validPricingKeys.includes(key)) {
          errors.push(`pricing.${key}: unknown pricing key`);
        }
        if (key === "tiers") {
          if (!Array.isArray(val)) {
            errors.push("pricing.tiers: must be an array");
          }
        } else if (
          val !== undefined &&
          val !== null &&
          (typeof val !== "number" || val < 0)
        ) {
          errors.push(`pricing.${key}: must be a non-negative number or null`);
        }
      }
    }
  }

  // --- Completeness ---
  let present = 0;
  for (const field of COMPLETENESS_FIELDS) {
    const val = getNestedValue(data, field);
    if (val !== undefined) present++;
  }
  const completeness = Math.round((present / COMPLETENESS_FIELDS.length) * 100);

  // --- Warnings for missing important fields ---
  if (data.context_window === undefined)
    warnings.push("missing: context_window");
  if (data.capabilities === undefined) warnings.push("missing: capabilities");
  if (data.pricing === undefined) warnings.push("missing: pricing");
  if (data.modalities === undefined) warnings.push("missing: modalities");
  if (data.description === undefined) warnings.push("missing: description");

  return { file: relative, errors, warnings, completeness };
}

function validateProvider(filePath: string): Result {
  const relative = path.relative(PROVIDERS_DIR, filePath);
  const errors: string[] = [];

  let data: Record<string, unknown>;
  try {
    data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return {
      file: relative,
      errors: ["Invalid JSON"],
      warnings: [],
      completeness: 0,
    };
  }

  for (const field of [
    "id",
    "name",
    "region",
    "url",
    "api_url",
    "docs_url",
    "pricing_url",
  ]) {
    if (typeof data[field] !== "string" || !(data[field] as string)) {
      errors.push(`${field}: required, must be a non-empty string`);
    }
  }

  return { file: relative, errors, warnings: [], completeness: 100 };
}

function main() {
  const results: Result[] = [];
  let hasErrors = false;

  const providerDirs = fs
    .readdirSync(PROVIDERS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const dir of providerDirs) {
    // Validate _provider.json
    const providerFile = path.join(PROVIDERS_DIR, dir, "_provider.json");
    if (fs.existsSync(providerFile)) {
      results.push(validateProvider(providerFile));
    }

    // Validate model files
    const modelsDir = path.join(PROVIDERS_DIR, dir, "models");
    if (!fs.existsSync(modelsDir)) continue;

    const modelFiles = fs
      .readdirSync(modelsDir)
      .filter((f) => f.endsWith(".json"))
      .sort();

    for (const file of modelFiles) {
      results.push(validateModel(path.join(modelsDir, file), dir));
    }
  }

  // Output results
  let totalModels = 0;
  let totalCompleteness = 0;

  for (const r of results) {
    if (r.file.endsWith("_provider.json")) {
      if (r.errors.length > 0) {
        console.log(`\n  ✗ ${r.file}`);
        for (const e of r.errors) console.log(`    ERROR: ${e}`);
        hasErrors = true;
      } else {
        console.log(`  ✓ ${r.file}`);
      }
      continue;
    }

    totalModels++;
    totalCompleteness += r.completeness;

    if (r.errors.length > 0) {
      console.log(`\n  ✗ ${r.file} (${r.completeness}%)`);
      for (const e of r.errors) console.log(`    ERROR: ${e}`);
      for (const w of r.warnings) console.log(`    WARN:  ${w}`);
      hasErrors = true;
    } else if (r.warnings.length > 0) {
      console.log(`  ~ ${r.file} (${r.completeness}%)`);
    } else {
      console.log(`  ✓ ${r.file} (${r.completeness}%)`);
    }
  }

  const avgCompleteness =
    totalModels > 0 ? Math.round(totalCompleteness / totalModels) : 0;
  console.log(`\n${totalModels} models, avg completeness ${avgCompleteness}%`);

  if (hasErrors) {
    console.log("\nValidation failed with errors.");
    process.exit(1);
  } else {
    console.log("\nValidation passed.");
  }
}

main();
