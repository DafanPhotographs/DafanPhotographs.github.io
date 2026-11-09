/**
 * PREVIEW ONLY — Hero header A/B samples (no production CSS/HTML/JS).
 * A: shift desktop nav+lang cluster left over brighter sky.
 * B: separate normal-blend dual stroke overlay (not text-shadow on difference layer).
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import { execSync } from "child_process";
import path from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

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

/**
 * Variant B — two cloned chrome-blend layers, mix-blend-mode:normal, stroke-only (no fill).
 * Not text-shadow on the difference layer.
 */
async function applyVariantB(page) {
  await clearPreview(page);
  const ok = await page.evaluate(() => {
    const host = document.querySelector(".page-home .site-header--overlay .header-chrome");
    const src = document.querySelector(".page-home .site-header--overlay .header-chrome-blend");
    if (!host || !src) return { ok: false, reason: "missing header chrome" };

    function strokeClone(id, stroke, width) {
      const layer = src.cloneNode(true);
      layer.id = id;
      layer.removeAttribute("class");
      layer.className = "header-chrome-blend ab-stroke-overlay";
      layer.setAttribute("aria-hidden", "true");
      layer.style.cssText =
        "position:absolute;inset:0;margin:0;mix-blend-mode:normal;pointer-events:none;isolation:isolate;z-index:2;";
      layer.querySelectorAll(
        ".nav-link-label, .lang-switch__btn, .lang-switch__sep, .nav-decor"
      ).forEach((el) => {
        el.style.color = "transparent";
        el.style.webkitTextStroke = `${width}px ${stroke}`;
        el.style.textShadow = "none";
        el.style.background = "transparent";
        el.style.mixBlendMode = "normal";
        el.style.opacity = "1";
      });
      layer.querySelectorAll(".wordmark").forEach((a) => {
        a.style.color = "transparent";
        a.style.mixBlendMode = "normal";
      });
      layer.querySelectorAll(".wordmark__mark").forEach((svg) => {
        svg.style.fill = "transparent";
        svg.style.stroke = stroke;
        svg.style.strokeWidth = String(width * 1.4);
        svg.style.mixBlendMode = "normal";
      });
      host.style.position = "relative";
      host.appendChild(layer);
      return layer;
    }

    strokeClone("ab-stroke-layer-light", "#ffffff", 0.45);
    strokeClone("ab-stroke-layer-dark", "#1a120e", 0.35);

    const headerMix = getComputedStyle(document.querySelector(".site-header")).mixBlendMode;
    const lightMix = getComputedStyle(document.getElementById("ab-stroke-layer-light")).mixBlendMode;
    const darkMix = getComputedStyle(document.getElementById("ab-stroke-layer-dark")).mixBlendMode;
    const srcMix = getComputedStyle(src).mixBlendMode;
    const langOnDiff = getComputedStyle(
      document.querySelector('.lang-switch__btn[data-set-lang="en"]')
    ).mixBlendMode;

    return {
      ok: true,
      compositing: { headerMix, srcMix, langOnDiff, lightMix, darkMix },
      layerCount: host.querySelectorAll(".ab-stroke-overlay").length,
    };
  });
  await page.waitForTimeout(400);
  return ok;
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

async function buildComparisonSheet(captures, outPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1500, height: 2200 } });
  const rows = captures
    .map(
      (c) => `
    <section style="margin:24px 0;font-family:system-ui,sans-serif">
      <h2 style="margin:0 0 8px;font-size:15px;font-weight:600;letter-spacing:0.02em">${c.label}</h2>
      <p style="margin:0 0 12px;font-size:12px;color:#444;max-width:1440px">${c.note}</p>
      <img src="file://${c.header}" width="1440" style="display:block;border:1px solid #ccc" alt="">
    </section>`
    )
    .join("");
  await page.setContent(
    `<!doctype html><html><body style="background:#f5f5f0;padding:16px 24px 40px">${rows}</body></html>`
  );
  await page.screenshot({ path: outPath, fullPage: true });
  await browser.close();
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
  const bMetrics = await page.evaluate(() => {
    const light = document.getElementById("ab-stroke-layer-light");
    const dark = document.getElementById("ab-stroke-layer-dark");
    const under = document.querySelector(".header-chrome-blend:not(.ab-stroke-overlay)");
    return {
      lightAttached: !!light && light.parentElement?.classList.contains("header-chrome"),
      darkAttached: !!dark,
      underStillVisible: under ? getComputedStyle(under).visibility : null,
      headerMix: getComputedStyle(document.querySelector(".site-header")).mixBlendMode,
      lightMix: light ? getComputedStyle(light).mixBlendMode : null,
      darkMix: dark ? getComputedStyle(dark).mixBlendMode : null,
    };
  });
  variantB = {
    renderMethod:
      "Duplicate header-chrome-blend nodes appended to .header-chrome; fill transparent; -webkit-text-stroke + SVG stroke; mix-blend-mode:normal; header parent stays difference",
    parameters: { lightStroke: "0.45px #fff", darkStroke: "0.35px #1a120e", layers: 2 },
    compositing: bInject.compositing,
    domChecks: bMetrics,
    g24Note:
      "SVG wordmark uses stroke on cloned paths with fill:none; base difference wordmark unchanged underneath. Limitation: double halos may thicken perceptually; fine paths may fill-in at small strokes; no production accessibility for duplicate aria-hidden clones.",
    layout: await layoutMetrics(page),
    backdrop: await backdropMetrics(page),
    shots: await captureSet(page, "ab-variant-B-1440-zh"),
  };
} else {
  bBlocked = bInject;
}

await browser.close();

const comparisonCaptures = [
  {
    label: "Reference — current production (scroll0, zh active)",
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
    note: "Independent mix-blend-mode:normal stroke layers above difference chrome-blend",
    header: variantB.shots.header,
  });
}

const sheetPath = `${OUT}/ab-comparison-labeled-1440-zh.png`;
await buildComparisonSheet(comparisonCaptures, sheetPath);

const report = {
  previewOnly: true,
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
          "Stroke drawn in normal blend ON TOP of difference stack — improves edge cue but is not optically identical to per-pixel difference; G24 fine rings may coalesce; production would need accessible, non-duplicative markup review.",
      }
    : null,
  variantBBlocked: bBlocked,
  comparisonSheet: sheetPath,
  files: [
    reference.shots.full,
    reference.shots.header,
    variantA.shots.full,
    variantA.shots.header,
    ...(variantB ? [variantB.shots.full, variantB.shots.header] : []),
    sheetPath,
  ],
};

fs.writeFileSync(`${OUT}/hero-ab-preview-report.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ head: HEAD, chosenPx, variantB: !!variantB, sheetPath }, null, 2));
