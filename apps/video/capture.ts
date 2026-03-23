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
  const page = await screenshotCtx.newPage();

  await page.goto(BASE_URL, { waitUntil: "networkidle" });
  await sleep(1000);
  await page.screenshot({
    path: join(SCREENSHOTS_DIR, "homepage.png"),
    type: "png",
  });
  console.log("  ✓ homepage.png");

  console.log("📸 Capturing GitHub screenshot...");
  await page.goto("https://github.com/assistant-ui/modelpedia", {
    waitUntil: "networkidle",
  });
  await sleep(1000);
  await page.screenshot({
    path: join(SCREENSHOTS_DIR, "github.png"),
    type: "png",
  });
  console.log("  ✓ github.png");
  await screenshotCtx.close();

  // ── Screen Recordings ────────────────────────────────────────

  // Helper: create a recording context, perform actions, close to flush video
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
    const recPage = await ctx.newPage();

    await recPage.goto(url, { waitUntil: "networkidle" });
    await sleep(500);

    await actions(recPage);

    // Close context to flush video file
    const videoPath = await recPage.video()?.path();
    await ctx.close();

    // Rename the temp video to our target name
    if (videoPath) {
      renameSync(videoPath, join(RECORDINGS_DIR, `${name}.webm`));
    }

    // Clean up tmp dir
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

      // Clear and type another query
      await p.keyboard.press("Control+A");
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

  // Recording 2: Compare page — select two models, scroll
  await record("compare", `${BASE_URL}/compare`, async (p) => {
    await sleep(1000);

    // Try to interact with model pickers
    try {
      // Click first model picker
      const pickers = p.locator(
        'button:has-text("Select"), [role="combobox"], select',
      );
      const firstPicker = pickers.first();
      await firstPicker.click({ timeout: 3000 });
      await sleep(500);

      // Type to search for a model
      await p.keyboard.type("gpt-4o", { delay: 80 });
      await sleep(800);
      await p.keyboard.press("Enter");
      await sleep(1000);

      // Click second picker
      const secondPicker = pickers.nth(1);
      await secondPicker.click({ timeout: 3000 });
      await sleep(500);
      await p.keyboard.type("claude", { delay: 80 });
      await sleep(800);
      await p.keyboard.press("Enter");
      await sleep(1000);
    } catch {
      console.log("  ⚠ Model pickers not found, skipping selection");
    }

    // Scroll through comparison
    for (let i = 0; i < 6; i++) {
      await p.mouse.wheel(0, 250);
      await sleep(500);
    }

    await sleep(500);
  });

  // Recording 3: Changes page — scroll through updates
  await record("changes", `${BASE_URL}/changes`, async (p) => {
    await sleep(1000);

    // Slow scroll through changes
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
