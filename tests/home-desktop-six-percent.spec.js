// @ts-check
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const {
  waitForHeroDelivery,
  waitForScrubStable,
  scrollTriggerProgress,
  readLayoutMediaRatio,
  isHeroLimitUrl,
  isHeroFillUrl,
  wheelRoundTripEntryMidBack,
  screenshotStageAtSample,
  attachCloudinaryResponseLog,
  readSceneVisibilityMeta,
  SCENE_PUBLIC,
  SCROLL_Y_PAIR_TOL_PX,
} = require("./helpers/home-scroll-stable.cjs");
const { writeArtifact, ensureDir } = require("./helpers/acceptance-artifacts.cjs");

test.describe("desktop-six-percent guards", () => {
  test("768: scene0 fill delivery", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, false);
  });

  test("375: window lives on the stage (media stays 100%)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const info = await page.evaluate(() => {
      const stage = document.querySelector('[data-home-scene="1"] .home-scene-stage');
      const media = document.querySelector('[data-home-scene="1"] .home-scene-media-scale');
      return {
        stageScale: Number(gsap.getProperty(stage, "scale")),
        mediaW: media.offsetWidth,
        stageW: stage.offsetWidth,
      };
    });
    expect(info.stageScale).toBeGreaterThanOrEqual(0.74);
    expect(info.stageScale).toBeLessThanOrEqual(0.76);
    expect(Math.abs(info.mediaW - info.stageW)).toBeLessThanOrEqual(1);
  });

  test("375: scene0 still fill not limit", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, false);
    const src = await page.locator('[data-home-scene="0"] img').evaluate((img) => img.currentSrc);
    expect(src).not.toContain("c_limit");
  });

  test("mobile zero-limit request journal", async ({ page }) => {
    const journal = { initial: [], afterScroll: [] };
    const isLimit = (u) => u.includes("c_limit") && u.includes("dafan/series");
    page.on("request", (req) => {
      const u = req.url();
      if (isLimit(u)) journal.afterScroll.push({ t: Date.now(), url: u });
    });
    for (const vp of [
      { w: 375, h: 812, label: "375" },
      { w: 768, h: 1024, label: "768" },
    ]) {
      journal[vp.label] = { limitRequests: [], scenes: [] };
      journal.afterScroll.length = 0;
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      for (let i = 0; i < 3; i += 1) {
        await scrollTriggerProgress(page, i, 0.2);
        const src = await page.locator('[data-home-scene="' + i + '"] img').evaluate((img) => img.currentSrc);
        journal[vp.label].scenes.push({ sceneIndex: i, currentSrc: src });
      }
      journal[vp.label].limitRequests = [...journal.afterScroll];
      expect(journal[vp.label].limitRequests.length).toBe(0);
      for (const row of journal[vp.label].scenes) {
        expect(row.currentSrc).toContain("c_fill");
        expect(row.currentSrc).not.toContain("c_limit");
      }
    }
    writeArtifact("journals/mobile-zero-limit.json", journal);
  });
});

