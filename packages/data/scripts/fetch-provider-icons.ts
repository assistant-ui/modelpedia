import * as fs from "node:fs";
import * as path from "node:path";
import { PROVIDERS_DIR, runGenerate } from "./shared.ts";

const LOBE_RAW =
  "https://raw.githubusercontent.com/lobehub/lobe-icons/master/packages/static-svg/icons";

const ICONS: Record<string, string> = {
  ai21: `${LOBE_RAW}/ai21.svg`,
  bytedance: `${LOBE_RAW}/bytedance.svg`,
  fal: `${LOBE_RAW}/fal.svg`,
  nebius: `${LOBE_RAW}/nebius.svg`,
  novita: `${LOBE_RAW}/novita.svg`,
  parasail: `${LOBE_RAW}/parasail.svg`,
  replicate: `${LOBE_RAW}/replicate.svg`,
  siliconflow: `${LOBE_RAW}/siliconcloud.svg`,
  stability: `${LOBE_RAW}/stability.svg`,
  voyage: `${LOBE_RAW}/voyage.svg`,
};

function normalizeSvg(svg: string) {
  const viewBox = svg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 24 24";
  const inner =
    svg
      .replace(/<\?xml[\s\S]*?\?>/g, "")
      .replace(/<!doctype[\s\S]*?>/gi, "")
      .replace(/<title>[\s\S]*?<\/title>/g, "")
      .match(/<svg[^>]*>([\s\S]*?)<\/svg>/)?.[1]
      .trim() ?? "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" fill="currentColor" fill-rule="evenodd">\n  ${inner.replace(/\n/g, "\n  ")}\n</svg>\n`;
}

async function main() {
  const selected = process.argv.slice(2);
  const providers = selected.length > 0 ? selected : Object.keys(ICONS);

  for (const provider of providers) {
    const source = ICONS[provider];
    if (!source) throw new Error(`No icon source configured for ${provider}`);
    const res = await fetch(source);
    if (!res.ok) throw new Error(`Icon fetch failed: ${res.status} ${source}`);
    const svg = normalizeSvg(await res.text());
    const dir = path.join(PROVIDERS_DIR, provider);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "icon.svg"), svg, "utf-8");
    console.log(`wrote ${provider}/icon.svg from ${source}`);
  }

  runGenerate();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
