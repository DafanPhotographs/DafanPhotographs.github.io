/**
 * User-reported 1440 bright-sky (scroll 0, zh): before/after typography + pixel legibility.
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import { captureContext } from "./evidence-lib.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const TAG = process.env.READABILITY_TAG || "after";

function luminance(rgb) {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

async function legibilityProbe(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) return null;
  const vp = page.viewportSize();
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };
  await page.addStyleTag({
    content: "html.probe-hide .header-chrome{visibility:hidden!important}",
  });
  await page.evaluate(() => document.documentElement.classList.add("probe-hide"));
  const bgBuf = await page.screenshot({ clip });
  await page.evaluate(() => document.documentElement.classList.remove("probe-hide"));
  const fgBuf = await page.screenshot({ clip });
  const bg = PNG.sync.read(bgBuf);
  const fg = PNG.sync.read(fgBuf);
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(fg.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(fg.height, Math.ceil(box.y + box.height));
  let minContrast = Infinity;
  let meanInk = 0;
  let meanBg = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (fg.width * y + x) << 2;
      const ink = [fg.data[i], fg.data[i + 1], fg.data[i + 2]];
      const back = [bg.data[i], bg.data[i + 1], bg.data[i + 2]];
      const diff =
        Math.abs(ink[0] - back[0]) + Math.abs(ink[1] - back[1]) + Math.abs(ink[2] - back[2]);
      if (diff < 35) continue;
      const c = Math.abs(luminance(ink) - luminance(back));
      minContrast = Math.min(minContrast, c);
      meanInk += luminance(ink);
      meanBg += luminance(back);
      n += 1;
    }
  }
  return {
    n,
    minContrast: n ? minContrast : null,
    meanInkLum: n ? meanInk / n : null,
    meanBgLum: n ? meanBg / n : null,
    meanDelta: n ? Math.abs(meanInk / n - meanBg / n) : null,
  };
}

async function computedStyles(page) {
  return page.evaluate(() => {
    function row(el) {
      if (!el) return null;
      const c = getComputedStyle(el);
      return {
        fontSize: c.fontSize,
        fontWeight: c.fontWeight,
        fontFamily: c.fontFamily,
        opacity: c.opacity,
        color: c.color,
        letterSpacing: c.letterSpacing,
        textDecorationThickness: c.textDecorationThickness,
        mixBlendMode: c.mixBlendMode,
      };
    }
    return {
      nav: row(document.querySelector(".nav-link-label.lang-zh-only")),
      zh: row(document.querySelector('.lang-switch__btn[data-set-lang="zh"]')),
      en: row(document.querySelector('.lang-switch__btn[data-set-lang="en"]')),
      sep: row(document.querySelector(".lang-switch__sep")),
      headerMix: getComputedStyle(document.querySelector(".site-header")).mixBlendMode,
    };
  });
}

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1440, height: 900 });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);
if (process.env.REVERT_OVERLAY_LANG_TYPO === "1") {
  await page.addStyleTag({
    content: `
      @media (min-width: 768px) {
        .page-home .site-header--overlay .lang-switch {
          font-size: var(--type-lang) !important;
          font-weight: var(--type-lang-weight) !important;
        }
      }`,
  });
}
await page.evaluate(() => window.scrollTo(0, 0));
const shot = `${OUT}/${TAG}-lang-readability-1440-zh-bright-user-baseline.png`;
await page.screenshot({ path: shot, clip: { x: 0, y: 0, width: 1440, height: 140 } });

const report = {
  ...captureContext(),
  tag: TAG,
  scene: "1440-hero-scroll0-zh",
  screenshot: shot,
  computed: await computedStyles(page),
  legibility: {
    navWork: await legibilityProbe(page, ".nav-link-label.lang-zh-only"),
    langZh: await legibilityProbe(page, '.lang-switch__btn[data-set-lang="zh"]'),
    langEn: await legibilityProbe(page, '.lang-switch__btn[data-set-lang="en"]'),
    langSep: await legibilityProbe(page, ".lang-switch__sep"),
  },
};

await browser.close();
const outJson = `${OUT}/lang-readability-1440-zh-bright-${TAG}.json`;
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
