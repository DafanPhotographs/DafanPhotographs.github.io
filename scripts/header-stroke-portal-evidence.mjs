/**
 * Production header stroke portal evidence: DOM, pixel, screenshots (cloud self-test — not independent QA pass).
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import crypto from "crypto";
import { execSync } from "child_process";
import {
  captureContext,
  scrollToDarkestForestBackdrop,
  scrollToScene,
  scrollToClosingSolid,
} from "./evidence-lib.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

function lum(rgb) {
  return 0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2];
}

function readRgb(png, x, y) {
  const i = (png.width * y + x) << 2;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}

async function domChecks(page) {
  return page.evaluate(() => {
    const light = document.getElementById("header-stroke-portal-light");
    const dark = document.getElementById("header-stroke-portal-dark");
    const root = document.getElementById("header-stroke-portals");
    const header = document.querySelector(".site-header");
    const dupIds = [...document.querySelectorAll("[id]")]
      .map((el) => el.id)
      .filter((id) => id && document.querySelectorAll('[id="' + id + '"]').length > 1);
    const portalPointer =
      light && dark
        ? {
            light: getComputedStyle(light).pointerEvents,
            dark: getComputedStyle(dark).pointerEvents,
            root: root ? getComputedStyle(root).pointerEvents : null,
          }
        : null;
    const ghosts = document.querySelectorAll(".header-stroke-ghost");
    const interactiveGhosts = [...ghosts].filter(
      (g) => g.matches("a,button,input,[tabindex]") || Number(g.getAttribute("tabindex") || -1) >= 0
    );
    return {
      overlay: header?.classList.contains("site-header--overlay"),
      solid: header?.classList.contains("site-header--solid"),
      portalParentTag: light?.parentElement?.tagName,
      portalInsideSiteHeader: !!light?.closest(".site-header"),
      portalRootOnBody: root?.parentElement === document.body,
      headerMix: header ? getComputedStyle(header).mixBlendMode : null,
      portalMix: light ? getComputedStyle(light).mixBlendMode : null,
      rootHidden: root?.hidden ?? null,
      portalGhostCount: ghosts.length,
      duplicateIds: dupIds,
      interactiveGhostCount: interactiveGhosts.length,
      portalPointer,
    };
  });
}

async function pixelStrokeVerify(page) {
  const vp = page.viewportSize();
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };
  const zhBox = await page.locator('.lang-switch__btn[data-set-lang="zh"]').boundingBox();
  if (!zhBox) return null;

  await page.evaluate(() => {
    const chrome = document.querySelector(".header-chrome");
    if (chrome) chrome.dataset.evidenceWasVisibility = getComputedStyle(chrome).visibility;
    document.querySelector(".header-chrome").style.visibility = "hidden";
  });
  const strokeOnly = await page.screenshot({ clip });
  await page.evaluate(() => {
    const chrome = document.querySelector(".header-chrome");
    if (chrome) chrome.style.visibility = chrome.dataset.evidenceWasVisibility || "";
  });

  const png = PNG.sync.read(strokeOnly);
  const y = Math.floor(zhBox.y + zhBox.height * 0.5);
  const scan = (x0, x1, want) => {
    let best = null;
    for (let x = x0; x <= x1; x++) {
      const rgb = readRgb(png, x, y);
      const L = lum(rgb);
      const score = want === "light" ? L : 255 - L;
      if (!best || score > best.score) best = { x, rgb, lum: L, score };
    }
    return best;
  };
  const lx = Math.floor(zhBox.x + zhBox.width * 0.35);
  const dx = Math.floor(zhBox.x + zhBox.width * 0.65);
  const lightStroke = scan(lx - 6, lx + 6, "light");
  const darkStroke = scan(dx - 6, dx + 6, "dark");
  const strokeDualTonePass = Boolean(
    lightStroke &&
      darkStroke &&
      lightStroke.lum - darkStroke.lum >= 30 &&
      lightStroke.lum > darkStroke.lum
  );

  const shot = `${OUT}/header-stroke-portal-stroke-only.png`;
  fs.writeFileSync(shot, strokeOnly);

  return {
    lightStroke,
    darkStroke,
    strokeDualTonePass,
    note: "Normal-composited strokes antialias over hero pixels; pass = light stroke lum > dark stroke lum (not pure #fff).",
    strokeOnlySha256: sha256File(shot),
    strokeOnlyPath: shot,
    solidModeNote:
      "Solid header hides stroke portals (root hidden); avoids double halo on opaque white bar.",
  };
}

async function clickThroughLang(page) {
  const before = await page.locator('.lang-switch__btn[data-set-lang="en"]').getAttribute("aria-checked");
  await page.locator('.lang-switch__btn[data-set-lang="en"]').click();
  await page.waitForTimeout(200);
  const after = await page.locator('.lang-switch__btn[data-set-lang="en"]').getAttribute("aria-checked");
  return { before, after, clicked: after === "true" };
}

async function captureFrame(page, tag, lang) {
  await page.locator(`.lang-switch__btn[data-set-lang="${lang}"]`).click();
  await page.waitForTimeout(350);
  const ctx = await captureContext(page);
  const dom = await domChecks(page);
  const vp = page.viewportSize();
  const headerPath = `${OUT}/header-stroke-${tag}-${lang}-header.png`;
  await page.screenshot({
    path: headerPath,
    clip: { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) },
  });
  let pixel = null;
  if (dom.overlay && tag.includes("overlay")) {
    pixel = await pixelStrokeVerify(page);
  }
  return {
    tag,
    lang,
    context: ctx,
    dom,
    pixel,
    headerSha256: sha256File(headerPath),
    headerPath,
  };
}

const frames = [];

const browser = await chromium.launch();
for (const vp of [
  { width: 1440, height: 900, id: "1440" },
  { width: 375, height: 812, id: "375" },
]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);

  frames.push(await captureFrame(page, `${vp.id}-bright-overlay`, "zh"));
  frames.push(await captureFrame(page, `${vp.id}-bright-overlay`, "en"));

  if (vp.width < 768) await scrollToDarkestForestBackdrop(page, "2");
  else await scrollToScene(page, "2");
  await page.waitForTimeout(500);
  frames.push(await captureFrame(page, `${vp.id}-dark-forest-overlay`, "zh"));
  frames.push(await captureFrame(page, `${vp.id}-dark-forest-overlay`, "en"));

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const mid = await page.evaluate(() => {
    const el = document.querySelector('[data-home-scene="1"]');
    if (el) el.scrollIntoView({ block: "center" });
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
  });
  await page.waitForTimeout(600);
  frames.push(await captureFrame(page, `${vp.id}-mid-scroll-overlay`, "zh"));

  await scrollToClosingSolid(page);
  await page.waitForTimeout(500);
  frames.push(await captureFrame(page, `${vp.id}-closing-solid`, "zh"));
  frames.push(await captureFrame(page, `${vp.id}-closing-solid`, "en"));

  if (vp.id === "1440") {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const click = await clickThroughLang(page);
    const domAfterClick = await domChecks(page);
    frames.push({
      tag: "1440-click-penetration",
      click,
      dom: domAfterClick,
    });
    await page.keyboard.press("Tab");
    await page.waitForTimeout(100);
    const focusTag = await page.evaluate(() => {
      const el = document.activeElement;
      return {
        tag: el?.tagName,
        className: el?.className,
        isStrokeGhost: el?.classList?.contains("header-stroke-ghost"),
      };
    });
    frames.push({ tag: "1440-focus-not-on-ghost", focus: focusTag });
    await page.screenshot({ path: `${OUT}/header-stroke-1440-focus-tab.png`, fullPage: false });
  }

  await page.close();
}

await browser.close();

const overlayFrames = frames.filter((f) => f.dom?.overlay);
const solidFrames = frames.filter((f) => f.dom?.solid);

const report = {
  captureGitSha: HEAD,
  capturedAt: new Date().toISOString(),
  cloudSelfTestOnly: true,
  notIndependentQaPass: true,
  mechanism:
    "Fixed body portals (#header-stroke-portal-*) paint thin dual strokes in normal compositing; fills stay under .site-header--overlay difference.",
  solidMode:
    "site-header--solid clears mix-blend on header; portal root hidden and emptied so no extra halos on white closing bar.",
  acceptance: {
    portalOutsideHeader: overlayFrames.every((f) => f.dom && !f.dom.portalInsideSiteHeader),
    portalRootOnBody: overlayFrames.every((f) => f.dom?.portalRootOnBody === true),
    noDuplicateIds: frames.every((f) => !f.dom || (f.dom.duplicateIds?.length ?? 0) === 0),
    noInteractiveGhosts: frames.every((f) => !f.dom || f.dom.interactiveGhostCount === 0),
    pointerEventsNone: overlayFrames.every(
      (f) =>
        f.dom?.portalPointer?.light === "none" &&
        f.dom?.portalPointer?.dark === "none" &&
        f.dom?.portalPointer?.root === "none"
    ),
    solidHidesPortals: solidFrames.every((f) => f.dom?.rootHidden === true || (f.dom?.portalGhostCount ?? 0) === 0),
    pixelStableOverlay: overlayFrames
      .filter((f) => f.pixel)
      .every((p) => p.pixel?.strokeDualTonePass === true),
  },
  frames,
  unverified: [
    "Independent browser / human QA pass (explicitly blocked for this agent run).",
    "Long-session memory across BFCache edge cases beyond pageshow handler.",
    "Every subpage route — strokes home overlay only.",
  ],
};

const outJson = `${OUT}/header-stroke-portal-evidence.json`;
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

const failed = Object.entries(report.acceptance).filter(([, v]) => !v);
if (failed.length) {
  console.error(JSON.stringify({ failed, report: report.acceptance }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ outJson, captureGitSha: HEAD, acceptance: report.acceptance }, null, 2));
