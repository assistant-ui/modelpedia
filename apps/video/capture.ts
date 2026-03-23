import { mkdirSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.argv.includes("--base-url")
  ? process.argv[process.argv.indexOf("--base-url") + 1]!
  : "https://modelpedia.dev";

const SCREENSHOTS_DIR = join(__dirname, "public", "screenshots");
const RECORDINGS_DIR = join(__dirname, "public", "recordings");
const VIEWPORT = { width: 1920, height: 1080 };

// Script injected before every page load to force dark mode
const DARK_MODE_INIT_SCRIPT = `
  // Force next-themes to use dark mode via localStorage
  localStorage.setItem("theme", "dark");
  // Set dark class immediately on html element (next-themes uses class-based dark mode)
  document.documentElement.classList.add("dark");
  document.documentElement.style.colorScheme = "dark";

  // Also inject a style tag that forces dark mode CSS variables immediately
  // This ensures dark mode even if the theme system hasn't hydrated yet
  const style = document.createElement("style");
  style.textContent = \`
    :root {
      --background: oklch(0.145 0 0) !important;
      --foreground: oklch(0.95 0 0) !important;
      --muted: oklch(0.22 0 0) !important;
      --muted-foreground: oklch(0.65 0 0) !important;
      --border: oklch(1 0 0 / 10%) !important;
      --input: oklch(1 0 0 / 5%) !important;
      --ring: oklch(1 0 0 / 15%) !important;
      --accent: oklch(1 0 0 / 5%) !important;
      --accent-foreground: oklch(0.85 0 0) !important;
      color-scheme: dark !important;
    }
  \`;
  document.head.appendChild(style);
`;

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  mkdirSync(RECORDINGS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // ── Screenshots ──────────────────────────────────────────────

  console.log("📸 Capturing homepage screenshot...");
  const screenshotCtx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "dark",
  });
  // Inject dark mode script before any page loads in this context
  await screenshotCtx.addInitScript(DARK_MODE_INIT_SCRIPT);
  const page = await screenshotCtx.newPage();

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await sleep(1500);
  await page.screenshot({
    path: join(SCREENSHOTS_DIR, "homepage.png"),
    type: "png",
  });
  console.log("  ✓ homepage.png");
  await screenshotCtx.close();

  console.log("📸 Capturing GitHub screenshot...");
  const githubCtx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: "dark",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const githubPage = await githubCtx.newPage();
  try {
    await githubPage.goto("https://github.com/assistant-ui/modelpedia", {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await sleep(3000);
    await githubPage.screenshot({
      path: join(SCREENSHOTS_DIR, "github.png"),
      type: "png",
    });
    console.log("  ✓ github.png");
  } catch (e) {
    console.log("  ⚠ GitHub screenshot failed, keeping previous version");
  }
  await githubCtx.close();

  // ── Screen Recordings ────────────────────────────────────────

  async function record(
    name: string,
    url: string,
    actions: (page: import("playwright").Page) => Promise<void>,
  ) {
    console.log(`🎬 Recording ${name}...`);
    const tmpDir = join(RECORDINGS_DIR, `_tmp_${name}`);
    mkdirSync(tmpDir, { recursive: true });

    const ctx = await browser.newContext({
      viewport: VIEWPORT,
      colorScheme: "dark",
      recordVideo: { dir: tmpDir, size: VIEWPORT },
    });
    // Inject dark mode before page loads
    await ctx.addInitScript(DARK_MODE_INIT_SCRIPT);
    const recPage = await ctx.newPage();

    await recPage.goto(url, { waitUntil: "networkidle" });
    await sleep(800);

    await actions(recPage);

    const videoPath = await recPage.video()?.path();
    await ctx.close();

    if (videoPath) {
      renameSync(videoPath, join(RECORDINGS_DIR, `${name}.webm`));
    }

    try {
      const { rmSync } = await import("node:fs");
      rmSync(tmpDir, { recursive: true, force: true });
    } catch {}

    console.log(`  ✓ ${name}.webm`);
  }

  // Recording 1: Models page — scroll, search, filter
  await record("models-browse", `${BASE_URL}/models`, async (p) => {
    await sleep(1000);

    // Slow scroll down
    for (let i = 0; i < 5; i++) {
      await p.mouse.wheel(0, 200);
      await sleep(400);
    }

    // Scroll back up
    await p.mouse.wheel(0, -1000);
    await sleep(800);

    // Type in search
    const searchInput = p.locator(
      'input[type="search"], input[placeholder*="earch"], input[placeholder*="model"]',
    );
    try {
      await searchInput.first().click();
      await sleep(300);
      await p.keyboard.type("claude", { delay: 100 });
      await sleep(1500);

      // Clear search
      await p.keyboard.press("Meta+A");
      await p.keyboard.press("Backspace");
      await sleep(500);
    } catch {
      console.log("  ⚠ Search input not found, skipping search interaction");
    }

    // Try clicking a capability filter
    try {
      const reasoningBtn = p.locator('button:has-text("Reasoning")');
      await reasoningBtn.first().click({ timeout: 2000 });
      await sleep(1500);
    } catch {
      console.log("  ⚠ Reasoning filter not found, skipping");
    }

    await sleep(500);
  });

  // Recording 2: Compare page — pre-select two models via URL
  await record(
    "compare",
    `${BASE_URL}/compare?a=openai/gpt-4o&b=anthropic/claude-sonnet-4-5`,
    async (p) => {
      await sleep(2000);

      // Scroll through the comparison table slowly
      for (let i = 0; i < 8; i++) {
        await p.mouse.wheel(0, 200);
        await sleep(600);
      }

      // Scroll back to top
      await p.mouse.wheel(0, -2000);
      await sleep(1000);
    },
  );

  // Recording 3: Changes page — scroll through updates
  await record("changes", `${BASE_URL}/changes`, async (p) => {
    await sleep(1000);

    for (let i = 0; i < 8; i++) {
      await p.mouse.wheel(0, 180);
      await sleep(500);
    }

    await sleep(500);
  });

  await browser.close();
  console.log("\n✅ All assets captured!");
  console.log(`   Screenshots: ${SCREENSHOTS_DIR}`);
  console.log(`   Recordings:  ${RECORDINGS_DIR}`);
}

main().catch((err) => {
  console.error("❌ Capture failed:", err);
  process.exit(1);
});
