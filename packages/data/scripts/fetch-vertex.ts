import * as fs from "node:fs";
import * as path from "node:path";
import { type ModelEntry, runGenerate, upsertWithSnapshot } from "./shared.ts";

/**
 * Fetch Google Vertex AI models.
 * Syncs Google Gemini models + adds partner models.
 */

const ROOT = path.resolve(import.meta.dirname, "..");
const GOOGLE_DIR = path.join(ROOT, "providers", "google", "models");
const VERTEX_DIR = path.join(ROOT, "providers", "vertex", "models");

// Partner models available on Vertex AI
const PARTNER_MODELS: ModelEntry[] = [
  {
    id: "claude-opus-4-6@vertex",
    name: "Claude Opus 4.6",
    created_by: "anthropic",
    family: "claude-opus",
    context_window: 1000000,
    max_output_tokens: 128000,
    capabilities: {
      streaming: true,
      vision: true,
      tool_call: true,
      reasoning: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: "claude-sonnet-4-6@vertex",
    name: "Claude Sonnet 4.6",
    created_by: "anthropic",
    family: "claude-sonnet",
    context_window: 1000000,
    max_output_tokens: 64000,
    capabilities: {
      streaming: true,
      vision: true,
      tool_call: true,
      reasoning: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: "claude-haiku-4-5@vertex",
    name: "Claude Haiku 4.5",
    created_by: "anthropic",
    family: "claude-haiku",
    context_window: 200000,
    max_output_tokens: 64000,
    capabilities: {
      streaming: true,
      vision: true,
      tool_call: true,
      reasoning: true,
    },
    modalities: { input: ["text", "image"], output: ["text"] },
  },
  {
    id: "mistral-medium-3@vertex",
    name: "Mistral Medium 3",
    created_by: "mistral",
    family: "mistral-medium",
    capabilities: { streaming: true, tool_call: true },
    modalities: { input: ["text"], output: ["text"] },
  },
  {
    id: "jamba-1.5-large@vertex",
    name: "Jamba 1.5 Large",
    created_by: "ai21",
    capabilities: { streaming: true },
    modalities: { input: ["text"], output: ["text"] },
  },
  {
    id: "jamba-1.5-mini@vertex",
    name: "Jamba 1.5 Mini",
    created_by: "ai21",
    capabilities: { streaming: true },
    modalities: { input: ["text"], output: ["text"] },
  },
];

async function main() {
  console.log("Syncing Vertex AI models...");
  fs.mkdirSync(VERTEX_DIR, { recursive: true });

  let written = 0;

  // Sync Google Gemini models
  if (fs.existsSync(GOOGLE_DIR)) {
    const files = fs.readdirSync(GOOGLE_DIR).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(GOOGLE_DIR, file), "utf-8"),
      );
      data.last_updated = new Date().toISOString().split("T")[0];
      fs.writeFileSync(
        path.join(VERTEX_DIR, file),
        `${JSON.stringify(data, null, 2)}\n`,
        "utf-8",
      );
      written++;
    }
    console.log(`Synced ${written} Gemini models from google provider`);
  }

  // Add partner models
  for (const entry of PARTNER_MODELS) {
    written += upsertWithSnapshot("vertex", entry);
  }

  console.log(`Wrote ${written} total models`);
  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
