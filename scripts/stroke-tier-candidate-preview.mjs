/**
 * PREVIEW ONLY — one stronger dual-stroke tier for art review (no production token/CSS commits).
 * Baseline = production @ HEAD. Candidate = temp :root vars + swapped portal paint order (light on top).
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { execSync, spawnSync } from "child_process";
import { scrollToScene, scrollToDarkestForestBackdrop } from "./evidence-lib.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

const PRODUCTION = {
  wLight: "0.45px",
  wDark: "0.35px",
  svgScale: "1.25",
  portalOrder: "light-then-dark",
  note: "Dark portal after light in DOM → dark ring paints on top; 0.35px may nest inside 0.45px white and reduce visible halo on mid-tone foliage.",
};

/** One tier up: slightly wider text strokes, lower G24 vector scale, light portal on top. */
const CANDIDATE_C1 = {
  id: "C1",
  wLight: "0.52px",
  wDark: "0.40px",
  svgScale: "1.08",
  portalOrder: "dark-then-light",
  note: "Light stroke last (outer halo); G24 svg-scale 1.08 vs 1.25 to limit ring clogging; text +0.07/0.05px — not final art.",
};

async function setLang(page, lang) {
  await page.locator(`.lang-switch__btn[data-set-lang="${lang}"]`).click();
  await page.waitForTimeout(280);
}

async function clearPreview(page) {
  await page.evaluate(() => {
    document.getElementById("stroke-tier-preview-style")?.remove();
    document.documentElement.classList.remove("stroke-tier-preview");
    const root = document.getElementById("header-stroke-portals");
    const light = document.getElementById("header-stroke-portal-light");
    const dark = document.getElementById("header-stroke-portal-dark");
    if (root && light && dark && root.firstElementChild !== light) {
      root.insertBefore(light, dark);
    }
  });
  await page.waitForTimeout(120);
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(200);
}

async function applyVariant(page, variant) {
  await clearPreview(page);
  if (variant === "production") return;

  await page.evaluate((c1) => {
    const el = document.createElement("style");
    el.id = "stroke-tier-preview-style";
    el.textContent = `
      html.stroke-tier-preview {
        --header-stroke-width-light: ${c1.wLight};
        --header-stroke-width-dark: ${c1.wDark};
        --header-stroke-svg-scale: ${c1.svgScale};
      }`;
    document.head.appendChild(el);
    document.documentElement.classList.add("stroke-tier-preview");
    const root = document.getElementById("header-stroke-portals");
    const light = document.getElementById("header-stroke-portal-light");
    const dark = document.getElementById("header-stroke-portal-dark");
    if (root && light && dark) {
      root.insertBefore(dark, light);
    }
  }, CANDIDATE_C1);
  await page.waitForTimeout(120);
  await page.evaluate(() => window.dispatchEvent(new Event("resize")));
  await page.waitForTimeout(350);
}

async function readStrokeMeta(page) {
  return page.evaluate(() => {
    const root = document.getElementById("header-stroke-portals");
    const light = document.getElementById("header-stroke-portal-light");
    const dark = document.getElementById("header-stroke-portal-dark");
    const s = getComputedStyle(document.documentElement);
    return {
      wLight: s.getPropertyValue("--header-stroke-width-light").trim(),
      wDark: s.getPropertyValue("--header-stroke-width-dark").trim(),
      svgScale: s.getPropertyValue("--header-stroke-svg-scale").trim(),
      portalChildOrder: root
        ? [...root.children].map((c) => c.id)
        : null,
    };
  });
}

async function captureHeader(page, filePath) {
  const vp = page.viewportSize();
  await page.screenshot({
    path: filePath,
    clip: { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) },
  });
}

async function captureFull(page, filePath) {
  await page.screenshot({ path: filePath, fullPage: false });
}

async function captureCrop(page, selector, filePath, pad = 10) {
  const box = await page.locator(selector).boundingBox();
  if (!box) throw new Error(`no box for ${selector}`);
  const vp = page.viewportSize();
  const clip = {
    x: Math.max(0, box.x - pad),
    y: Math.max(0, box.y - pad),
    width: Math.min(vp.width - Math.max(0, box.x - pad), box.width + pad * 2),
    height: Math.min(vp.height - Math.max(0, box.y - pad), box.height + pad * 2),
  };
  await page.screenshot({ path: filePath, clip });
}

