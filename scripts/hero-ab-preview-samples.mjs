/**
 * PREVIEW ONLY — Hero header A/B samples (no production CSS/HTML/JS).
 * A: shift desktop nav+lang cluster left over brighter sky.
 * B: separate normal-blend dual stroke overlay (not text-shadow on difference layer).
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import { execSync, spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

async function backdropMetrics(page) {
  const vp = page.viewportSize();
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };
  const boxes = await page.evaluate(() => ({
    wm: document.querySelector(".wordmark")?.getBoundingClientRect(),
    cluster: document.querySelector(".header-cluster")?.getBoundingClientRect(),
    langEn: document.querySelector('.lang-switch__btn[data-set-lang="en"]')?.getBoundingClientRect(),
    nav: document.querySelector(".nav-link-label")?.getBoundingClientRect(),
  }));
  await page.addStyleTag({
    content: "html.ab-probe .header-chrome{visibility:hidden!important}",
  });
  await page.evaluate(() => document.documentElement.classList.add("ab-probe"));
  const buf = await page.screenshot({ clip });
  await page.evaluate(() => document.documentElement.classList.remove("ab-probe"));
  const png = PNG.sync.read(buf);
  const pick = (b) => (b ? { meanBgLum: meanLumInBox(png, b), box: { left: b.left, right: b.right, top: b.top } } : null);
  return {
    wordmark: pick(boxes.wm),
    cluster: boxes.cluster
      ? { left: boxes.cluster.left, right: boxes.cluster.right, width: boxes.cluster.width }
      : null,
    langEn: pick(boxes.langEn),
    nav: pick(boxes.nav),
    gapWordmarkToCluster: boxes.cluster && boxes.wm ? boxes.cluster.left - boxes.wm.right : null,
  };
}

async function layoutMetrics(page) {
  return page.evaluate(() => {
    const wm = document.querySelector(".wordmark")?.getBoundingClientRect();
    const clusterEl = document.querySelector(".header-cluster");
    const cluster = clusterEl?.getBoundingClientRect();
    const header = document.querySelector(".site-header");
    return {
      headerClasses: header?.className,
      wmRight: wm?.right,
      clusterLeft: cluster?.left,
      clusterRight: cluster?.right,
      gapWmCluster: cluster && wm ? cluster.left - wm.right : null,
      clusterTransform: clusterEl ? getComputedStyle(clusterEl).transform : null,
      headerMix: header ? getComputedStyle(header).mixBlendMode : null,
    };
  });
}

async function clearPreview(page) {
  await page.evaluate(() => {
    document.getElementById("ab-preview-style")?.remove();
    document.getElementById("ab-stroke-portal-light")?.remove();
    document.getElementById("ab-stroke-portal-dark")?.remove();
    document.getElementById("ab-stroke-layer-light")?.remove();
    document.getElementById("ab-stroke-layer-dark")?.remove();
    document.querySelector(".header-cluster")?.style.removeProperty("transform");
  });
}

/** Variant A — translate entire header-cluster (nav + lang) on desktop overlay only */
async function applyVariantA(page, translatePx) {
  await clearPreview(page);
  await page.evaluate((px) => {
    const el = document.createElement("style");
    el.id = "ab-preview-style";
    el.textContent = `
      @media (min-width: 768px) {
        .page-home .site-header--overlay .header-cluster {
          transform: translateX(${px}px) !important;
        }
      }`;
    document.head.appendChild(el);
  }, translatePx);
  await page.waitForTimeout(350);
}

