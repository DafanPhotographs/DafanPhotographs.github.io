/**
 * PREVIEW ONLY — temporary object-position injection via Playwright; not production CSS.
 * Hero scene 0 crop candidates for language-switch backdrop (art review).
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import { captureContext } from "./evidence-lib.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";

function meanLumInBox(png, box) {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(png.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(png.height, Math.ceil(box.y + box.height));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (png.width * y + x) << 2;
      sum += 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
      n += 1;
    }
  }
  return n ? sum / n : null;
}

async function measureLangBackdrop(page) {
  const vp = page.viewportSize();
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };
  const boxes = await page.evaluate(() => {
    const lang = document.querySelector('.lang-switch__btn[data-set-lang="en"]')?.getBoundingClientRect();
    const zh = document.querySelector('.lang-switch__btn[data-set-lang="zh"]')?.getBoundingClientRect();
    const nav = document.querySelector(".nav-link-label")?.getBoundingClientRect();
    return { lang, zh, nav };
  });
  await page.addStyleTag({
    content: "html.hero-op-probe .header-chrome{visibility:hidden!important}",
  });
  await page.evaluate(() => document.documentElement.classList.add("hero-op-probe"));
  const buf = await page.screenshot({ clip });
  await page.evaluate(() => document.documentElement.classList.remove("hero-op-probe"));
  const png = PNG.sync.read(buf);
  const sample = (box) => {
    if (!box) return null;
    return {
      meanBgLum: meanLumInBox(png, box),
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    };
  };
  return {
    langEn: sample(boxes.lang),
    langZh: sample(boxes.zh),
    navWork: sample(boxes.nav),
  };
}

async function intrinsicAndLayout(page) {
  return page.evaluate(() => {
    const img = document.querySelector('[data-home-scene="0"] .home-scene-media-scale img');
    const scaleEl = document.querySelector('[data-home-scene="0"] .home-scene-media-scale');
    const stage = document.querySelector('[data-home-scene="0"] .home-scene-stage');
    if (!img || !scaleEl) return null;
    const cs = getComputedStyle(img);
    const scs = getComputedStyle(scaleEl);
    const gsapScale =
      typeof gsap !== "undefined" ? Number(gsap.getProperty(scaleEl, "scale")) : null;
    return {
      natural: { w: img.naturalWidth, h: img.naturalHeight },
      displayed: img.getBoundingClientRect(),
      scaleBox: scaleEl.getBoundingClientRect(),
      stage: stage?.getBoundingClientRect(),
      objectFit: cs.objectFit,
      objectPosition: cs.objectPosition,
      wrapperSize: { w: scs.width, h: scs.height },
      gsapScale,
      coverOverscan:
        scaleEl.getBoundingClientRect().width / window.innerWidth,
    };
  });
}

/** Inject preview rule only for scene 0 hero image */
async function applyCandidate(page, objectPosition) {
  await page.evaluate((op) => {
    let el = document.getElementById("hero-op-preview-style");
    if (!el) {
      el = document.createElement("style");
      el.id = "hero-op-preview-style";
      document.head.appendChild(el);
    }
    el.textContent = `
      /* PREVIEW candidate — not shipped */
      [data-home-scene="0"] .home-scene-media-scale img {
        object-position: ${op} !important;
      }`;
  }, objectPosition);
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
  });
  await page.waitForTimeout(200);
}

const CANDIDATES = [
  { id: "baseline", objectPosition: "center", note: "production default" },
  { id: "sky-35-22", objectPosition: "35% 22%", note: "shift anchor left/up — more sky on viewport right" },
  { id: "sky-28-18", objectPosition: "28% 18%", note: "stronger left/up — test right-edge sky continuity" },
  { id: "sky-42-30", objectPosition: "42% 30%", note: "moderate left/up" },
  { id: "top-50-12", objectPosition: "50% 12%", note: "raise horizon — risk: crop feet of mountains left" },
  { id: "dark-62-55", objectPosition: "62% 55%", note: "deeper forest anchor — aim uniform dark block right" },
];

const browser = await chromium.launch();
const views = [
  ["1440", { width: 1440, height: 900 }],
  ["375", { width: 375, height: 812 }],
];

const results = [];

for (const [vpTag, vp] of views) {
  const page = await browser.newPage();
  await page.setViewportSize(vp);
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));

  const layoutBefore = await intrinsicAndLayout(page);

  for (const cand of CANDIDATES) {
    await applyCandidate(page, cand.objectPosition);
    const layout = await intrinsicAndLayout(page);
    const backdrop = await measureLangBackdrop(page);
    const headerPath = `${OUT}/hero-op-${vpTag}-${cand.id}-header.png`;
    const fullPath = `${OUT}/hero-op-${vpTag}-${cand.id}-full.png`;
    await page.screenshot({ path: headerPath, clip: { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) } });
    await page.screenshot({ path: fullPath, fullPage: false });

    results.push({
      viewport: vpTag,
      ...cand,
      layout,
      backdrop,
      shots: { header: headerPath, full: fullPath },
      subjectRisk:
        cand.id.startsWith("sky")
          ? "May crop lower/right subject mass on scene0; verify mountain silhouettes in full frame."
          : cand.id === "dark-62-55"
            ? "May deepen mid-grey foliage under lang; verify not worse than baseline."
            : "baseline reference",
    });
  }

  results.push({ viewport: vpTag, layoutBaseline: layoutBefore });
  await page.close();
}

await browser.close();

const baseline1440 = results.find((r) => r.viewport === "1440" && r.id === "baseline");
const bestSky = results
  .filter((r) => r.id?.startsWith("sky") && r.viewport === "1440")
  .sort(
    (a, b) =>
      Math.abs((b.backdrop?.langEn?.meanBgLum ?? 0) - 220) -
      Math.abs((a.backdrop?.langEn?.meanBgLum ?? 0) - 220)
  )[0];

const report = {
  ...captureContext(),
  previewOnly: true,
  notApprovedForProduction: true,
  productionCssUnchanged: "assets/css/home.css object-position:center on scene img",
  intrinsicScene0: baseline1440?.layout,
  coverOverscanNote:
    "Wrapper is calc(100%/scale-from); GSAP scale ~0.75 at rest — image already overscanned; object-position only pans within cover box.",
  feasibility:
    baseline1440?.layout?.natural?.w >= 2000
      ? "Object-position has pan room within cover; effectiveness depends on source composition."
      : "Limited — verify natural dimensions",
  candidates: results.filter((r) => r.id),
  analysis: {
    baselineLangEnBgLum: baseline1440?.backdrop?.langEn?.meanBgLum,
    baselineNavBgLum: baseline1440?.backdrop?.navWork?.meanBgLum,
    closestSkyMatch: bestSky
      ? {
          id: bestSky.id,
          objectPosition: bestSky.objectPosition,
          langEnBgLum: bestSky.backdrop?.langEn?.meanBgLum,
          deltaToNav: Math.abs(
            (bestSky.backdrop?.langEn?.meanBgLum ?? 0) - (baseline1440?.backdrop?.navWork?.meanBgLum ?? 0)
          ),
        }
      : null,
  },
};

fs.writeFileSync(`${OUT}/hero-object-position-candidates.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.analysis, null, 2));
