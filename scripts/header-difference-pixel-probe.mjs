/**
 * Same-frame header pixel probe: background (chrome hidden) vs composed.
 * Picks the highest-contrast ink pixel inside .wordmark bbox (not bbox center).
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import crypto from "crypto";
import { execSync } from "child_process";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = "/opt/cursor/artifacts";
const SHA = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function findInkSample(bgBuf, fgBuf, rect) {
  const bg = PNG.sync.read(bgBuf);
  const fg = PNG.sync.read(fgBuf);
  const x0 = Math.max(0, Math.floor(rect.x));
  const y0 = Math.max(0, Math.floor(rect.y));
  const x1 = Math.min(bg.width, Math.ceil(rect.x + rect.width));
  const y1 = Math.min(bg.height, Math.ceil(rect.y + rect.height));
  let best = null;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (bg.width * y + x) << 2;
      const d =
        Math.abs(fg.data[i] - bg.data[i]) +
        Math.abs(fg.data[i + 1] - bg.data[i + 1]) +
        Math.abs(fg.data[i + 2] - bg.data[i + 2]);
      if (!best || d > best.diffSum) {
        const bgRgb = [bg.data[i], bg.data[i + 1], bg.data[i + 2]];
        const compRgb = [fg.data[i], fg.data[i + 1], fg.data[i + 2]];
        const expected = bgRgb.map((b) => Math.abs(255 - b));
        best = {
          x,
          y,
          diffSum: d,
          bgRgb,
          compRgb,
          expectedDifferenceRgb: expected,
          deltaFromExpected: compRgb.map((c, j) => c - expected[j]),
        };
      }
    }
  }
  return best;
}

async function activeSceneMeta(page) {
  return page.evaluate(() => {
    const scenes = [...document.querySelectorAll("[data-home-scene]")];
    let active = "unknown";
    for (const el of scenes) {
      const r = el.getBoundingClientRect();
      const mid = window.innerHeight * 0.35;
      if (r.top <= mid && r.bottom > 80) active = el.getAttribute("data-home-scene");
    }
    return {
      activeScene: active,
      scrollY: window.scrollY,
      headerSolid: document.querySelector(".site-header")?.classList.contains("site-header--solid"),
      headerMode: document.querySelector(".site-header")?.getAttribute("data-header-mode"),
      photoEndTop: document.querySelector("[data-home-photo-zone-end]")?.getBoundingClientRect().top,
    };
  });
}

async function probeFrame(page, label, extra = {}) {
  const wmBox = await page.locator(".wordmark").boundingBox();
  if (!wmBox) throw new Error("no wordmark box");

  const vp = page.viewportSize();
  const dpr = extra.dpr ?? 1;
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };

  await page.addStyleTag({
    content: "html.probe-hide-header-chrome .header-chrome { visibility: hidden !important; }",
  });
  await page.evaluate(() => document.documentElement.classList.add("probe-hide-header-chrome"));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const bgPath = `${OUT}/pr11-probe-${label}-bg.png`;
  const bgBuf = await page.screenshot({ clip });

  await page.evaluate(() => document.documentElement.classList.remove("probe-hide-header-chrome"));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  const fgPath = `${OUT}/pr11-probe-${label}-composed.png`;
  const fgBuf = await page.screenshot({ clip });
  fs.writeFileSync(bgPath, bgBuf);
  fs.writeFileSync(fgPath, fgBuf);

  const sample = findInkSample(bgBuf, fgBuf, wmBox);
  const sceneMeta = await activeSceneMeta(page);
  const wmStyle = await page.locator(".wordmark").evaluate((el) => {
    const s = getComputedStyle(el);
    return { color: s.color, fontSize: s.fontSize, fontWeight: s.fontWeight, fontFamily: s.fontFamily };
  });
  const hdrStyle = await page.locator(".site-header").evaluate((el) => ({
    mixBlendMode: getComputedStyle(el).mixBlendMode,
    className: el.className,
  }));

  const fullPath = `${OUT}/pr11-frame-${label}.png`;
  const fullBuf = await page.screenshot({ path: fullPath, fullPage: false });

  return {
    label,
    gitSha: SHA,
    viewport: { width: vp.width, height: vp.height, dpr },
    ...extra,
    ...sceneMeta,
    wordmarkBox: wmBox,
    sample,
    wordmarkComputed: wmStyle,
    header: hdrStyle,
    sha256: {
      clipBg: sha256File(bgPath),
      clipComposed: sha256File(fgPath),
      fullFrame: sha256File(fullPath),
    },
    paths: { bgPath, fgPath, fullPath },
    fullFrameBytes: fullBuf.length,
  };
}

async function scrollToScene(page, sceneId) {
  await page.evaluate((id) => {
    const el = document.querySelector('[data-home-scene="' + id + '"]');
    if (el) el.scrollIntoView({ block: "start" });
  }, sceneId);
  await page.waitForTimeout(450);
}

async function scrollToSolid(page) {
  for (let i = 0; i < 8; i++) {
    const ok = await page.evaluate(() => {
      const header = document.querySelector(".site-header");
      const end = document.querySelector("[data-home-photo-zone-end]");
      if (!header || !end) return false;
      const headerH = header.getBoundingClientRect().height;
      const endTop = end.getBoundingClientRect().top;
      if (endTop <= headerH + 0.5) return true;
      const y = endTop + window.scrollY - headerH;
      window.scrollTo(0, y);
      return false;
    });
    await page.waitForTimeout(350);
    if (ok) break;
  }
}

const probes = [];
const browser = await chromium.launch();

async function runDesktop(lang, extra) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${BASE}/`);
  await page.waitForLoadState("networkidle");
  if (lang === "en") await page.locator('[data-set-lang="en"]').click();
  probes.push(await probeFrame(page, `1440-${lang}-hero0`, { lang }));
  await page.close();
}

await runDesktop("zh", {});
await runDesktop("en", {});

const page375 = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2 });
await page375.goto(`${BASE}/`);
await page375.waitForLoadState("networkidle");
probes.push(await probeFrame(page375, "375-zh-hero0", { lang: "zh", dpr: 2 }));

const pageScenes = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await pageScenes.goto(`${BASE}/`);
await pageScenes.waitForLoadState("networkidle");
for (const id of ["1", "2", "3"]) {
  await scrollToScene(pageScenes, id);
  const meta = await activeSceneMeta(pageScenes);
  if (meta.activeScene !== id) {
    probes.push({
      label: `1440-zh-featured-scene${id}-NOT_CAPTURED`,
      reason: `activeScene=${meta.activeScene} scrollY=${meta.scrollY} after scrollIntoView`,
      gitSha: SHA,
    });
  } else {
    probes.push(await probeFrame(pageScenes, `1440-zh-featured-scene${id}`, { lang: "zh", targetScene: id }));
  }
}
await scrollToSolid(pageScenes);
const solidMeta = await activeSceneMeta(pageScenes);
if (!solidMeta.headerSolid) {
  probes.push({
    label: "1440-zh-closing-solid-NOT_CAPTURED",
    reason: `headerSolid=false endTop=${solidMeta.photoEndTop} scrollY=${solidMeta.scrollY} (pin spacer keeps marker below header band in automation)`,
    gitSha: SHA,
    ...solidMeta,
  });
  probes.push(
    await probeFrame(pageScenes, "1440-zh-closing-band-overlay", {
      lang: "zh",
      targetScene: "closing-band",
      note: "max scroll; header stays overlay",
    })
  );
} else {
  probes.push(await probeFrame(pageScenes, "1440-zh-closing-solid", { lang: "zh", targetScene: "solid" }));
}
await pageScenes.close();
await page375.close();
await browser.close();

const report = { capturedAt: new Date().toISOString(), gitSha: SHA, probes };
fs.writeFileSync(`${OUT}/pr11-pixel-evidence.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ count: probes.length, sha: SHA }, null, 2));
