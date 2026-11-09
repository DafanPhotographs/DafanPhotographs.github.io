/**
 * Six-scenario header screenshots + composited pixel invert metrics for G24 wordmark.
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import { execSync } from "child_process";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const PREFIX = process.env.EVIDENCE_PREFIX || "g24";
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

function sampleInvertErr(bgBuf, fgBuf, box) {
  const bg = PNG.sync.read(bgBuf);
  const fg = PNG.sync.read(fgBuf);
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(bg.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(bg.height, Math.ceil(box.y + box.height));
  let minErr = Infinity;
  let best = null;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (bg.width * y + x) << 2;
      const d =
        Math.abs(fg.data[i] - bg.data[i]) +
        Math.abs(fg.data[i + 1] - bg.data[i + 1]) +
        Math.abs(fg.data[i + 2] - bg.data[i + 2]);
      if (d < 40) continue;
      const bgRgb = [bg.data[i], bg.data[i + 1], bg.data[i + 2]];
      const compRgb = [fg.data[i], fg.data[i + 1], fg.data[i + 2]];
      const exp = bgRgb.map((b) => Math.abs(255 - b));
      const err = compRgb.reduce((s, c, j) => s + Math.abs(c - exp[j]), 0);
      if (err < minErr) {
        minErr = err;
        best = { err, compRgb, exp, bgRgb };
      }
    }
  }
  return { minErr, best };
}

async function capture(page, tag, vp) {
  await page.setViewportSize(vp);
  const clipHeader = { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) };
  const headerPath = `${OUT}/${PREFIX}-${tag}-header.png`;
  await page.screenshot({ path: headerPath, clip: clipHeader });

  const wmBox = await page.locator(".wordmark").boundingBox();
  const navBox = await page.locator(".nav-link-label").first().boundingBox();
  await page.addStyleTag({
    content: "html.probe-hide-header-chrome .header-chrome { visibility: hidden !important; }",
  });
  await page.evaluate(() => document.documentElement.classList.add("probe-hide-header-chrome"));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const bgBuf = await page.screenshot({ clip: clipHeader });
  await page.evaluate(() => document.documentElement.classList.remove("probe-hide-header-chrome"));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const fgBuf = await page.screenshot({ clip: clipHeader });

  return {
    tag,
    headerPath,
    wm: wmBox ? sampleInvertErr(bgBuf, fgBuf, wmBox) : null,
    nav: navBox ? sampleInvertErr(bgBuf, fgBuf, navBox) : null,
    headerBlend: await page.locator(".site-header").first().evaluate((el) => getComputedStyle(el).mixBlendMode),
    solid: (await page.locator(".site-header--solid").count()) > 0,
  };
}

async function scrollToScene(page, id) {
  await page.evaluate((sceneId) => {
    const el = document.querySelector('[data-home-scene="' + sceneId + '"]');
    if (el) el.scrollIntoView({ block: "start" });
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
  }, id);
  await page.waitForTimeout(650);
}

async function scrollToClosingSolid(page) {
  for (let i = 0; i < 14; i += 1) {
    const done = await page.evaluate(() => {
      const end = document.querySelector("[data-home-photo-zone-end]");
      const header = document.querySelector(".site-header");
      if (!end || !header) return false;
      const hh = header.getBoundingClientRect().height;
      if (end.getBoundingClientRect().top <= hh + 0.5) return true;
      const y = end.getBoundingClientRect().top + window.scrollY - hh;
      window.scrollTo(0, Math.max(0, y));
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
      return false;
    });
    await page.waitForTimeout(200);
    if (done) break;
  }
  await page.waitForTimeout(400);
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);

const vp1440 = { width: 1440, height: 900 };
const vp375 = { width: 375, height: 812 };
const scenarios = [];

await page.evaluate(() => window.scrollTo(0, 0));
scenarios.push(await capture(page, "1440-bright-sky", vp1440));
await scrollToScene(page, "2");
scenarios.push(await capture(page, "1440-dark-forest", vp1440));
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await scrollToClosingSolid(page);
scenarios.push(await capture(page, "1440-closing-solid", vp1440));

await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await page.evaluate(() => window.scrollTo(0, 0));
scenarios.push(await capture(page, "375-bright-sky", vp375));
await scrollToScene(page, "1");
scenarios.push(await capture(page, "375-dark-forest", vp375));
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await scrollToClosingSolid(page);
scenarios.push(await capture(page, "375-closing-white", vp375));

await browser.close();

const report = { capturedAt: new Date().toISOString(), head: HEAD, baseUrl: BASE, prefix: PREFIX, scenarios };
fs.writeFileSync(`${OUT}/${PREFIX}-wordmark-evidence.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
