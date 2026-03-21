import { defineConfig } from "tsdown";
import * as fs from "node:fs";

// Discover per-provider entry points
const providerEntries = fs.existsSync("src/providers")
  ? fs
      .readdirSync("src/providers")
      .filter((f) => f.endsWith(".ts"))
      .map((f) => `src/providers/${f}`)
  : [];

export default defineConfig({
  entry: ["src/index.ts", ...providerEntries],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  hash: false,
  minify: true,
});
