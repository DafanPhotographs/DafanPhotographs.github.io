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
  sampleWheelTrace,
  pairScaleAtSameScrollY,
  screenshotStageAtSample,
  attachCloudinaryResponseLog,
  readSceneVisibilityMeta,
  SCENE_PUBLIC,
} = require("./helpers/home-scroll-stable.cjs");

const WHEEL_FORWARD = 12;
const WHEEL_BACK = 16;
const WHEEL_DELTA = 250;

test.describe("desktop-six-percent guards", () => {
  test("768: scene0 fill delivery", async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, false);
  });

  test("375: mobile token 0.6", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const tok = await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue("--media-scale-from-mobile").trim()
    );
    expect(tok).toBe("0.6");
  });

  test("375: scene0 still fill not limit", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, false);
    const src = await page.locator('[data-home-scene="0"] img').evaluate((img) => img.currentSrc);
    expect(src).not.toContain("c_limit");
  });
});

test.describe("desktop-six-percent post-impl", () => {
  test("desktop layout: media-scale layout box ~100% of stage", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const layout = await readLayoutMediaRatio(page, 0);
    expect(layout.offsetRatio).toBeGreaterThan(0.98);
    expect(layout.offsetRatio).toBeLessThan(1.02);
  });

  test("desktop token --media-scale-from is 1 at 1024+", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    const from = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".page-home")).getPropertyValue("--media-scale-from").trim()
    );
    expect(from).toBe("1");
    const to = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".page-home")).getPropertyValue("--media-scale-to").trim()
    );
    expect(to).toBe("1.06");
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

  test("desktop scene0 end scale ~1.06", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await scrollTriggerProgress(page, 0, 1);
    const scale = await waitForScrubStable(page, () =>
      page.evaluate(() =>
        Number(gsap.getProperty(document.querySelector('[data-home-scene="0"] .home-scene-media-scale'), "scale"))
      )
    );
    expect(scale).toBeGreaterThanOrEqual(1.05);
    expect(scale).toBeLessThanOrEqual(1.07);
  });

  for (let sceneIndex = 0; sceneIndex < 3; sceneIndex += 1) {
    test("seek-mid-scale-scene" + sceneIndex, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto("/");
      await page.waitForLoadState("networkidle");
      await scrollTriggerProgress(page, sceneIndex, 0.5);
      const scale = await waitForScrubStable(page, () =>
        page.evaluate(
          (idx) =>
            Number(
              gsap.getProperty(
                document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale'),
                "scale"
              )
            ),
          sceneIndex
        )
      );
      expect(scale).toBeGreaterThanOrEqual(1.02);
      expect(scale).toBeLessThanOrEqual(1.04);
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
  });

  test("fallback: fill abort => failed", async ({ page }) => {
    await page.route(
      (url) => isHeroLimitUrl(url, "bipenggou") || isHeroFillUrl(url, "bipenggou"),
      (route) => route.abort()
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForFunction(
      () => document.querySelector('[data-home-scene="0"] img').dataset.heroPictureState === "failed",
      { timeout: 15000 }
    );
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

    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/");
    await waitForHeroDelivery(page, 0, true);
    journal.forEach((j) => {
      if (j.phase === "pending") j.phase = "after_first_1024";
    });

    await page.setViewportSize({ width: 1023, height: 768 });
    await waitForHeroDelivery(page, 0, false);
    journal.forEach((j) => {
      if (j.phase === "pending") j.phase = "after_1023";
    });

    await page.setViewportSize({ width: 1024, height: 768 });
    await waitForHeroDelivery(page, 0, true);
    journal.forEach((j) => {
      if (j.phase === "pending") j.phase = "after_second_1024";
    });

    expect(journal.length).toBeGreaterThanOrEqual(1);
    await test.info().attach("resize-journal", {
      body: JSON.stringify(
        {
          total: journal.length,
          byPhase: {
            after_first_1024: tag("after_first_1024"),
            after_1023: tag("after_1023"),
            after_second_1024: tag("after_second_1024"),
          },
          urls: journal,
        },
        null,
        2
      ),
      contentType: "application/json",
    });
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

const WHEEL_START_PROGRESS = [0.35, 0.42, 0.15];

for (const sceneIndex of [0, 1, 2]) {
  test("wheel-roundtrip-scene" + sceneIndex + "-matched-scrollY", async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await scrollTriggerProgress(page, sceneIndex, WHEEL_START_PROGRESS[sceneIndex]);
    const samples = await sampleWheelTrace(page, sceneIndex, WHEEL_FORWARD, WHEEL_BACK, WHEEL_DELTA);
    const forward = samples.filter((s) => s.tag.startsWith("fwd-"));
    const backward = samples.filter((s) => s.tag.startsWith("back-"));
    let pairs = pairScaleAtSameScrollY(forward, backward, 130);
    if (pairs.length < 2) {
      pairs = pairScaleAtSameScrollY(forward, backward, 180);
    }
    expect(pairs.length, "need ≥2 scrollY pairs; tune WHEEL_* constants").toBeGreaterThanOrEqual(2);

    const outDir = testInfo.outputPath("wheel-scene" + sceneIndex);
    fs.mkdirSync(outDir, { recursive: true });
    const shotMeta = [];
    let compositionPairs = 0;
    for (let i = 0; i < Math.min(pairs.length, 4); i += 1) {
      const pair = pairs[i];
      expect(pair.backScale).toBeLessThanOrEqual(pair.forwardScale + 0.01);
      await page.evaluate((y) => {
        window.scrollTo(0, y);
        ScrollTrigger.update();
      }, pair.scrollY);
      await waitForScrubStable(page, () =>
        page.evaluate((idx) => {
          const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
          return media ? Number(gsap.getProperty(media, "scale")) : 0;
        }, sceneIndex)
      );
      const live = {
        ...(await readSceneVisibilityMeta(page, sceneIndex)),
        scrollY: pair.scrollY,
        scale: pair.forwardScale,
      };
      const shot = await screenshotStageAtSample(
        page,
        sceneIndex,
        live,
        path.join(outDir, "pair" + i + "-same-scrollY.png")
      );
      const proof = !!(pair.compositionProof && shot.compositionProof);
      if (proof) compositionPairs += 1;
      shotMeta.push({
        pair: i,
        scrollY: pair.scrollY,
        forwardScale: pair.forwardScale,
        backScale: pair.backScale,
        compositionProof: proof,
        shot,
      });
    }
    await testInfo.attach("wheel-trace-scene" + sceneIndex, {
      body: JSON.stringify({ samples, pairs, shotMeta, compositionPairs }, null, 2),
      contentType: "application/json",
    });
    if (compositionPairs < 1) {
      testInfo.annotations.push({
        type: "compositionIncomplete",
        description: "No unobscured same-scrollY pair for scene " + sceneIndex,
      });
    }
  });
}