test.describe("desktop-six-percent post-impl", () => {
  test.beforeAll(() => {
    ensureDir("journals");
  });
  test("desktop layout: media-scale layout box ~100% of stage", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const layout = await readLayoutMediaRatio(page, 0);
    expect(layout.offsetRatio).toBeGreaterThan(0.98);
    expect(layout.offsetRatio).toBeLessThan(1.02);
  });

  test("desktop: window tween is on the stage, 0.75 → 1", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const from = await page.evaluate(() =>
      Number(gsap.getProperty(document.querySelector('[data-home-scene="1"] .home-scene-stage'), "scale"))
    );
    expect(from).toBeGreaterThanOrEqual(0.74);
    expect(from).toBeLessThanOrEqual(0.76);
  });

  test("desktop rest gsap scale ~1.0", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await scrollTriggerProgress(page, 0, 0);
    const scale = await waitForScrubStable(page, () =>
      page.evaluate(() =>
        Number(gsap.getProperty(document.querySelector('[data-home-scene="0"] .home-scene-media-scale'), "scale"))
      )
    );
    expect(scale).toBeGreaterThanOrEqual(0.99);
    expect(scale).toBeLessThanOrEqual(1.01);
  });

  test("desktop scene1 pins at scale 1 and stays settled", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const read = () =>
      page.evaluate(() =>
        Number(gsap.getProperty(document.querySelector('[data-home-scene="1"] .home-scene-stage'), "scale"))
      );
    await scrollTriggerProgress(page, 1, 1);
    await page.waitForTimeout(250);
    expect(await read()).toBeGreaterThanOrEqual(0.999);
    await page.evaluate(() => {
      window.scrollTo(0, window.scrollY + 250);
      ScrollTrigger.update();
    });
    await page.waitForTimeout(250);
    expect(await read()).toBeGreaterThanOrEqual(0.999);
  });

  for (let sceneIndex = 0; sceneIndex < 3; sceneIndex += 1) {
    test("seek-mid-window-scene" + sceneIndex, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await scrollTriggerProgress(page, sceneIndex, 0.5);
      await page.waitForTimeout(250);
      const scale = await page.evaluate(
        (idx) =>
          Number(
            gsap.getProperty(
              document.querySelector('[data-home-scene="' + idx + '"] .home-scene-stage'),
              "scale"
            )
          ),
        sceneIndex
      );
      const expected = sceneIndex === 0 ? 1 : 0.875;
      expect(Math.abs(scale - expected)).toBeLessThanOrEqual(0.02);
    });
  }

  test("desktop: all scenes use c_limit identity", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    for (let sceneIndex = 0; sceneIndex < 3; sceneIndex += 1) {
      await waitForHeroDelivery(page, sceneIndex, true);
      const publicId = SCENE_PUBLIC[sceneIndex];
      const meta = await readSceneVisibilityMeta(page, sceneIndex);
      expect(meta.currentSrcPublicId).toBe(publicId);
    }
  });

  test("fallback: abort limit then one fill", async ({ page }) => {
    await page.route((url) => isHeroLimitUrl(url, "bipenggou"), (route) => route.abort());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, false);
    const info = await page.evaluate(() => {
      const img = document.querySelector('[data-home-scene="0"] img');
      const picture = img.closest("picture");
      return {
        state: img.dataset.heroPictureState,
        sources: picture ? picture.querySelectorAll("source").length : -1,
        currentSrc: img.currentSrc,
        cycle: img.dataset.heroFallbackCycle,
      };
    });
    expect(info.sources).toBe(0);
    expect(info.state).toBe("fill");
    expect(info.currentSrc).toContain("c_fill");
    expect(info.cycle).toBe("1");
    writeArtifact("journals/fallback-limit-to-fill.json", info);
  });

  test("fallback: fill abort => failed", async ({ page }) => {
    await page.route(
      (url) => isHeroLimitUrl(url, "bipenggou") || isHeroFillUrl(url, "bipenggou"),
      (route) => route.abort()
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    const end = await page.evaluate(() => {
      const img = document.querySelector('[data-home-scene="0"] img');
      return {
        state: img.dataset.heroPictureState,
        cycle: img.dataset.heroFallbackCycle,
      };
    });
    expect(end.state).toBe("failed");
    expect(end.cycle).toBe("1");
    writeArtifact("journals/fallback-double-abort-failed.json", end);
  });

  test("fallback: same-cycle error after fill does not retry", async ({ page }) => {
    await page.route((url) => isHeroLimitUrl(url, "bipenggou"), (route) => route.abort());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, false);
    const before = await page.evaluate(() => {
      const img = document.querySelector('[data-home-scene="0"] img');
      return { state: img.dataset.heroPictureState, cycle: img.dataset.heroFallbackCycle, src: img.src };
    });
    expect(before.state).toBe("fill");
    await page.evaluate(() => {
      const img = document.querySelector('[data-home-scene="0"] img');
      img.src = "https://invalid.example/broken.jpg";
    });
    await page.evaluate(() => {
      const img = document.querySelector('[data-home-scene="0"] img');
      img.dispatchEvent(new Event("error"));
    });
    const after = await page.evaluate(() => {
      const img = document.querySelector('[data-home-scene="0"] img');
      return { state: img.dataset.heroPictureState, cycle: img.dataset.heroFallbackCycle };
    });
    expect(after.state).toBe("failed");
    expect(after.cycle).toBe(before.cycle);
    writeArtifact("journals/fallback-same-cycle-no-retry.json", { before, after });
  });

  test("fallback: resize after fill increments cycle and restores source", async ({ page }) => {
    await page.route((url) => isHeroLimitUrl(url, "bipenggou"), (route) => route.abort());
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, false);
    const c1 = await page.locator('[data-home-scene="0"] img').getAttribute("data-hero-fallback-cycle");
    expect(c1).toBe("1");
    await page.setViewportSize({ width: 1023, height: 768 });
    await waitForHeroDelivery(page, 0, false);
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.waitForFunction(() => {
      const img = document.querySelector('[data-home-scene="0"] img');
      const pic = img.closest("picture");
      return (
        img.dataset.heroPictureState === "" &&
        pic &&
        pic.querySelectorAll("source").length === 1 &&
        Number(img.dataset.heroFallbackCycle) >= 2
      );
    });
    const c2 = await page.locator('[data-home-scene="0"] img').getAttribute("data-hero-fallback-cycle");
    expect(Number(c2)).toBeGreaterThan(Number(c1));
    writeArtifact("journals/fallback-resize-new-cycle.json", { c1, c2 });
  });

  test("resize 1024-1023-1024 without reload", async ({ page }) => {
    const journal = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("bipenggou") && (u.includes("c_limit") || u.includes("c_fill"))) {
        journal.push({ phase: "pending", url: u, method: req.method() });
      }
    });
    const tag = (p) => journal.filter((j) => j.phase === p).length;

    async function snapPhase() {
      return page.evaluate(() => {
        const img = document.querySelector('[data-home-scene="0"] img');
        const media = document.querySelector('[data-home-scene="0"] .home-scene-media-scale');
        const stage = document.querySelector('[data-home-scene="0"] .home-scene-stage');
        return {
          currentSrc: img.currentSrc,
          viewport: { w: window.innerWidth, h: window.innerHeight },
          layoutRatio: media.offsetWidth / stage.offsetWidth,
          scale: media ? Number(gsap.getProperty(media, "scale")) : null,
        };
      });
    }
    const phases = {};

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, true);
    journal.forEach((j) => {
      if (j.phase === "pending") j.phase = "after_first_1024";
    });
    phases.after_first_1024 = await snapPhase();

    await page.setViewportSize({ width: 1023, height: 768 });
    await waitForHeroDelivery(page, 0, false);
    journal.forEach((j) => {
      if (j.phase === "pending") j.phase = "after_1023";
    });
    phases.after_1023 = await snapPhase();

    await page.setViewportSize({ width: 1024, height: 768 });
    await waitForHeroDelivery(page, 0, true);
    journal.forEach((j) => {
      if (j.phase === "pending") j.phase = "after_second_1024";
    });
    phases.after_second_1024 = await snapPhase();

    const payload = {
      total: journal.length,
      byPhase: {
        after_first_1024: tag("after_first_1024"),
        after_1023: tag("after_1023"),
        after_second_1024: tag("after_second_1024"),
      },
      urls: journal,
      delivery: phases,
    };
    writeArtifact("journals/resize-1024-1023-1024.json", payload);
    expect(journal.length).toBeGreaterThanOrEqual(1);
    expect(phases.after_1023.currentSrc).toContain("c_fill");
    expect(phases.after_second_1024.currentSrc).toContain("c_limit");
    await test.info().attach("resize-journal", {
      body: JSON.stringify(payload, null, 2),
      contentType: "application/json",
    });
  });

  test("lazy load attrs and focus on active scene link", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const lazy = await page.evaluate(() => {
      const img2 = document.querySelector('[data-home-scene="2"] img');
      return { loading: img2.loading, fetchpriority: img2.getAttribute("fetchpriority") };
    });
    expect(lazy.loading).toBe("lazy");
    await page.keyboard.press("Tab");
    const focusHref = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute("href"));
    writeArtifact("journals/lazy-focus.json", { lazy, firstTabHref: focusHref });
    expect(focusHref).toBeTruthy();
  });

  test("qingdao loads after scene2 reveal (phased log)", async ({ page }) => {
    const phases = { dom: [], idle: [], afterScroll: [] };
    page.on("request", (req) => {
      if (!req.url().includes("qingdao")) return;
      phases.afterScroll.push({ url: req.url(), t: Date.now() });
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-home-scene="2"] img');
    const attrs = await page.evaluate(() => {
      const img = document.querySelector('[data-home-scene="2"] img');
      return { loading: img.loading, fetchpriority: img.getAttribute("fetchpriority") };
    });
    phases.dom = [...phases.afterScroll];
    phases.afterScroll.length = 0;
    await page.waitForLoadState("networkidle");
    phases.idle = [...phases.afterScroll];
    phases.afterScroll.length = 0;

    await scrollTriggerProgress(page, 2, 0.05);
    await waitForHeroDelivery(page, 2, true);
    const after = [...phases.afterScroll];
    const decoded = await page.evaluate(() => {
      const img = document.querySelector('[data-home-scene="2"] img');
      return {
        naturalWidth: img.naturalWidth,
        currentSrc: img.currentSrc,
      };
    });

    await test.info().attach("lazy-baseline", {
      body: JSON.stringify(
        { attrs, phases: { dom: phases.dom, idle: phases.idle, afterScroll: after }, decoded },
        null,
        2
      ),
      contentType: "application/json",
    });
    expect(decoded.naturalWidth).toBeGreaterThan(0);
    expect(decoded.currentSrc).toContain("qingdao");
    expect(attrs.loading).toBe("lazy");
  });

  test("desktop: scene0 progress 1 covers stage (no gap)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await scrollTriggerProgress(page, 0, 1);
    await waitForScrubStable(page, () =>
      page.evaluate(() =>
        Number(gsap.getProperty(document.querySelector('[data-home-scene="0"] .home-scene-media-scale'), "scale"))
      )
    );
    const ok = await page.evaluate(() => {
      const stage = document.querySelector('[data-home-scene="0"] .home-scene-stage').getBoundingClientRect();
      const media = document.querySelector('[data-home-scene="0"] .home-scene-media-scale').getBoundingClientRect();
      const eps = 2;
      return (
        media.left <= stage.left + eps &&
        media.right >= stage.right - eps &&
        media.top <= stage.top + eps &&
        media.bottom >= stage.bottom - eps
      );
    });
    expect(ok).toBe(true);
  });

  test("cloudinary hero bytes known or volume Incomplete", async ({ page }, testInfo) => {
    const log = [];
    attachCloudinaryResponseLog(page, log);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, true);
    const heroLog = log.filter((r) => /dafan\/series\/(bipenggou|emeishan|qingdao)\/cover/.test(r.url));
    expect(heroLog.length).toBeGreaterThanOrEqual(1);
    let volumeIncomplete = false;
    for (const row of heroLog) {
      expect(row.contentType).not.toBe("unknown");
      if (row.bytesStatus === "unknown" || row.volumeGate === "Incomplete") {
        volumeIncomplete = true;
      }
    }
    await testInfo.attach("cloudinary-byte-log", {
      body: JSON.stringify({ heroLog, volumeIncomplete }, null, 2),
      contentType: "application/json",
    });
    expect(volumeIncomplete, "volume bytes unknown → Incomplete").toBe(false);
  });
});