async function captureStrokeOnlyHeader(page, filePath) {
  const vp = page.viewportSize();
  await page.evaluate(() => {
    const chrome = document.querySelector(".header-chrome");
    if (chrome) chrome.dataset.strokeTierWasVis = getComputedStyle(chrome).visibility;
    document.querySelector(".header-chrome").style.visibility = "hidden";
  });
  await page.waitForTimeout(80);
  await page.screenshot({
    path: filePath,
    clip: { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) },
  });
  await page.evaluate(() => {
    const chrome = document.querySelector(".header-chrome");
    if (chrome) chrome.style.visibility = chrome.dataset.strokeTierWasVis || "";
  });
}

function buildSheet(rows, outPath) {
  const specPath = `${OUT}/stroke-tier-comparison-spec.json`;
  fs.writeFileSync(specPath, JSON.stringify({ rows }, null, 2));
  const py = path.join(__dirname, "build_ab_comparison.py");
  const r = spawnSync("python3", [py, specPath, outPath], { encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.status !== 0) throw new Error(r.stderr || "build_ab_comparison failed");
}

async function gotoBrightHero(page) {
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
}

async function gotoDarkForest(page) {
  await gotoBrightHero(page);
  await scrollToScene(page, "2");
  await page.waitForTimeout(400);
}

async function gotoMidScroll(page) {
  await gotoBrightHero(page);
  await scrollToScene(page, "1");
  await page.waitForTimeout(500);
}

const captures = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });

for (const variant of ["production", "candidate"]) {
  await gotoBrightHero(page);
  await setLang(page, "en");
  await applyVariant(page, variant);
  const tag = variant === "production" ? "prod" : "C1";
  const full = `${OUT}/stroke-tier-1440-en-bright-${tag}-full.png`;
  const header = `${OUT}/stroke-tier-1440-en-bright-${tag}-header.png`;
  const cropEn = `${OUT}/stroke-tier-crop-en-bright-${tag}.png`;
  await captureFull(page, full);
  await captureHeader(page, header);
  await captureCrop(page, '.lang-switch__btn[data-set-lang="en"] .lang-switch__label', cropEn, 14);
  captures.push({ variant, scene: "en-bright", full, header, cropEn, meta: await readStrokeMeta(page) });
}

for (const variant of ["production", "candidate"]) {
  await gotoDarkForest(page);
  await setLang(page, "en");
  await applyVariant(page, variant);
  const tag = variant === "production" ? "prod" : "C1";
  const full = `${OUT}/stroke-tier-1440-en-dark-${tag}-full.png`;
  const header = `${OUT}/stroke-tier-1440-en-dark-${tag}-header.png`;
  const cropG24 = `${OUT}/stroke-tier-crop-g24-dark-${tag}.png`;
  await captureFull(page, full);
  await captureHeader(page, header);
  await captureCrop(page, ".header-chrome .wordmark__mark", cropG24, 6);
  captures.push({ variant, scene: "en-dark-g24", full, header, cropG24, meta: await readStrokeMeta(page) });
}

for (const lang of ["zh", "en"]) {
  for (const variant of ["production", "candidate"]) {
    await gotoMidScroll(page);
    await setLang(page, lang);
    await applyVariant(page, variant);
    const tag = variant === "production" ? "prod" : "C1";
    const header = `${OUT}/stroke-tier-1440-mid-${lang}-${tag}-header.png`;
    await captureHeader(page, header);
    captures.push({ variant, scene: `mid-${lang}`, header, meta: await readStrokeMeta(page) });
  }
}

await gotoBrightHero(page);
await setLang(page, "en");
for (const variant of ["production", "candidate"]) {
  await applyVariant(page, variant);
  const tag = variant === "production" ? "prod" : "C1";
  const strokeOnly = `${OUT}/stroke-tier-1440-stroke-only-${tag}-header.png`;
  await captureStrokeOnlyHeader(page, strokeOnly);
  captures.push({ variant, scene: "stroke-only", strokeOnly, meta: await readStrokeMeta(page) });
}

await browser.close();

