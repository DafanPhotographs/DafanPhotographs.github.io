/**
 * Reference-header evidence: desktop white-source + difference, mobile light bar, no stroke portals.
 */
import { chromium } from "playwright";
import { PNG } from "pngjs";
import fs from "fs";
import crypto from "crypto";
import { execSync } from "child_process";
import { captureContext, scrollToScene, scrollToClosingSolid, scrollToDarkestForestBackdrop } from "./evidence-lib.mjs";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.ARTIFACT_DIR || "/opt/cursor/artifacts";
const HEAD = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

async function headerState(page) {
  return page.evaluate(() => {
    const header = document.querySelector(".site-header");
    const cs = header ? getComputedStyle(header) : null;
    const wm = document.querySelector(".wordmark");
    const wcs = wm ? getComputedStyle(wm) : null;
    return {
      classes: header?.className,
      dataMode: header?.getAttribute("data-header-mode"),
      headerMix: cs?.mixBlendMode,
      headerBg: cs?.backgroundColor,
      wordmarkColor: wcs?.color,
      vw: document.documentElement.clientWidth,
      portalRoot: !!document.getElementById("header-stroke-portals"),
      strokeGhosts: document.querySelectorAll(".header-stroke-ghost, .ab-stroke-portal").length,
    };
  });
}

async function differencePixelProbe(page) {
  const vp = page.viewportSize();
  if (vp.width < 768) return null;
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) };
  const box = await page.locator(".header-chrome .nav-link-label").first().boundingBox();
  if (!box) return null;
  await page.evaluate(() => {
    document.querySelector(".header-chrome").style.visibility = "hidden";
  });
  const bgBuf = await page.screenshot({ clip });
  await page.evaluate(() => {
    document.querySelector(".header-chrome").style.visibility = "";
  });
  const fgBuf = await page.screenshot({ clip });
  const bg = PNG.sync.read(bgBuf);
  const fg = PNG.sync.read(fgBuf);
  const x = Math.floor(box.x + box.width * 0.5);
  const y = Math.floor(box.y + box.height * 0.5);
  const i = (bg.width * y + x) << 2;
  const bgRgb = [bg.data[i], bg.data[i + 1], bg.data[i + 2]];
  const compRgb = [fg.data[i], fg.data[i + 1], fg.data[i + 2]];
  const expected = bgRgb.map((b) => Math.abs(255 - b));
  const invertErr =
    Math.abs(compRgb[0] - expected[0]) + Math.abs(compRgb[1] - expected[1]) + Math.abs(compRgb[2] - expected[2]);
  const path = `${OUT}/difference-ref-pixel-probe-nav.png`;
  fs.writeFileSync(path, fgBuf);
  return {
    x,
    y,
    bgRgb,
    compRgb,
    expectedDifferenceRgb: expected,
    invertErr,
    probePath: path,
    sha256: sha256File(path),
  };
}

async function shotFrame(page, tag, lang, setup) {
  if (setup) await setup(page);
  await page.locator(`.lang-switch__btn[data-set-lang="${lang}"]`).click();
  await page.waitForTimeout(300);
  const state = await headerState(page);
  const vp = page.viewportSize();
  const headerPath = `${OUT}/difference-ref-${tag}-${lang}-header.png`;
  await page.screenshot({
    path: headerPath,
    clip: { x: 0, y: 0, width: vp.width, height: Math.min(140, vp.height) },
  });
  const pixel = await differencePixelProbe(page);
  return {
    tag,
    lang,
    state,
    pixel,
    headerPath,
    headerSha256: sha256File(headerPath),
  };
}

const frames = [];
const browser = await chromium.launch();

for (const [vp, id] of [
  [{ width: 1440, height: 900 }, "1440"],
  [{ width: 375, height: 812 }, "375"],
]) {
  const page = await browser.newPage({ viewport: vp });
  await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  frames.push(
    await shotFrame(page, `${id}-bright`, "zh", async (p) => {
      await p.evaluate(() => window.scrollTo(0, 0));
    })
  );
  frames.push(
    await shotFrame(page, `${id}-bright`, "en", async (p) => {
      await p.evaluate(() => window.scrollTo(0, 0));
    })
  );
  if (vp.width >= 768) await scrollToScene(page, "2");
  else await scrollToDarkestForestBackdrop(page, "2");
  await page.waitForTimeout(400);
  frames.push(await shotFrame(page, `${id}-dark`, "en", async () => {}));
  await scrollToClosingSolid(page);
  await page.waitForTimeout(400);
  frames.push(await shotFrame(page, `${id}-closing`, "zh", async () => {}));
  frames.push(await shotFrame(page, `${id}-closing`, "en", async () => {}));
  await page.close();
}

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
await scrollToScene(page, "1");
frames.push(await shotFrame(page, "1440-mid", "zh", async () => {}));
frames.push(await shotFrame(page, "1440-mid", "en", async () => {}));
await page.setViewportSize({ width: 767, height: 800 });
await page.waitForTimeout(400);
frames.push(await shotFrame(page, "767-breakpoint", "zh", async () => {}));
await page.setViewportSize({ width: 768, height: 800 });
await page.waitForTimeout(400);
frames.push(await shotFrame(page, "768-breakpoint", "zh", async () => {}));
await browser.close();

const desktopOverlay = frames.filter((f) => f.tag.startsWith("1440") && f.state?.headerMix === "difference");
const mobileOverlay = frames.filter((f) => f.tag.startsWith("375-bright"));

const report = {
  captureGitSha: HEAD,
  capturedAt: new Date().toISOString(),
  approach: "reference-site: desktop overlay white-source + header mix-blend-mode:difference; mobile overlay opaque bar; solid closing normal",
  cloudSelfTestOnly: true,
  notIndependentQaPass: true,
  acceptance: {
    noPortalRuntime: frames.every((f) => !f.state?.portalRoot && f.state?.strokeGhosts === 0),
    desktopOverlayDifference: desktopOverlay.length > 0 && desktopOverlay.every((f) => f.state.headerMix === "difference"),
    mobileOverlayNormal:
      mobileOverlay.every((f) => f.state.headerMix === "normal" && !f.state.portalRoot),
    closingSolidNormal: frames
      .filter((f) => f.tag.includes("closing"))
      .every((f) => f.state.dataMode === "solid" && f.state.headerMix === "normal"),
    desktopPixelDifference: desktopOverlay
      .filter((f) => f.pixel)
      .every((p) => p.pixel.invertErr <= 40),
  },
  g24Note: "Inline SVG path unchanged; hash checked in g24-wordmark-evidence.json",
  subpagesScope: "Non-home headers unchanged (sticky, no photo difference); this evidence is page-home only",
  frames,
  unverified: [
    "Independent browser QA (loopback blocked for agent)",
    "Mid-grey contrast on complex foliage — accepted limitation per product direction",
  ],
};

const outJson = `${OUT}/difference-ref-evidence.json`;
fs.writeFileSync(outJson, JSON.stringify(report, null, 2));

const failed = Object.entries(report.acceptance).filter(([, v]) => !v);
if (failed.length) {
  console.error(JSON.stringify({ failed, acceptance: report.acceptance }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ outJson, captureGitSha: HEAD, acceptance: report.acceptance }, null, 2));