const { wheelFullStackTraversal, captureTrackBSeekCheckpoints } = require("./helpers/stack-evidence-b.cjs");
const { readTargetStackMeta } = require("./helpers/stack-visibility-metrics.cjs");

test.describe("stack visibility metrics v2", () => {
  test("bbox ratio alone does not imply window eligible when pixel dominant differs", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.evaluate(() => ScrollTrigger.refresh());
    await scrollTriggerProgress(page, 0, 0.85);
    await waitForScrubStable(
      page,
      () =>
        page.evaluate(() => {
          const m = document.querySelector('[data-home-scene="0"] .home-scene-media-scale');
          return m ? Number(gsap.getProperty(m, "scale")) : 0;
        }),
      { maxMs: 4000, stableFrames: 2, interval: 40 }
    );
    const meta = await readTargetStackMeta(page, 0);
    expect(meta.metricsVersion).toBe("stack-visibility-v2-pixel-grid");
    if (meta.pixelDominantSceneIndex !== 0) {
      expect(meta.targetPixelVisibleRatio).toBeLessThan(0.35);
      expect(meta.windowCompositionEligible).toBe(false);
      expect(meta.compositionProofReason).toMatch(/pixel_dominant/);
    }
    await test.info().attach("scene0-late-stack-meta", {
      body: JSON.stringify(meta, null, 2),
      contentType: "application/json",
    });
  });

  test("scene0 progress 0.35: viewport center still target publicId", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await scrollTriggerProgress(page, 0, 0.35);
    const meta = await readTargetStackMeta(page, 0);
    expect(meta.viewportCenterPublicId).toBe("bipenggou");
    expect(meta.targetPixelVisibleRatio).toBeGreaterThan(0.35);
    expect(meta.targetPublicId).toBe("bipenggou");
  });

  test("scene0 ST p0.5 scrollTo: center may already be next scene (not wheel mid)", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await scrollTriggerProgress(page, 0, 0.5);
    const meta = await readTargetStackMeta(page, 0);
    expect(meta.targetPublicId).toBe("bipenggou");
    expect(meta.currentSrc).toContain("bipenggou");
  });
});

