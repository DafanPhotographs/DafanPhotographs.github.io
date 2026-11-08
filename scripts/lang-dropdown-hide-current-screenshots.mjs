import { chromium } from "playwright";
import fs from "fs";
import { execSync } from "child_process";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = "/opt/cursor/artifacts";
fs.mkdirSync(OUT, { recursive: true });
const SHA = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

const plans = [
  { path: `${OUT}/lang-dropdown-desktop-1440-zh-open.png`, vp: { width: 1440, height: 900 }, lang: "zh" },
  { path: `${OUT}/lang-dropdown-mobile-375-zh-open.png`, vp: { width: 375, height: 812 }, lang: "zh", dpr: 2 },
  { path: `${OUT}/lang-dropdown-desktop-1440-en-open.png`, vp: { width: 1440, height: 900 }, lang: "en" },
  { path: `${OUT}/lang-dropdown-mobile-375-en-open.png`, vp: { width: 375, height: 812 }, lang: "en", dpr: 2 },
];

const browser = await chromium.launch();

for (const plan of plans) {
  const page = await browser.newPage({
    viewport: plan.vp,
    deviceScaleFactor: plan.dpr || 1,
  });
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  if (plan.lang === "en") {
    await page.locator(".lang-dropdown__trigger").click();
    await page.locator('.lang-dropdown__option[data-set-lang="en"]').click();
    await expectClosed(page);
  }
  await page.locator(".lang-dropdown__trigger").click();
  await page.locator(".lang-dropdown__menu").waitFor({ state: "visible" });
  await page.locator(".lang-dropdown").screenshot({ path: plan.path });
  await page.close();
  console.log("wrote", plan.path, SHA);
}

await browser.close();

/** @param {import("playwright").Page} page */
async function expectClosed(page) {
  await page.locator(".lang-dropdown__menu").waitFor({ state: "hidden" });
}
