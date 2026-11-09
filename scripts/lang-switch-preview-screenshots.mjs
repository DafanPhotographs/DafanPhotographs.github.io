/**
 * Preview screenshots: inline lang switch (zh active / en active) × viewports × backdrops.
 */
import { chromium } from "playwright";
import fs from "fs";
import { execSync } from "child_process";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

async function scrollToScene(page, id) {
  await page.evaluate((sceneId) => {
    const el = document.querySelector('[data-home-scene="' + sceneId + '"]');
    if (el) el.scrollIntoView({ block: "start" });
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
  }, id);
  await page.waitForTimeout(600);
}

async function scrollToClosing(page) {
  for (let i = 0; i < 14; i += 1) {
    const done = await page.evaluate(() => {
      const end = document.querySelector("[data-home-photo-zone-end]");
      const header = document.querySelector(".site-header");
      if (!end || !header) return false;
      const hh = header.getBoundingClientRect().height;
      if (end.getBoundingClientRect().top <= hh + 0.5) return true;
      window.scrollTo(0, Math.max(0, end.getBoundingClientRect().top + window.scrollY - hh));
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
      return false;
    });
    await page.waitForTimeout(200);
    if (done) break;
  }
  await page.waitForTimeout(400);
}

async function shot(page, tag, vp, lang, backdrop) {
  await page.setViewportSize(vp);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  await page.locator(`.lang-switch__btn[data-set-lang="${lang}"]`).click();
  await page.waitForTimeout(200);
  if (backdrop === "hero") await page.evaluate(() => window.scrollTo(0, 0));
  else if (backdrop === "forest") await scrollToScene(page, "2");
  else if (backdrop === "closing") await scrollToClosing(page);

  const headerPath = `${OUT}/lang-switch-${tag}.png`;
  await page.screenshot({
    path: headerPath,
    clip: { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) },
  });
  const layout = await page.evaluate(() => {
    const wm = document.querySelector(".wordmark")?.getBoundingClientRect();
    const lang = document.querySelector(".lang-switch")?.getBoundingClientRect();
    const active = document.querySelector('.lang-switch__btn[aria-checked="true"]');
    return {
      wmRight: wm?.right,
      langLeft: lang?.left,
      gap: lang && wm ? lang.left - wm.right : null,
      activeLabel: active?.textContent?.trim(),
      activeUnderline: active ? getComputedStyle(active).textDecorationLine : null,
      activeOpacity: active ? getComputedStyle(active).opacity : null,
      inactiveOpacity: document.querySelector('.lang-switch__btn[aria-checked="false"]')
        ? getComputedStyle(document.querySelector('.lang-switch__btn[aria-checked="false"]')).opacity
        : null,
    };
  });
  return { tag, headerPath, layout };
}

const browser = await chromium.launch();
const page = await browser.newPage();
const shots = [];

const plans = [
  ["1440-zh-bright", { width: 1440, height: 900 }, "zh", "hero"],
  ["1440-en-bright", { width: 1440, height: 900 }, "en", "hero"],
  ["1440-zh-dark", { width: 1440, height: 900 }, "zh", "forest"],
  ["1440-en-dark", { width: 1440, height: 900 }, "en", "forest"],
  ["1440-zh-closing", { width: 1440, height: 900 }, "zh", "closing"],
  ["1440-en-closing", { width: 1440, height: 900 }, "en", "closing"],
  ["375-zh-bright", { width: 375, height: 812 }, "zh", "hero"],
  ["375-en-bright", { width: 375, height: 812 }, "en", "hero"],
  ["375-zh-dark", { width: 375, height: 812 }, "zh", "forest"],
  ["375-en-dark", { width: 375, height: 812 }, "en", "forest"],
  ["375-zh-closing", { width: 375, height: 812 }, "zh", "closing"],
  ["375-en-closing", { width: 375, height: 812 }, "en", "closing"],
];

for (const [tag, vp, lang, backdrop] of plans) {
  shots.push(await shot(page, tag, vp, lang, backdrop));
}
await browser.close();

const report = { head: HEAD, capturedAt: new Date().toISOString(), shots };
fs.writeFileSync(`${OUT}/lang-switch-preview-evidence.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