test.describe("Lenis wheel traversal (replaces pre-Lenis pair evidence)", () => {
  test.setTimeout(120000);

  test("wheel is smoothed; scenes pin at scale 1 and stay settled", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    expect(await page.evaluate(() => !!window.__lenis)).toBe(true);

    // One wheel is not applied in a single frame (Lenis smoothing).
    await page.mouse.move(720, 450);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(120);
    const mid = await page.evaluate(() => Math.round(window.scrollY));
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(560);
    await page.waitForTimeout(1600);
    const end = await page.evaluate(() => Math.round(window.scrollY));
    expect(end).toBeGreaterThan(560);

    const stageScale = (idx) =>
      page.evaluate(
        (i) =>
          Number(
            gsap.getProperty(
              document.querySelector('[data-home-scene="' + i + '"] .home-scene-stage'),
              "scale"
            )
          ),
        idx
      );

    // scene 1 pinned: window fully open
    await page.evaluate(() => {
      if (window.__lenis) window.__lenis.scrollTo(900, { immediate: true, force: true });
      ScrollTrigger.update();
    });
    await page.waitForTimeout(300);
    expect(await stageScale(1)).toBeGreaterThanOrEqual(0.999);

    // no endless zoom while pinned
    await page.evaluate(() => {
      if (window.__lenis) window.__lenis.scrollTo(1200, { immediate: true, force: true });
      ScrollTrigger.update();
    });
    await page.waitForTimeout(300);
    expect(await stageScale(1)).toBeGreaterThanOrEqual(0.999);

    // scene 2 pinned: window fully open
    await page.evaluate(() => {
      if (window.__lenis) window.__lenis.scrollTo(1800, { immediate: true, force: true });
      ScrollTrigger.update();
    });
    await page.waitForTimeout(300);
    expect(await stageScale(2)).toBeGreaterThanOrEqual(0.999);

    // and scene 2 entry is a window, not full-bleed
    await page.evaluate(() => {
      if (window.__lenis) window.__lenis.scrollTo(1350, { immediate: true, force: true });
      ScrollTrigger.update();
    });
    await page.waitForTimeout(300);
    const entry = await stageScale(2);
    expect(entry).toBeGreaterThan(0.84);
    expect(entry).toBeLessThan(0.91);
  });
});
