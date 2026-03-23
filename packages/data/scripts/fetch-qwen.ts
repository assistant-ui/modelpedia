import * as fs from "node:fs";
import * as path from "node:path";
import {
  type ModelEntry,
  PROVIDERS_DIR,
  runGenerate,
  upsertWithSnapshot,
} from "./shared.ts";

/**
 * Fetch Qwen models — mirrors Alibaba Cloud Model Studio data.
 * qwen.ai/apiplatform IS DashScope, same models and pricing.
 */

const ALIBABA_DIR = path.join(PROVIDERS_DIR, "alibaba", "models");

/** Determine license for a Qwen model ID. */
function inferLicense(id: string): string {
  if (
    /^qwen-(max|plus|turbo|vl-max|vl-plus|long|math|omni-turbo)/i.test(id) ||
    /^qwen3\.5-(plus|max)/i.test(id)
  )
    return "proprietary";
  if (/^(qwen|qwq)/i.test(id)) return "apache-2.0";
  return "proprietary";
}

/** Fields to skip when copying from Alibaba source (provider-internal metadata). */
const SKIP_FIELDS = new Set([
  "_generated",
  "provider",
  "source",
  "last_updated",
]);

async function main() {
  console.log("Syncing Qwen models from Alibaba provider...");

  if (!fs.existsSync(ALIBABA_DIR)) {
    console.log("Alibaba provider not found. Run fetch:alibaba first.");
    return;
  }

  const files = fs.readdirSync(ALIBABA_DIR).filter((f) => f.endsWith(".json"));
  let written = 0;

  for (const file of files) {
    const src = JSON.parse(
      fs.readFileSync(path.join(ALIBABA_DIR, file), "utf-8"),
    );

    // Build entry from all Alibaba fields, skipping internal metadata
    const entry: ModelEntry = { id: src.id, name: src.name ?? src.id };
    for (const [key, value] of Object.entries(src)) {
      if (!SKIP_FIELDS.has(key) && value !== undefined) {
        (entry as Record<string, unknown>)[key] = value;
      }
    }

    // Override license for Qwen provider
    entry.license = inferLicense(src.id);

    written += upsertWithSnapshot("qwen", entry);
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