/** Variant B — body-level fixed portals (siblings outside .site-header), normal compositing only. */
async function applyVariantB(page) {
  await clearPreview(page);
  const ok = await page.evaluate(() => {
    const header = document.querySelector(".site-header");
    if (!header?.classList.contains("site-header--overlay")) {
      return { ok: false, reason: "not overlay header" };
    }

    function visible(el) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.opacity !== "0" && cs.display !== "none";
    }

    function makePortal(id) {
      const p = document.createElement("div");
      p.id = id;
      p.setAttribute("aria-hidden", "true");
      p.className = "ab-stroke-portal";
      p.style.cssText =
        "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;z-index:2147483000;mix-blend-mode:normal;isolation:isolate;";
      document.body.appendChild(p);
      return p;
    }

    const lightPortal = makePortal("ab-stroke-portal-light");
    const darkPortal = makePortal("ab-stroke-portal-dark");

    const targets = [];
    document
      .querySelectorAll(".site-header--overlay .nav-link-label, .site-header--overlay .lang-switch__btn, .site-header--overlay .lang-switch__sep")
      .forEach((el) => {
        if (visible(el)) targets.push(el);
      });

    function stamp(portal, stroke, width) {
      for (const el of targets) {
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        const label =
          el.querySelector(".lang-switch__label")?.textContent?.trim() || el.textContent?.trim() || "";
        const ghost = document.createElement("span");
        ghost.textContent = label;
        ghost.style.cssText = [
          "position:fixed",
          `left:${r.left}px`,
          `top:${r.top}px`,
          `width:${r.width}px`,
          `height:${r.height}px`,
          `font:${cs.font}`,
          `font-size:${cs.fontSize}`,
          `font-weight:${cs.fontWeight}`,
          `font-family:${cs.fontFamily}`,
          `letter-spacing:${cs.letterSpacing}`,
          `line-height:${cs.lineHeight}`,
          "display:inline-flex",
          "align-items:center",
          "justify-content:center",
          "color:transparent",
          `-webkit-text-stroke:${width}px ${stroke}`,
          "text-shadow:none",
          "background:transparent",
          "mix-blend-mode:normal",
          "pointer-events:none",
          "white-space:nowrap",
        ].join(";");
        portal.appendChild(ghost);
      }

      const svgSrc = document.querySelector(".site-header--overlay .wordmark__mark");
      if (svgSrc && visible(svgSrc)) {
        const r = svgSrc.getBoundingClientRect();
        const wrap = document.createElement("div");
        wrap.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;pointer-events:none;mix-blend-mode:normal;`;
        const svg = svgSrc.cloneNode(true);
        svg.style.fill = "transparent";
        svg.style.stroke = stroke;
        svg.style.strokeWidth = String(width * 1.25);
        svg.style.width = "100%";
        svg.style.height = "100%";
        wrap.appendChild(svg);
        portal.appendChild(wrap);
      }
    }

    stamp(lightPortal, "#ffffff", 0.45);
    stamp(darkPortal, "#1a120e", 0.35);

    const light = document.getElementById("ab-stroke-portal-light");
    return {
      ok: true,
      dom: {
        portalParentTag: light?.parentElement?.tagName,
        portalInsideSiteHeader: !!light?.closest(".site-header"),
        portalIsBodyChild: light?.parentElement === document.body,
        headerMix: getComputedStyle(header).mixBlendMode,
        portalMix: light ? getComputedStyle(light).mixBlendMode : null,
      },
    };
  });
  await page.waitForTimeout(400);
  return ok;
}

function readRgb(png, x, y) {
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

function lum(rgb) {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

/** Pixel proof: portal strokes stay ~#fff / ~#1a120e with chrome hidden; difference fills vary more when visible. */
async function verifyStrokePortal(page) {
  const vp = page.viewportSize();
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };
  const enBox = await page.locator('.lang-switch__btn[data-set-lang="en"]').boundingBox();
  const zhBox = await page.locator('.lang-switch__btn[data-set-lang="zh"]').boundingBox();
  if (!enBox) return null;

  await page.evaluate(() => {
    const chrome = document.querySelector(".header-chrome");
    if (chrome) chrome.dataset.abWasVisibility = getComputedStyle(chrome).visibility;
    document.querySelector(".header-chrome").style.visibility = "hidden";
  });
  const strokeOnly = await page.screenshot({ clip });
  await page.evaluate(() => {
    const chrome = document.querySelector(".header-chrome");
    if (chrome) chrome.style.visibility = chrome.dataset.abWasVisibility || "";
  });
  const full = await page.screenshot({ clip });
  const strokePng = PNG.sync.read(strokeOnly);
  const fullPng = PNG.sync.read(full);

  const probes = [];
  const enXs = [0.2, 0.5, 0.8].map((t) => Math.floor(enBox.x + enBox.width * t));
  const enY = Math.floor(enBox.y + enBox.height * 0.5);
  for (const x of enXs) {
    const strokeRgb = readRgb(strokePng, x, enY);
    const fullRgb = readRgb(fullPng, x, enY);
    probes.push({
      target: "langEn",
      x,
      strokeOnlyRgb: strokeRgb,
      strokeOnlyLum: lum(strokeRgb),
      fullCompRgb: fullRgb,
      fullCompLum: lum(fullRgb),
    });
  }

  let lightStroke = null;
  let darkStroke = null;
  if (zhBox) {
    const lx = Math.floor(zhBox.x + zhBox.width * 0.35);
    const dx = Math.floor(zhBox.x + zhBox.width * 0.65);
    const y = Math.floor(zhBox.y + zhBox.height * 0.5);
    const scan = (x0, x1, want) => {
      let best = null;
      for (let x = x0; x <= x1; x++) {
        const rgb = readRgb(strokePng, x, y);
        const L = lum(rgb);
        const score = want === "light" ? L : 255 - L;
        if (!best || score > best.score) best = { x, rgb, lum: L, score };
      }
      return best;
    };
    lightStroke = scan(lx - 6, lx + 6, "light");
    darkStroke = scan(dx - 6, dx + 6, "dark");
  }

  const fillSpread =
    Math.max(...probes.map((s) => s.fullCompLum)) - Math.min(...probes.map((s) => s.fullCompLum));
  const strokeGlyphSpread =
    Math.max(...probes.map((s) => s.strokeOnlyLum)) - Math.min(...probes.map((s) => s.strokeOnlyLum));

  const lightOk =
    lightStroke &&
    lightStroke.rgb[0] >= 170 &&
    lightStroke.rgb[1] >= 170 &&
    lightStroke.rgb[2] >= 170;
  const darkOk = darkStroke && Math.max(...darkStroke.rgb) <= 100 && darkStroke.lum < 120;
  const notDifferenceInverted =
    lightOk && darkOk && lightStroke.lum - darkStroke.lum >= 80;

  return {
    probes,
    lightStroke,
    darkStroke,
    fillGlyphLumSpread: fillSpread,
    strokeGlyphLumSpread: strokeGlyphSpread,
    strokeColorsStablePass: Boolean(notDifferenceInverted),
    note:
      "With .header-chrome hidden, body portals still paint #fff / #1a120e strokes (light+dark both present). Difference fills underneath flip with backdrop; portal strokes do not.",
    limitation:
      "Antialiased stroke pixels composite over live hero photo in normal mode, so measured RGB is not pure #fff/#1a120e — test checks light≫dark, not exact hex.",
  };
}

async function captureSet(page, prefix) {
  const vp = page.viewportSize();
  const header = `${OUT}/${prefix}-header.png`;
  const full = `${OUT}/${prefix}-full.png`;
  await page.screenshot({ path: full, fullPage: false });
  await page.screenshot({
    path: header,
    clip: { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) },
  });
  return { header, full };
}

function buildComparisonSheet(captures, outPath) {
  const specPath = `${OUT}/ab-comparison-spec.json`;
  fs.writeFileSync(specPath, JSON.stringify({ rows: captures }, null, 2));
  const py = path.join(__dirname, "build_ab_comparison.py");
  const r = spawnSync("python3", [py, specPath, outPath], { encoding: "utf8" });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) throw new Error(`build_ab_comparison.py failed: ${r.stderr}`);
}

function pickTranslatePx(sweep) {
  const targetLum = 180;
  const ok = sweep.filter(
    (s) =>
      (s.backdrop?.langEn?.meanBgLum ?? 0) >= targetLum &&
      (s.layout?.gapWmCluster ?? 0) >= 480
  );
  if (!ok.length) {
    return sweep.reduce(
      (best, s) =>
        (s.backdrop?.langEn?.meanBgLum ?? 0) > (best.backdrop?.langEn?.meanBgLum ?? 0) ? s : best,
      sweep[0]
    );
  }
  return ok.reduce((best, s) =>
    Math.abs(s.translatePx) < Math.abs(best.translatePx) ? s : best
  );
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('.lang-switch__btn[data-set-lang="zh"]').click();
await page.waitForTimeout(200);

await clearPreview(page);
const reference = {
  layout: await layoutMetrics(page),
  backdrop: await backdropMetrics(page),
  shots: await captureSet(page, "ab-reference-1440-zh"),
};

/** Sweep cluster translate for variant A */
const sweepPx = [0, -40, -80, -120, -160, -200];
const sweep = [];
for (const translatePx of sweepPx) {
  await applyVariantA(page, translatePx);
  sweep.push({
    translatePx,
    layout: await layoutMetrics(page),
    backdrop: await backdropMetrics(page),
  });
}
const chosen = pickTranslatePx(sweep);
const chosenPx = chosen.translatePx ?? -120;
await applyVariantA(page, chosenPx);
const variantA = {
  translatePx: chosenPx,
  layout: await layoutMetrics(page),
  backdrop: await backdropMetrics(page),
  shots: await captureSet(page, "ab-variant-A-1440-zh"),
  sweep,
};

await clearPreview(page);
const bInject = await applyVariantB(page);
let variantB = null;
let bBlocked = null;
if (bInject.ok) {
  const pixelVerify = await verifyStrokePortal(page);
  variantB = {
    renderMethod:
      "Two fixed-position portals appended to document.body (NOT inside .site-header). Stroke-only ghosts synced to live geometry; fills remain on difference header underneath.",
    parameters: { lightStroke: "0.45px #fff", darkStroke: "0.35px #1a120e", portalParent: "BODY" },
    domChecks: bInject.dom,
    pixelVerify,
    g24Note:
      "Cloned SVG with transparent fill + vector stroke in body portal; underlying G24 still difference-composited. Halo may thicken rings; aria-hidden duplicates; not production a11y.",
    layout: await layoutMetrics(page),
    backdrop: await backdropMetrics(page),
    shots: await captureSet(page, "ab-variant-B-1440-zh"),
    strokeOnlyHeader: await (async () => {
      const vp = page.viewportSize();
      await page.evaluate(() => {
        document.querySelector(".header-chrome").style.visibility = "hidden";
      });
      const p = `${OUT}/ab-variant-B-1440-zh-stroke-only-header.png`;
      await page.screenshot({ path: p, clip: { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) } });
      await page.evaluate(() => {
        document.querySelector(".header-chrome").style.visibility = "";
      });
      return p;
    })(),
  };
} else {
  bBlocked = bInject;
}

await browser.close();

const comparisonCaptures = [
  {
    label: "Reference — PR preview baseline @ scroll0, zh active",
    note: `HEAD ${HEAD}; cluster right ${reference.layout.clusterRight?.toFixed(1)}; gap to G24 ${reference.layout.gapWmCluster?.toFixed(1)}px`,
    header: reference.shots.header,
  },
  {
    label: "Variant A — desktop nav+lang cluster translateX",
    note: `translateX(${variantA.translatePx}px); cluster right ${variantA.layout.clusterRight?.toFixed(1)}; langEn bg lum ${variantA.backdrop.langEn?.meanBgLum?.toFixed(1)} (ref ${reference.backdrop.langEn?.meanBgLum?.toFixed(1)})`,
    header: variantA.shots.header,
  },
];
if (variantB) {
  comparisonCaptures.push({
    label: "Variant B — normal-blend dual stroke overlay (preview DOM clones)",
    note: "Body-level fixed portals (outside difference header); verified stroke pixels",
    header: variantB.shots.header,
  });
}

const sheetPath = `${OUT}/ab-comparison-labeled-1440-zh.png`;
await buildComparisonSheet(comparisonCaptures, sheetPath);

const report = {
  previewOnly: true,
  notApprovedNotProduction: "Sample renders only; PR branch / local static preview ≠ deployed site",
  captureGitSha: HEAD,
  capturedAt: new Date().toISOString(),
  scene: "hero scroll0, 1440×900, zh active (中文 selected)",
  noProductionChanges: true,
  reference,
  variantA: {
    description: "Entire .header-cluster (nav + lang) shifted left; photo/scale/difference unchanged; mobile unchanged",
    chosenTranslatePx: chosenPx,
    layout: variantA.layout,
    backdrop: variantA.backdrop,
    shots: variantA.shots,
    sweepSummary: sweep.map((s) => ({
      px: s.translatePx,
      clusterRight: s.layout.clusterRight,
      gapWmCluster: s.layout.gapWmCluster,
      langEnBgLum: s.backdrop.langEn?.meanBgLum,
      navBgLum: s.backdrop.nav?.meanBgLum,
    })),
    limitations:
      "Cluster moves relative to G24 flex row; does not change photo crop. Large shifts reduce gap below wordmark; does not fix mid-scroll scenes.",
  },
  variantB: variantB
    ? {
        ...variantB,
        limitations:
          "Portals paint in document normal compositing above the page; they do not change difference math on fills. Dual strokes add weight; G24 SVG halos are approximate; duplicate aria-hidden ghosts unsuitable for ship without design/a11y review.",
      }
    : null,
  variantBBlocked: bBlocked,
  comparisonSheet: sheetPath,
  files: [
    reference.shots.full,
    reference.shots.header,
    variantA.shots.full,
    variantA.shots.header,
    ...(variantB
      ? [variantB.shots.full, variantB.shots.header, variantB.strokeOnlyHeader]
      : []),
    sheetPath,
  ],
};

fs.writeFileSync(`${OUT}/hero-ab-preview-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ head: HEAD, chosenPx, variantB: !!variantB, sheetPath }, null, 2));
