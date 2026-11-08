import { chromium } from "@playwright/test";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const OUT = "/opt/cursor/artifacts/visual-acceptance";
mkdirSync(OUT, { recursive: true });

const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:8765";

function md5(path) {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

async function serve() {
  const { spawn } = await import("node:child_process");
  return new Promise((resolve) => {
    const child = spawn("python3", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], {
      cwd: new URL("..", import.meta.url).pathname,
      stdio: "ignore",
    });
    setTimeout(() => resolve(child), 700);
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function waitMotionReady(page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(
    () =>
      typeof ScrollTrigger !== "undefined" &&
      document.documentElement.classList.contains("home-stages--motion") &&
      ScrollTrigger.getAll().filter((st) => st.vars && String(st.vars.id || "").startsWith("home-scene-")).length ===
        3
  );
  await page.evaluate(() => {
    ScrollTrigger.refresh();
    ScrollTrigger.update();
  });
  await page.waitForTimeout(350);
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {number} sceneIndex
 * @param {number} progress01 0..1 along featured scene sticky span
 */
async function scrollFeaturedProgress(page, sceneIndex, progress01) {
  await page.evaluate(
    ({ idx, progress }) => {
      const id = "home-scene-" + idx;
      const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === id);
      if (!st) throw new Error("missing ST " + id);
      const y = st.start + (st.end - st.start) * Math.min(1, Math.max(0, progress));
      window.scrollTo(0, y);
      ScrollTrigger.update();
    },
    { idx: sceneIndex, progress: progress01 }
  );
  await page.waitForTimeout(450);
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function transitionMeta(page) {
  return page.evaluate(() => {
    const active = document.querySelector("[data-home-stage-rail]")?.getAttribute("data-active-scene");
    const vh = window.innerHeight;
    const next = (idx) => {
      const el = document.querySelector('[data-home-scene="' + idx + '"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, band: Math.max(0, vh - r.top), isFeatured: el.classList.contains("featured-panel") };
    };
    const scaleOf = (idx) => {
      const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
      return media && typeof gsap !== "undefined" ? Number(gsap.getProperty(media, "scale")) : null;
    };
    const title = document.querySelector(".home-scene.is-stage-active .home-scene-title");
    return {
      activeScene: active,
      scrollY: window.scrollY,
      title: title?.textContent?.trim() || "",
      scale0: scaleOf(0),
      scale1: scaleOf(1),
      scale2: scaleOf(2),
      next1: next(1),
      next2: next(2),
      heroSlides: document.querySelectorAll("[data-hero-slide]").length,
    };
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function sceneFrameMeta(page) {
  return page.evaluate(() => {
    const active = document.querySelector("[data-home-stage-rail]")?.getAttribute("data-active-scene");
    const closing = document.querySelector(".home-closing");
    const closingTop = closing?.getBoundingClientRect().top ?? 99999;
    const photoEnd = document.querySelector("[data-home-photo-zone-end]");
    const header = document.querySelector(".site-header");
    const headerH = header?.getBoundingClientRect().height ?? 0;
    const endTop = photoEnd?.getBoundingClientRect().top ?? 0;
    const pastPhoto = endTop <= headerH + 0.5;
    const media = document.querySelector('[data-home-scene="2"] .home-scene-media-scale');
    const scale =
      media && typeof gsap !== "undefined" ? Number(gsap.getProperty(media, "scale")) : null;
    const title = document.querySelector(".home-scene.is-stage-active .home-scene-title");
    const titleText = title?.textContent?.trim() || "";
    const titleVis = title ? getComputedStyle(title).visibility === "visible" : false;
    const blend = document.querySelector(".site-header--overlay .header-chrome-blend");
    return {
      activeScene: active,
      scrollY: window.scrollY,
      pastPhoto,
      closingTop,
      closingDominates: closingTop < window.innerHeight * 0.55,
      scaleScene2: scale,
      titleText,
      titleVisible: titleVis,
      headerOverlay: header?.classList.contains("site-header--overlay") ?? false,
      headerDifference:
        blend && getComputedStyle(blend).mixBlendMode === "difference",
      heroSlides: document.querySelectorAll("[data-hero-slide]").length,
      taglineInRail: document.querySelectorAll(".hero-tagline, .hero-copy-pin").length,
    };
  });
}

/**
 * @param {import("@playwright/test").Page} page
 */
async function scrollToClosing(page) {
  for (let attempt = 0; attempt < 14; attempt += 1) {
    const done = await page.evaluate((nudge) => {
      const end = document.querySelector("[data-home-photo-zone-end]");
      const header = document.querySelector(".site-header");
      const closing = document.querySelector(".home-closing");
      if (!end || !header || !closing) return false;
      const headerH = header.getBoundingClientRect().height;
      const endTop = end.getBoundingClientRect().top;
      if (endTop <= headerH + 0.5) {
        if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
        return true;
      }
      const target = end.getBoundingClientRect().top + window.scrollY - headerH + nudge;
      window.scrollTo(0, Math.max(0, target));
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
      return false;
    }, Math.min(140, attempt * 52));
    if (done) break;
    await page.waitForTimeout(180);
  }
  await page.waitForTimeout(500);
}

async function shot(page, filename, assertFn, extraMeta) {
  const meta = { ...(await sceneFrameMeta(page)), ...(extraMeta || {}) };
  if (assertFn) await assertFn(meta);
  const path = join(OUT, filename);
  await page.screenshot({ path, fullPage: false });
  return { filename, path, md5: md5(path), meta };
}

async function run() {
  const server = await serve();
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const results = [];

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/`);
  await waitMotionReady(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(400);
  results.push(
    await shot(page, "desktop-scene0-rest.png", (m) => {
      if (m.activeScene !== "0") throw new Error("scene0 activeScene " + m.activeScene);
      if (m.closingDominates) throw new Error("closing visible on scene0");
      if (m.heroSlides > 0) throw new Error("hero slides remain");
    })
  );

  for (const [progress, file] of [
    [0.2, "desktop-t01-early.png"],
    [0.5, "desktop-t01-mid.png"],
    [0.8, "desktop-t01-late.png"],
  ]) {
    await scrollFeaturedProgress(page, 0, progress);
    const tm = await transitionMeta(page);
    results.push(
      await shot(page, file, (m) => {
        if (m.pastPhoto || m.closingDominates) throw new Error("not on photo rail");
        if (m.heroSlides > 0) throw new Error("hero slides remain");
      }, tm)
    );
  }

  await scrollFeaturedProgress(page, 1, 0.5);
  results.push(
    await shot(page, "desktop-t12-mid.png", async (m) => {
      const tm = await transitionMeta(page);
      if (tm.scale1 == null || tm.scale1 <= 0.76 || tm.scale1 >= 0.98) {
        throw new Error("expected mid scale on scene1, got " + tm.scale1);
      }
      if (!tm.next2 || tm.next2.band < 200) throw new Error("scene2 peek missing");
      Object.assign(m, tm);
    })
  );

  await scrollFeaturedProgress(page, 0, 0.5);
  await page.screenshot({ path: join(OUT, "desktop-t01-mid-crop.png"), fullPage: false });
  await scrollFeaturedProgress(page, 1, 0.5);
  await page.screenshot({ path: join(OUT, "desktop-t12-mid-crop.png"), fullPage: false });
  const { PNG } = await import("pngjs");
  const fs = await import("node:fs");
  const left = PNG.sync.read(fs.readFileSync(join(OUT, "desktop-t01-mid-crop.png")));
  const right = PNG.sync.read(fs.readFileSync(join(OUT, "desktop-t12-mid-crop.png")));
  const wide = new PNG({ width: left.width + right.width, height: Math.max(left.height, right.height) });
  for (let y = 0; y < left.height; y++) {
    for (let x = 0; x < left.width; x++) {
      const i = (wide.width * y + x) << 2;
      const j = (left.width * y + x) << 2;
      wide.data[i] = left.data[j];
      wide.data[i + 1] = left.data[j + 1];
      wide.data[i + 2] = left.data[j + 2];
      wide.data[i + 3] = left.data[j + 3];
    }
  }
  for (let y = 0; y < right.height; y++) {
    for (let x = 0; x < right.width; x++) {
      const i = (wide.width * y + (x + left.width)) << 2;
      const j = (right.width * y + x) << 2;
      wide.data[i] = right.data[j];
      wide.data[i + 1] = right.data[j + 1];
      wide.data[i + 2] = right.data[j + 2];
      wide.data[i + 3] = right.data[j + 3];
    }
  }
  fs.writeFileSync(join(OUT, "compare-t01-vs-t12-mid.png"), PNG.sync.write(wide));
  results.push({ filename: "compare-t01-vs-t12-mid.png", path: join(OUT, "compare-t01-vs-t12-mid.png"), meta: {} });

  await scrollFeaturedProgress(page, 2, 0.48);
  results.push(
    await shot(page, "desktop-featured-mid.png", (m) => {
      if (m.pastPhoto) throw new Error("past photo on featured-mid");
      if (m.closingDominates) throw new Error("closing on featured-mid");
      if (!m.headerOverlay || !m.headerDifference) throw new Error("header not overlay/difference");
      if (!m.titleText) throw new Error("no active series title");
      if (m.taglineInRail > 0) throw new Error("tagline cluster in rail");
      if (m.scaleScene2 == null || m.scaleScene2 <= 0.76 || m.scaleScene2 >= 0.98) {
        throw new Error("expected mid scale, got " + m.scaleScene2);
      }
    })
  );

  await scrollToClosing(page);
  results.push(
    await shot(page, "desktop-closing.png", (m) => {
      if (!m.pastPhoto) throw new Error("header should be solid past photo");
      if (m.closingTop > 880) throw new Error("closing not in view, top=" + m.closingTop);
    })
  );

  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(`${base}/`);
  await waitMotionReady(page);
  await scrollFeaturedProgress(page, 0, 0.5);
  results.push(
    await shot(page, "mobile-t01-mid.png", (m) => {
      if (m.pastPhoto || m.closingDominates) throw new Error("mobile t01 not on rail");
    })
  );
  await scrollFeaturedProgress(page, 1, 0.45);
  results.push(
    await shot(page, "mobile-t12-mid.png", (m) => {
      if (m.pastPhoto || m.closingDominates) throw new Error("mobile t12 not on rail");
    })
  );

  await scrollToClosing(page);
  results.push(await shot(page, "mobile-closing.png"));

  await browser.close();
  server.kill("SIGTERM");

  const metrics = results
    .filter((r) => r.meta && r.meta.activeScene != null)
    .map((r) => ({ file: r.filename, meta: r.meta }));

  const metricsPath = join(OUT, "metrics.json");
  fs.writeFileSync(metricsPath, JSON.stringify(metrics, null, 2));

  const digests = Object.fromEntries(results.filter((r) => r.md5).map((r) => [r.filename, r.md5]));
  console.log(JSON.stringify({ out: OUT, digests, metricsPath, results: results.map((r) => ({ file: r.filename, meta: r.meta })) }, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
