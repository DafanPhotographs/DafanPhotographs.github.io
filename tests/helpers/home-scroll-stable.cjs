// @ts-check

const SCENE_PUBLIC = ["bipenggou", "emeishan", "qingdao"];

function heroUrlString(url) {
  if (typeof url === "string") return url;
  if (url && typeof url.href === "string") return url.href;
  return String(url);
}

function isHeroLimitUrl(url, publicId) {
  const u = heroUrlString(url);
  return u.includes(
    "/upload/c_limit,w_2400,q_auto,f_auto/dafan/series/" + publicId + "/cover.jpg"
  );
}

function isHeroFillUrl(url, publicId) {
  const u = heroUrlString(url);
  return u.includes(
    "/upload/c_fill,g_auto,w_2400,h_1600,f_auto,q_auto/dafan/series/" + publicId + "/cover.jpg"
  );
}

async function waitForScrubStable(page, predicate, opts = {}) {
  const maxMs = opts.maxMs ?? 8000;
  const interval = opts.interval ?? 50;
  const stableFrames = opts.stableFrames ?? 3;
  const start = Date.now();
  let last = null;
  let stable = 0;
  while (Date.now() - start < maxMs) {
    await page.evaluate(() => {
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.update();
    });
    const v = await predicate();
    if (last !== null && Math.abs(v - last) < 0.002) stable += 1;
    else stable = 0;
    last = v;
    if (stable >= stableFrames) return v;
    await page.waitForTimeout(interval);
  }
  throw new Error("Scrub stable timeout; last=" + last);
}

async function scrollTriggerProgress(page, sceneIndex, progress) {
  await page.evaluate(
    ({ idx, p }) => {
      if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh();
      const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-" + idx);
      if (!st) throw new Error("missing home-scene-" + idx);
      window.scrollTo(0, st.start + (st.end - st.start) * p);
      ScrollTrigger.update();
    },
    { idx: sceneIndex, p: progress }
  );
  await page.waitForFunction(
    ({ idx, p }) => {
      const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-" + idx);
      return st && st.progress >= p - 0.08;
    },
    { idx: sceneIndex, p: progress },
    { timeout: 10000 }
  );
}

async function readLayoutMediaRatio(page, sceneIndex) {
  return page.evaluate((idx) => {
    const stage = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-stage');
    const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
    const stageW = stage.offsetWidth;
    const mediaW = media.offsetWidth;
    const cw = parseFloat(getComputedStyle(media).width);
    return {
      offsetRatio: mediaW / stageW,
      computedWidth: cw,
      stageW,
      mediaW,
    };
  }, sceneIndex);
}

async function waitForHeroDelivery(page, sceneIndex, expectLimit) {
  const publicId = SCENE_PUBLIC[sceneIndex];
  await page.waitForFunction(
    ({ idx, limit, pid }) => {
      const img = document.querySelector('[data-home-scene="' + idx + '"] img');
      if (!img || !img.currentSrc.includes("dafan/series/" + pid + "/cover")) return false;
      if (img.naturalWidth === 0) return false;
      const src = img.currentSrc;
      if (limit) return src.includes("c_limit") && !src.includes("h_1600");
      return src.includes("c_fill") && src.includes("h_1600");
    },
    { idx: sceneIndex, limit: expectLimit, pid: publicId },
    { timeout: 15000 }
  );
}

async function readSceneVisibilityMeta(page, sceneIndex) {
  return page.evaluate((idx) => {
    const scenes = [...document.querySelectorAll("[data-home-scene]")];
    const visibleSceneIndices = scenes
      .filter((s) => {
        const r = s.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight && r.height > 0;
      })
      .map((s) => Number(s.getAttribute("data-home-scene")));
    const img = document.querySelector('[data-home-scene="' + idx + '"] img');
    const src = img && img.currentSrc ? img.currentSrc : "";
    let publicId = null;
    for (const id of ["bipenggou", "emeishan", "qingdao"]) {
      if (src.includes("/" + id + "/")) publicId = id;
    }
    const closing = document.querySelector(".home-closing");
    const closingVisible =
      closing &&
      getComputedStyle(closing).display !== "none" &&
      (() => {
        const r = closing.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      })();
    const onlyTargetVisible = visibleSceneIndices.length === 1 && visibleSceneIndices[0] === idx;
    const obscured = !onlyTargetVisible || !!closingVisible;
    return {
      currentSrcPublicId: publicId,
      visibleSceneIndices,
      onlyTargetVisible,
      closingVisible: !!closingVisible,
      obscured,
      compositionProof: !obscured,
    };
  }, sceneIndex);
}

async function pushWheelSample(page, sceneIndex, samples, tag) {
  await waitForScrubStable(page, () =>
    page.evaluate((idx) => {
      const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
      return media ? Number(gsap.getProperty(media, "scale")) : 0;
    }, sceneIndex)
  );
  const row = await page.evaluate((idx) => {
    const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-" + idx);
    const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
    return {
      scrollY: window.scrollY,
      progress: st ? st.progress : null,
      scale: media ? Number(gsap.getProperty(media, "scale")) : null,
    };
  }, sceneIndex);
  const vis = await readSceneVisibilityMeta(page, sceneIndex);
  samples.push({ tag, ...row, ...vis });
}