const sheetRows = [
  {
    label: "EN bright — production @ HEAD (60f2b12…)",
    note: `${PRODUCTION.wLight} / ${PRODUCTION.wDark}; svg-scale ${PRODUCTION.svgScale}; dark portal on top`,
    header: `${OUT}/stroke-tier-1440-en-bright-prod-header.png`,
  },
  {
    label: "EN bright — candidate C1 (preview tokens only)",
    note: `${CANDIDATE_C1.wLight} / ${CANDIDATE_C1.wDark}; svg ${CANDIDATE_C1.svgScale}; light portal on top`,
    header: `${OUT}/stroke-tier-1440-en-bright-C1-header.png`,
  },
  {
    label: "G24 dark forest — production crop",
    note: "1:1 viewport crop; no upscale",
    header: `${OUT}/stroke-tier-crop-g24-dark-prod.png`,
  },
  {
    label: "G24 dark forest — candidate C1 crop",
    note: "Lower svg-scale to reduce ring fill; watch aperture clutter",
    header: `${OUT}/stroke-tier-crop-g24-dark-C1.png`,
  },
  {
    label: "Mid-scroll EN — production",
    note: "Scene 1 center; overlay header",
    header: `${OUT}/stroke-tier-1440-mid-en-prod-header.png`,
  },
  {
    label: "Mid-scroll EN — candidate C1",
    note: "Same scroll; preview stroke tier only",
    header: `${OUT}/stroke-tier-1440-mid-en-C1-header.png`,
  },
];

const sheetPath = `${OUT}/stroke-tier-comparison-labeled-1440.png`;
buildSheet(sheetRows, sheetPath);

const refPaths = [
  `${OUT}/lang-switch-1440-en-bright.png`,
  `${OUT}/lang-switch-1440-en-dark.png`,
];
const refNote = refPaths.map((p) => ({ path: p, exists: fs.existsSync(p) }));

const report = {
  previewOnly: true,
  notProductionNotApproved: true,
  captureGitSha: HEAD,
  auditRef: "AUDIT_aead.md — EN bright/forest weak; do not pass on dualTone alone",
  productionStroke: PRODUCTION,
  candidateC1: CANDIDATE_C1,
  swallowingAnalysis: {
    mechanism:
      "Two independent -webkit-text-stroke layers (light portal, dark portal). Same glyph geometry; thinner dark on top can dominate antialiased edge on busy mid-luma backdrops.",
    productionPaintOrder: "DOM: #header-stroke-portal-light then #header-stroke-portal-dark → dark composites on top",
    candidatePaintOrder: "Preview swaps to dark then light → light halo remains visible outside",
    g24Split:
      "Single --header-stroke-svg-scale applies to G24 clone; C1 lowers scale only (1.08) while text widths increase slightly — intentional split via token, not separate production vars yet",
    risk:
      "Wider text strokes or higher svg-scale can clog G24 rings; C1 trades lower svg-scale for wider text strokes — may look thinner on G24 but less muddy on EN",
  },
  captures,
  referenceEvidencePngs: refNote,
  comparisonSheet: sheetPath,
  limitations: [
    "Candidate uses injected CSS + DOM order swap in browser only; not committed to tokens.css",
    "No independent human QA; art must judge crops and header PNGs by eye",
    "C1 not validated on solid closing (portals hidden there anyway)",
  ],
  deliverables: [
    sheetPath,
    `${OUT}/stroke-tier-1440-en-bright-prod-full.png`,
    `${OUT}/stroke-tier-1440-en-bright-C1-full.png`,
    `${OUT}/stroke-tier-crop-en-bright-prod.png`,
    `${OUT}/stroke-tier-crop-en-bright-C1.png`,
    `${OUT}/stroke-tier-crop-g24-dark-prod.png`,
    `${OUT}/stroke-tier-crop-g24-dark-C1.png`,
    `${OUT}/stroke-tier-1440-stroke-only-prod-header.png`,
    `${OUT}/stroke-tier-1440-stroke-only-C1-header.png`,
    `${OUT}/stroke-tier-1440-mid-en-prod-header.png`,
    `${OUT}/stroke-tier-1440-mid-en-C1-header.png`,
    `${OUT}/stroke-tier-candidate-report.json`,
  ],
};

fs.writeFileSync(`${OUT}/stroke-tier-candidate-report.json`, JSON.stringify(report, null, 2));

const zipPath = `${OUT}/stroke-tier-candidate-preview.zip`;
if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
const zipFiles = report.deliverables.filter((p) => fs.existsSync(p));
execSync(`zip -j "${zipPath}" ${zipFiles.map((p) => `"${p}"`).join(" ")}`, { stdio: "inherit" });

console.log(JSON.stringify({ head: HEAD, sheetPath, zipPath, zipCount: zipFiles.length }, null, 2));
