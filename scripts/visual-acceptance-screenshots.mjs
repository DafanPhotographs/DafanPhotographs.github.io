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
      ScrollTrigger.getAll().filter((st) => st.vars && String(st.vars.id || "").startsWith("home-scene-")).length >=
        4
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
    const media = document.querySelector(
      '[data-home-scene="2"] .home-scene-media-scale'
    );
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
      heroCopyPin: document.querySelectorAll("[data-hero-copy-pin]").length,
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

async function shot(page, filename, assertFn) {
  const meta = await sceneFrameMeta(page);
  if (assertFn) assertFn(meta);
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
    await shot(page, "desktop-hero.png", (m) => {
      if (m.activeScene !== "0") throw new Error("hero activeScene " + m.activeScene);
      if (m.closingDominates) throw new Error("closing visible on hero shot");
    })
  );

  // Featured sticky mid — scene 2, mid scale (~0.87), full-bleed photo + overlay header
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

  // Scale from — scene 2 at start of sticky span
  await scrollFeaturedProgress(page, 2, 0.02);
  results.push(
    await shot(page, "desktop-scale-from.png", (m) => {
      if (m.pastPhoto || m.closingDominates) throw new Error("not on photo rail");
      if (m.scaleScene2 == null || m.scaleScene2 < 0.73 || m.scaleScene2 > 0.78) {
        throw new Error("expected scale~0.75, got " + m.scaleScene2);
      }
    })
  );

  // Optional mid-scale evidence (between from and 1)
  await scrollFeaturedProgress(page, 2, 0.28);
  results.push(
    await shot(page, "desktop-scale-mid.png", (m) => {
      if (m.pastPhoto || m.closingDominates) throw new Error("not on photo rail");
      if (m.scaleScene2 == null || m.scaleScene2 < 0.8 || m.scaleScene2 > 0.92) {
        throw new Error("expected mid scale band, got " + m.scaleScene2);
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
  await scrollFeaturedProgress(page, 2, 0.45);
  results.push(
    await shot(page, "mobile-featured-mid.png", (m) => {
      if (m.pastPhoto || m.closingDominates) throw new Error("mobile featured not on rail");
    })
  );

  await scrollToClosing(page);
  results.push(await shot(page, "mobile-closing.png"));

  await browser.close();
  server.kill("SIGTERM");

  const digests = Object.fromEntries(results.map((r) => [r.filename, r.md5]));
  const unique = new Set(Object.values(digests));
  if (unique.size < results.length - 1) {
    console.warn("WARNING: duplicate MD5 among shots", digests);
  }

  console.log(JSON.stringify({ out: OUT, digests, results: results.map((r) => ({ file: r.filename, meta: r.meta })) }, null, 2));
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