async function sampleWheelTrace(page, sceneIndex, forwardSteps, backSteps, deltaY, opts = {}) {
  const minPairs = opts.minPairs ?? 2;
  const maxExtraBack = opts.maxExtraBack ?? 28;
  const samples = [];
  await page.mouse.move(720, 450);
  await pushWheelSample(page, sceneIndex, samples, "start");
  for (let i = 0; i < forwardSteps; i += 1) {
    await page.mouse.wheel(0, deltaY);
    await pushWheelSample(page, sceneIndex, samples, "fwd-" + i);
  }
  for (let i = 0; i < backSteps; i += 1) {
    await page.mouse.wheel(0, -deltaY);
    await pushWheelSample(page, sceneIndex, samples, "back-" + i);
  }
  const startY = samples[0].scrollY;
  let extra = 0;
  while (extra < maxExtraBack) {
    const forward = samples.filter((s) => s.tag.startsWith("fwd-"));
    const backward = samples.filter((s) => s.tag.startsWith("back-"));
    if (pairScaleAtSameScrollY(forward, backward, 130).length >= minPairs) break;
    const last = samples[samples.length - 1];
    if (last.scrollY <= startY + 50) break;
    await page.mouse.wheel(0, -deltaY);
    await pushWheelSample(page, sceneIndex, samples, "back-extra-" + extra);
    extra += 1;
  }
  return samples;
}

function pairScaleAtSameScrollY(forward, backward, tolerancePx = 24) {
  const fwd = forward.filter((s) => s.tag.startsWith("fwd-"));
  const back = backward.filter((s) => s.tag.startsWith("back-"));
  const pairs = [];
  const usedBack = new Set();
  for (const f of fwd) {
    let best = null;
    let bestIdx = -1;
    let bestDelta = Infinity;
    for (let i = 0; i < back.length; i += 1) {
      if (usedBack.has(i)) continue;
      const b = back[i];
      const delta = Math.abs(f.scrollY - b.scrollY);
      if (delta <= tolerancePx && delta < bestDelta) {
        bestDelta = delta;
        best = b;
        bestIdx = i;
      }
    }
    if (best) {
      usedBack.add(bestIdx);
      pairs.push({
        scrollY: f.scrollY,
        scrollYDelta: bestDelta,
        forwardScale: f.scale,
        backScale: best.scale,
        forwardMeta: f,
        backMeta: best,
        compositionProof: !!(f.compositionProof && best.compositionProof),
      });
    }
  }
  return pairs;
}

async function screenshotStageAtSample(page, sceneIndex, sample, outPath) {
  const stage = page.locator('[data-home-scene="' + sceneIndex + '"] .home-scene-stage');
  await stage.screenshot({ path: outPath });
  return {
    path: outPath,
    sceneIndex,
    scrollY: sample.scrollY,
    scale: sample.scale,
    currentSrcPublicId: sample.currentSrcPublicId,
    visibleSceneIndices: sample.visibleSceneIndices,
    onlyTargetVisible: sample.onlyTargetVisible,
    obscured: sample.obscured,
    compositionProof: sample.compositionProof,
  };
}

async function attachCloudinaryResponseLog(page, log) {
  page.on("response", async (response) => {
    const url = response.url();
    if (!url.includes("res.cloudinary.com")) return;
    const headers = response.headers();
    let bodyBytes = null;
    let bodyError = null;
    try {
      const body = await response.body();
      bodyBytes = body.length;
    } catch (e) {
      bodyBytes = null;
      bodyError = String(e);
    }
    const cl = headers["content-length"];
    const contentLength = cl ? Number(cl) : null;
    const row = {
      url,
      status: response.status(),
      contentType: headers["content-type"] || "unknown",
      vary: headers["vary"] || null,
      contentLength,
      bodyBytes,
      bodyError,
      fromServiceWorker: response.fromServiceWorker(),
    };
    Object.assign(row, classifyHeroBytesRow(row));
    log.push(row);
  });
}

function classifyHeroBytesRow(row) {
  const hasBody = typeof row.bodyBytes === "number" && row.bodyBytes >= 0;
  const hasCl = typeof row.contentLength === "number" && row.contentLength > 0;
  if (hasBody || hasCl) {
    return {
      bytesStatus: "known",
      bytesValue: hasBody ? row.bodyBytes : row.contentLength,
      volumeGate: "eligible",
    };
  }
  return { bytesStatus: "unknown", bytesValue: null, volumeGate: "Incomplete" };
}

module.exports = {
  SCENE_PUBLIC,
  isHeroLimitUrl,
  isHeroFillUrl,
  waitForScrubStable,
  scrollTriggerProgress,
  readLayoutMediaRatio,
  waitForHeroDelivery,
  readSceneVisibilityMeta,
  sampleWheelTrace,
  pairScaleAtSameScrollY,
  screenshotStageAtSample,
  attachCloudinaryResponseLog,
  classifyHeroBytesRow,
};
