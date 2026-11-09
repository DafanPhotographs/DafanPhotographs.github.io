import { chromium } from "playwright";
import fs from "fs";
import { captureContext, scrollToClosingSolid } from "./evidence-lib.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";

async function scaleOf(page, scene) {
  return page.evaluate((idx) => {
    const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
    if (!media || typeof gsap === "undefined") return null;
    return Number(gsap.getProperty(media, "scale"));
  }, scene);
}

async function readClosingMetrics(page) {
  return page.evaluate(() => {
    const closing = document.querySelector(".home-closing");
    const meta = closing?.querySelector(".home-closing__bar");
    const cta = closing?.querySelector(".home-closing__cta");
    const cRect = closing?.getBoundingClientRect();
    const mRect = meta?.getBoundingClientRect();
    const ctaRect = cta?.getBoundingClientRect();
    const vh = window.innerHeight;
    const cs = closing ? getComputedStyle(closing) : null;
    return {
      closingHeight: cRect?.height,
      viewportH: vh,
      padBottom: cs ? parseFloat(cs.paddingBottom) : null,
      metaBottomGap: mRect ? vh - mRect.bottom : null,
      ctaBottomGap: ctaRect ? vh - ctaRect.bottom : null,
      scrollY: window.scrollY,
      headerSolid: document.querySelector(".site-header")?.classList.contains("site-header--solid"),
    };
  });
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(800);

const samples = [];

await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(400);
samples.push({ label: "scale-scene0-rest", scale0: await scaleOf(page, "0") });
await page.screenshot({ path: `${OUT}/qa-scale-scene0-rest.png`, fullPage: false });

await page.evaluate(() => {
  const el = document.querySelector('[data-home-scene="0"]');
  if (el) el.scrollIntoView({ block: "center" });
  if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
});
await page.waitForTimeout(500);
samples.push({ label: "scale-scene0-mid", scale0: await scaleOf(page, "0") });

await page.evaluate(() => {
  const el = document.querySelector('[data-home-scene="1"]');
  if (el) el.scrollIntoView({ block: "center" });
  if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
});
await page.waitForTimeout(500);
samples.push({ label: "scale-scene1-mid", scale1: await scaleOf(page, "1") });
await page.screenshot({ path: `${OUT}/qa-scale-scene1-mid.png`, fullPage: false });

await page.evaluate(() => {
  const el = document.querySelector('[data-home-scene="2"]');
  if (el) el.scrollIntoView({ block: "end" });
  if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
});
await page.waitForTimeout(500);
samples.push({ label: "scale-scene2-end", scale2: await scaleOf(page, "2") });
await page.screenshot({ path: `${OUT}/qa-scale-scene2-end.png`, fullPage: false });

await scrollToClosingSolid(page);
const closingMetrics = await readClosingMetrics(page);
samples.push({ label: "closing-bottom-metrics", ...closingMetrics });
await page.screenshot({ path: `${OUT}/qa-closing-bottom-1440.png`, fullPage: false });

await browser.close();

const report = { ...captureContext(), samples };
fs.writeFileSync(`${OUT}/qa-home-regression-evidence.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
