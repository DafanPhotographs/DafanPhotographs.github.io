import fs from "fs";
import crypto from "crypto";
import { execSync } from "child_process";
import { PNG } from "pngjs";

export const RUNTIME_PREFIXES = [
  "index.html",
  "about.html",
  "contact.html",
  "work.html",
  "about/",
  "contact/",
  "photography/",
  "works/",
  "series/",
  "assets/",
  "data/",
  "styles.css",
  "tokens.css",
  ".nojekyll",
];

export function listRuntimeFiles() {
  const tracked = execSync("git ls-files", { encoding: "utf8" }).trim().split("\n").filter(Boolean);
  return tracked
    .filter((rel) => RUNTIME_PREFIXES.some((p) => rel === p || rel.startsWith(p)))
    .sort();
}

export function sha256File(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

export function runtimeFileHashes(repoRoot = process.cwd()) {
  return listRuntimeFiles().map((rel) => {
    const p = `${repoRoot}/${rel}`;
    const buf = fs.readFileSync(p);
    return { path: rel, bytes: buf.length, sha256: crypto.createHash("sha256").update(buf).digest("hex") };
  });
}

export function captureContext(extra = {}) {
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";
  return {
    captureGitSha: head,
    capturedAt: new Date().toISOString(),
    baseUrl,
    runtimeFiles: runtimeFileHashes(),
    ...extra,
  };
}

/** Solid closing: native scroll jump (GSAP home ignores small scrollTo loops). */
export async function scrollToClosingSolid(page) {
  await page.keyboard.press("End");
  await page.waitForTimeout(650);
  await page.evaluate(() => {
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
  });
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const header = document.querySelector(".site-header");
    const end = document.querySelector("[data-home-photo-zone-end]");
    const hh = header?.getBoundingClientRect().height ?? 0;
    const endTop = end?.getBoundingClientRect().top ?? 9999;
    const lang = document.querySelector(".lang-switch")?.getBoundingClientRect();
    return {
      scrollY: window.scrollY,
      solid: header?.classList.contains("site-header--solid"),
      overlay: header?.classList.contains("site-header--overlay"),
      dataMode: header?.getAttribute("data-header-mode"),
      endTop,
      headerH: hh,
      langRight: lang?.right,
      headerClasses: header?.className,
    };
  });
}

export async function scrollToScene(page, sceneId) {
  await page.evaluate((id) => {
    const el = document.querySelector('[data-home-scene="' + id + '"]');
    if (el) el.scrollIntoView({ block: "start" });
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
  }, sceneId);
  await page.waitForTimeout(650);
}

function meanBgLumInBox(png, box) {
  const x0 = Math.max(0, Math.floor(box.x));
  const y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(png.width, Math.ceil(box.x + box.width));
  const y1 = Math.min(png.height, Math.ceil(box.y + box.height));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (png.width * y + x) << 2;
      const lum = 0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2];
      sum += lum;
      n += 1;
    }
  }
  return n ? sum / n : null;
}

export async function measureWordmarkBackdropLum(page) {
  const vp = page.viewportSize();
  const clip = { x: 0, y: 0, width: vp.width, height: Math.min(160, vp.height) };
  const wmBox = await page.locator(".wordmark").boundingBox();
  if (!wmBox) return null;
  await page.addStyleTag({
    content: "html.probe-hide-header-chrome .header-chrome { visibility: hidden !important; }",
  });
  await page.evaluate(() => document.documentElement.classList.add("probe-hide-header-chrome"));
  const buf = await page.screenshot({ clip });
  await page.evaluate(() => document.documentElement.classList.remove("probe-hide-header-chrome"));
  const png = PNG.sync.read(buf);
  const bgLum = meanBgLumInBox(png, wmBox);
  const scrollY = await page.evaluate(() => window.scrollY);
  return { bgLum, scrollY };
}

/** Wheel through scene 2; keep scrollY with darkest mean luminance under wordmark (375 forest fix). */
export async function scrollToDarkestForestBackdrop(page, sceneId = "2") {
  await scrollToScene(page, sceneId);
  let best = { bgLum: Infinity, scrollY: 0, step: 0 };
  const vp = page.viewportSize();
  const wheel = vp.width < 768 ? 55 : 100;
  for (let step = 0; step < 28; step += 1) {
    const probe = await measureWordmarkBackdropLum(page);
    if (probe?.bgLum != null && probe.bgLum < best.bgLum) best = { ...probe, step };
    await page.mouse.wheel(0, wheel);
    await page.waitForTimeout(85);
    await page.evaluate(() => {
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
    });
  }
  await page.evaluate((y) => window.scrollTo(0, y), best.scrollY);
  await page.waitForTimeout(450);
  await page.evaluate(() => {
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
  });
  return best;
}
