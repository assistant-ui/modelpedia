import * as fs from "node:fs";
import * as path from "node:path";
import { runGenerate } from "./shared.ts";

/**
 * Fetch Qwen models — mirrors Alibaba Cloud Model Studio data.
 * qwen.ai/apiplatform IS DashScope, same models and pricing.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const ALIBABA_DIR = path.join(ROOT, "providers", "alibaba", "models");
const QWEN_DIR = path.join(ROOT, "providers", "qwen", "models");

async function main() {
  console.log("Syncing Qwen models from Alibaba provider...");

  if (!fs.existsSync(ALIBABA_DIR)) {
    console.log("Alibaba provider not found. Run fetch:alibaba first.");
    return;
  }

  fs.mkdirSync(QWEN_DIR, { recursive: true });

  const files = fs.readdirSync(ALIBABA_DIR).filter((f) => f.endsWith(".json"));
  let written = 0;

  for (const file of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(ALIBABA_DIR, file), "utf-8"),
    );
    // Update provider to qwen
    data.provider = "qwen";
    data.last_updated = new Date().toISOString().split("T")[0];

    const dest = path.join(QWEN_DIR, file);
    fs.writeFileSync(dest, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    written++;
  }

  console.log(`Wrote ${written} models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
