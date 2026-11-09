/**
 * Verify nav-link-label and lang-switch use the same composited |255−bg| inversion
 * (not opacity/computed-color). Includes same-luminance backdrop pairing where possible.
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import { captureContext, scrollToScene } from "./evidence-lib.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";

function luminance([r, g, b]) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function bestInk(bgBuf, fgBuf, box) {
  const bg = PNG.sync.read(bgBuf);
  const fg = PNG.sync.read(fgBuf);
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(bg.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(bg.height, Math.ceil(box.y + box.height));
  let best = null;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (bg.width * y + x) << 2;
      const d =
        Math.abs(fg.data[i] - bg.data[i]) +
        Math.abs(fg.data[i + 1] - bg.data[i + 1]) +
        Math.abs(fg.data[i + 2] - bg.data[i + 2]);
      if (d < 40) continue;
      const bgRgb = [bg.data[i], bg.data[i + 1], bg.data[i + 2]];
      const compRgb = [fg.data[i], fg.data[i + 1], fg.data[i + 2]];
      const expected = bgRgb.map((b) => Math.abs(255 - b));
      const err = compRgb.reduce((s, c, j) => s + Math.abs(c - expected[j]), 0);
      if (!best || d > best.diffSum) {
        best = { x, y, diffSum: d, bgRgb, compRgb, expected, invertErr: err, bgLum: luminance(bgRgb) };
      }
    }
  }
  return best;
}

async function frameProbes(page, label) {
  const selectors = [
    ["nav", ".nav-link-label"],
    ["langZh", '.lang-switch__btn[data-set-lang="zh"]'],
    ["langEn", '.lang-switch__btn[data-set-lang="en"]'],
    ["wordmark", ".wordmark"],
  ];
  const boxes = {};
  for (const [key, sel] of selectors) {
    boxes[key] = await page.locator(sel).first().boundingBox();
  }
  const vp = page.viewportSize();
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };
  await page.addStyleTag({
    content: "html.parity-hide .header-chrome { visibility: hidden !important; }",
  });
  await page.evaluate(() => document.documentElement.classList.add("parity-hide"));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const bgBuf = await page.screenshot({ clip });
  await page.evaluate(() => document.documentElement.classList.remove("parity-hide"));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const fgBuf = await page.screenshot({ clip });

  const probes = {};
  for (const [key, sel] of selectors) {
    const box = boxes[key];
    probes[key] = box
      ? {
          selector: sel,
          ...bestInk(bgBuf, fgBuf, box),
          computed: await page.locator(sel).first().evaluate((el) => ({
            color: getComputedStyle(el).color,
            mixBlendMode: getComputedStyle(el).mixBlendMode,
            headerMix: getComputedStyle(el.closest(".site-header")).mixBlendMode,
          })),
        }
      : null;
  }

  const headerBlend = await page.locator(".site-header").first().evaluate((el) => ({
    mixBlendMode: getComputedStyle(el).mixBlendMode,
    overlay: el.classList.contains("site-header--overlay"),
  }));

  return { label, headerBlend, probes };
}

async function scrollToScene(page, id) {
  await page.evaluate((sceneId) => {
    const el = document.querySelector('[data-home-scene="' + sceneId + '"]');
    if (el) el.scrollIntoView({ block: "start" });
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
  }, id);
  await page.waitForTimeout(650);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);

const frames = [];
await page.evaluate(() => window.scrollTo(0, 0));
frames.push(await frameProbes(page, "1440-hero-scroll0"));
await scrollToScene(page, "1");
frames.push(await frameProbes(page, "1440-scene1-emeishan"));
await scrollToScene(page, "2");
frames.push(await frameProbes(page, "1440-scene2-qingdao-dark"));

const summary = frames.map((f) => {
  const nav = f.probes.nav;
  const zh = f.probes.langZh;
  const pair = nav && zh ? {
    backdropLumDelta: Math.abs(nav.bgLum - zh.bgLum),
    sameMechanism:
      nav.computed.headerMix === zh.computed.headerMix &&
      nav.computed.headerMix === "difference",
    navInvertErr: nav.invertErr,
    langInvertErr: zh.invertErr,
    navShouldBeDarkOnBright: nav.bgLum > 140,
    langShouldBeDarkOnBright: zh.bgLum > 140,
    navCompLum: luminance(nav.compRgb),
    langCompLum: luminance(zh.compRgb),
  } : null;
  return { label: f.label, pair, nav: f.probes.nav, langZh: f.probes.langZh, wordmark: f.probes.wordmark };
});

await browser.close();

const report = { ...captureContext(), frames, summary };
fs.writeFileSync(`${OUT}/lang-nav-invert-parity.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(summary, null, 2));
