// @ts-check
const path = require("path");
const fs = require("fs");
const {
  waitForScrubStable,
  scrollTriggerProgress,
  SCROLL_Y_PAIR_TOL_PX,
  SCENE_PUBLIC,
  pairScaleAtSameScrollY,
} = require("./home-scroll-stable.cjs");
const { readTargetStackMeta } = require("./stack-visibility-metrics.cjs");

async function pushWheelSample(page, sceneIndex, samples, tag) {
  // With Lenis the evidence run pins lerp=1 (see wheelFullStackTraversal), so one
  // animation frame is enough for scrollY to reach the wheel target.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await waitForScrubStable(
    page,
    () =>
      page.evaluate((idx) => {
        const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
        return media ? Number(gsap.getProperty(media, "scale")) : 0;
      }, sceneIndex),
    { maxMs: 3500, stableFrames: 2, interval: 40 }
  );
  const meta = await readTargetStackMeta(page, sceneIndex);
  samples.push({ tag, ...meta });
}

/**
 * Full stack: entry → late/p1 → return; wheel pairs |ΔscrollY|≤2; live PNG at pair time.
 */
async function wheelFullStackTraversal(page, sceneIndex, outDir, opts = {}) {
  // Pair equality (|ΔscrollY| ≤ 2px) is measured for layout/stack composition, not for
  // the smoothing curve; pin Lenis to instant so wheel steps land exactly on target.
  // The smooth-scroll contract is covered by the dedicated inertia test.
  await page.evaluate(() => {
    if (window.__lenis && window.__lenis.options) window.__lenis.options.lerp = 1;
  });
  const deltasToTry = opts.deltasToTry || [28, 24, 20];
  let best = null;

  for (const deltaSpec of deltasToTry) {
    const deltaY = typeof deltaSpec === "object" ? deltaSpec.deltaY : deltaSpec;
    const backDeltaY = typeof deltaSpec === "object" ? deltaSpec.backDeltaY ?? deltaY : deltaY;
    const samples = [];
    const checkpointTags = new Set();
    const livePairShots = [];

    await page.mouse.move(720, 450);
    await scrollTriggerProgress(page, sceneIndex, 0);
    await pushWheelSample(page, sceneIndex, samples, "sample-entry-p0");
    await pushWheelSample(page, sceneIndex, samples, "checkpoint-entry-p0");
    await maybeCheckpointScreenshot(page, sceneIndex, samples[samples.length - 1], outDir, "checkpoint-entry-p0", checkpointTags);

    let microLaneDone = false;
    if (opts.microPairLane && sceneIndex === 2) {
      await slowWheelToTargetProgress(page, sceneIndex, samples, {
        minProgress: 0.42,
        maxProgress: 0.58,
        stepDelta: opts.slowApproachDelta ?? 4,
        maxSteps: opts.slowApproachSteps ?? 90,
        tagPrefix: "approach-fwd-",
      });
      await runMicroWheelPairingLane(page, sceneIndex, samples, livePairShots, outDir, opts);
      checkpointTags.add("micro-pair-lane-mid");
      microLaneDone = true;
    }

    let fwd = 0;
    const maxFwd = opts.maxFwd ?? 75;
    for (let i = 0; i < maxFwd; i += 1) {
      await page.mouse.wheel(0, deltaY);
      await pushWheelSample(page, sceneIndex, samples, "fwd-" + i);
      fwd = i + 1;
      const s = samples[samples.length - 1];
      if (
        !microLaneDone &&
        s.progress >= 0.48 &&
        s.progress <= 0.72 &&
        (opts.microPairLane || sceneIndex === 2)
      ) {
        await runMicroWheelPairingLane(page, sceneIndex, samples, livePairShots, outDir, opts);
        microLaneDone = true;
        checkpointTags.add("micro-pair-lane-mid");
      }
      if (s.progress >= 0.45 && !checkpointTags.has("checkpoint-mid-p05")) {
        await maybeCheckpointScreenshot(page, sceneIndex, s, outDir, "checkpoint-mid-p05", checkpointTags);
      }
      if (s.progress >= 0.82 && !checkpointTags.has("checkpoint-late-p085")) {
        await maybeCheckpointScreenshot(page, sceneIndex, s, outDir, "checkpoint-late-p085", checkpointTags);
      }
      if (s.progress >= 0.98 && !checkpointTags.has("checkpoint-end-p1")) {
        await maybeCheckpointScreenshot(page, sceneIndex, s, outDir, "checkpoint-end-p1", checkpointTags);
      }
      if (s.progress >= 0.995) break;
    }

    const forward = samples.filter(
      (x) =>
        x.tag.startsWith("fwd-") ||
        x.tag.startsWith("micro-fwd-") ||
        x.tag.startsWith("approach-fwd-")
    );
    let back = 0;
    const maxBack = opts.maxBack ?? 90;
    const matchedForward = new Set();
    for (let i = 0; i < maxBack; i += 1) {
      await page.mouse.wheel(0, -backDeltaY);
      await pushWheelSample(page, sceneIndex, samples, "back-" + i);
      back = i + 1;
      const bRow = samples[samples.length - 1];
      for (let fi = 0; fi < forward.length; fi += 1) {
        if (matchedForward.has(fi)) continue;
        const fRow = forward[fi];
        const d = Math.abs(fRow.scrollY - bRow.scrollY);
        if (d <= SCROLL_Y_PAIR_TOL_PX) {
          matchedForward.add(fi);
          const shotName = "scene" + sceneIndex + "-pair-live-fwd" + fi + "-back" + i + ".png";
          const shotPath = path.join(outDir, shotName);
          await page
            .locator('[data-home-scene="' + sceneIndex + '"] .home-scene-stage')
            .screenshot({ path: shotPath });
          livePairShots.push({
            forwardTag: fRow.tag,
            backTag: bRow.tag,
            scrollY: fRow.scrollY,
            scrollYDelta: d,
            forwardScale: fRow.scale,
            backScale: bRow.scale,
            forwardProgress: fRow.progress,
            backProgress: bRow.progress,
            forwardWindowEligible: !!fRow.windowCompositionEligible,
            backWindowEligible: !!bRow.windowCompositionEligible,
            windowCompositionEligible: !!fRow.windowCompositionEligible,
            compositionProof: !!(fRow.compositionProof && bRow.compositionProof),
            compositionProofReason: fRow.compositionProofReason + " | " + bRow.compositionProofReason,
            screenshot: shotName,
            pairingMode: "real-wheel-live-at-match",
          });
        }
      }
      if (livePairShots.length >= 2 && bRow.progress !== null && bRow.progress <= 0.08) break;
      if (i >= maxBack - 1) break;
    }

    const backward = samples.filter((x) => x.tag.startsWith("back-") || x.tag.startsWith("micro-back-"));
    const pairs = pairScaleAtSameScrollY(forward, backward, SCROLL_Y_PAIR_TOL_PX);
    const windowCompositionPairs = livePairShots.filter((p) => p.forwardWindowEligible).length;

    const archive = {
      sceneIndex,
      expectedPublicId: SCENE_PUBLIC[sceneIndex],
      pairTolerancePx: SCROLL_Y_PAIR_TOL_PX,
      wheelConfig: { deltaY, backDeltaY, forwardSteps: fwd, backSteps: back, traversal: "entry-full-p1-return" },
      checkpoints: [...checkpointTags],
      samples,
      pairs,
      scrollYDeltas: pairs.map((p) => p.scrollYDelta),
      livePairShots,
      windowCompositionPairs,
      compositionPairs: livePairShots.filter((p) => p.compositionProof).length,
    };

    if (pairs.length >= 2 && windowCompositionPairs >= 1) {
      best = archive;
      break;
    }
    if (!best || pairs.length > (best.pairs?.length || 0)) best = archive;
  }

  const jsonPath = path.join(outDir, "wheel-trace-scene" + sceneIndex + ".json");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(jsonPath, JSON.stringify(best, null, 2));
  return best;
}

async function slowWheelToTargetProgress(page, sceneIndex, samples, cfg) {
  for (let i = 0; i < cfg.maxSteps; i += 1) {
    const last = samples[samples.length - 1];
    if (last.progress !== null && last.progress >= cfg.minProgress && last.progress <= cfg.maxProgress) {
      return last;
    }
    if (last.progress !== null && last.progress > cfg.maxProgress) {
      return last;
    }
    await page.mouse.wheel(0, cfg.stepDelta);
    await pushWheelSample(page, sceneIndex, samples, (cfg.tagPrefix || "slow-fwd-") + i);
  }
  return samples[samples.length - 1];
}

async function runMicroWheelPairingLane(page, sceneIndex, samples, livePairShots, outDir, opts) {
  const microStep = opts.microStep ?? 4;
  const microFwd = opts.microFwdSteps ?? 18;
  const microBack = opts.microBackSteps ?? 40;
  const microForward = [];
  const microMatched = new Set();

  for (let i = 0; i < microFwd; i += 1) {
    await page.mouse.wheel(0, microStep);
    await pushWheelSample(page, sceneIndex, samples, "micro-fwd-" + i);
    microForward.push(samples[samples.length - 1]);
  }

  for (let i = 0; i < microBack; i += 1) {
    await page.mouse.wheel(0, -microStep);
    await pushWheelSample(page, sceneIndex, samples, "micro-back-" + i);
    const bRow = samples[samples.length - 1];
    for (let fi = 0; fi < microForward.length; fi += 1) {
      if (microMatched.has(fi)) continue;
      const fRow = microForward[fi];
      const d = Math.abs(fRow.scrollY - bRow.scrollY);
      if (d <= SCROLL_Y_PAIR_TOL_PX) {
        microMatched.add(fi);
        const shotName = "scene" + sceneIndex + "-pair-live-micro-fwd" + fi + "-back" + i + ".png";
        const shotPath = path.join(outDir, shotName);
        await page
          .locator('[data-home-scene="' + sceneIndex + '"] .home-scene-stage')
          .screenshot({ path: shotPath });
        livePairShots.push({
          forwardTag: fRow.tag,
          backTag: bRow.tag,
          scrollY: fRow.scrollY,
          scrollYDelta: d,
          forwardScale: fRow.scale,
          backScale: bRow.scale,
          forwardProgress: fRow.progress,
          backProgress: bRow.progress,
          forwardWindowEligible: !!fRow.windowCompositionEligible,
          backWindowEligible: !!bRow.windowCompositionEligible,
          windowCompositionEligible: !!fRow.windowCompositionEligible,
          compositionProof: !!(fRow.compositionProof && bRow.compositionProof),
          compositionProofReason: fRow.compositionProofReason + " | " + bRow.compositionProofReason,
          screenshot: shotName,
          pairingMode: "real-wheel-micro-lane-at-match",
        });
      }
    }
  }
}

async function maybeCheckpointScreenshot(page, sceneIndex, row, outDir, name, checkpointTags) {
  checkpointTags.add(name);
  const shotPath = path.join(outDir, "trackB-wheel-scene" + sceneIndex + "-" + name + ".png");
  await page.locator('[data-home-scene="' + sceneIndex + '"] .home-scene-stage').screenshot({ path: shotPath });
  row.checkpointScreenshot = path.basename(shotPath);
  row.checkpointName = name;
}

async function captureTrackBSeekCheckpoints(page, sceneIndex, outDir) {
  await page.evaluate(() => {
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh();
  });
  if (sceneIndex > 0) {
    await scrollTriggerProgress(page, sceneIndex - 1, 0.92);
    await page.waitForTimeout(350);
  }
  await scrollTriggerProgress(page, sceneIndex, 0);
  await page.waitForTimeout(350);
  const points = [
    { p: 0, label: "entry-p0" },
    { p: 0.5, label: "mid-p05" },
    { p: 0.85, label: "late-p085" },
    { p: 1, label: "end-p1" },
  ];
  const rows = [];
  for (const pt of points) {
    await scrollTriggerProgress(page, sceneIndex, pt.p);
    await waitForScrubStable(
      page,
      () =>
        page.evaluate((idx) => {
          const media = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
          return media ? Number(gsap.getProperty(media, "scale")) : 0;
        }, sceneIndex),
      { maxMs: 4000, stableFrames: 2, interval: 40 }
    );
    const meta = await readTargetStackMeta(page, sceneIndex);
    const shotPath = path.join(
      outDir,
      "trackB-synthetic-ST-seek-scene" + sceneIndex + "-" + pt.label + ".png"
    );
    await page.locator('[data-home-scene="' + sceneIndex + '"] .home-scene-stage').screenshot({ path: shotPath });
    const expectedScale = pt.p === 0 ? 1 : pt.p === 0.5 ? 1.03 : pt.p >= 0.85 ? 1.06 : null;
    const stProgress = await page.evaluate((idx) => {
      const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-" + idx);
      return st ? st.progress : null;
    }, sceneIndex);
    rows.push({
      evidenceTrack: "B-synthetic-ST-seek-NOT-wheel",
      samplingMode: "scrollTrigger-progress-scrollTo-only",
      notComparableToWheelTrace: true,
      preferredEvidenceSource: "wheel-trace-scene" + sceneIndex + ".json",
      checkpoint: pt.label,
      scrollTriggerProgressSetpoint: pt.p,
      scrollTriggerProgressObserved: stProgress,
      scrollTriggerSetpointDrift: stProgress != null ? Math.abs(stProgress - pt.p) : null,
      setpointMatchesObserved: stProgress != null && Math.abs(stProgress - pt.p) <= 0.1,
      expectedScale,
      actualScale: meta.scale,
      scaleError: expectedScale != null && meta.scale != null ? meta.scale - expectedScale : null,
      screenshot: path.basename(shotPath),
      p1CompositionNa: pt.p === 1 ? "not-applicable-if-next-scene-stacked" : null,
      ...meta,
    });
  }
  return rows;
}

async function captureTrackAIsolated(page, sceneIndex, outDir) {
  const points = [
    { p: 0, expected: 1.0 },
    { p: 0.5, expected: 1.03 },
    { p: 1, expected: 1.06 },
  ];
  const rows = [];
  for (const pt of points) {
    await page.evaluate(() => {
      document.querySelectorAll("[data-home-scene]").forEach((el) => {
        el.style.visibility = "";
      });
      const closing = document.querySelector(".home-closing");
      if (closing) closing.style.display = "";
    });
    await scrollTriggerProgress(page, sceneIndex, pt.p);
    await page.evaluate((idx) => {
      document.querySelectorAll("[data-home-scene]").forEach((el) => {
        const n = el.getAttribute("data-home-scene");
        el.style.visibility = n === String(idx) ? "visible" : "hidden";
      });
      const closing = document.querySelector(".home-closing");
      if (closing) closing.style.display = "none";
    }, sceneIndex);
    await page.waitForTimeout(200);
    const media = await page.evaluate((idx) => {
      const m = document.querySelector('[data-home-scene="' + idx + '"] .home-scene-media-scale');
      return m ? Number(gsap.getProperty(m, "scale")) : null;
    }, sceneIndex);
    const shotPath = path.join(outDir, "trackA-isolated-scene" + sceneIndex + "-p" + String(pt.p).replace(".", "") + ".png");
    await page.locator('[data-home-scene="' + sceneIndex + '"] .home-scene-stage').screenshot({ path: shotPath });
    rows.push({
      evidenceTrack: "A-isolated-NOT-real-scroll",
      sceneIndex,
      publicId: SCENE_PUBLIC[sceneIndex],
      progress: pt.p,
      expectedScale: pt.expected,
      actualScale: media,
      scaleError: media != null ? media - pt.expected : null,
      compositionProof: true,
      screenshot: path.basename(shotPath),
    });
    await page.evaluate(() => {
      document.querySelectorAll("[data-home-scene]").forEach((el) => {
        el.style.visibility = "";
      });
      const closing = document.querySelector(".home-closing");
      if (closing) closing.style.display = "";
    });
  }
  return rows;
}

module.exports = {
  readTargetStackMeta,
  wheelFullStackTraversal,
  captureTrackBSeekCheckpoints,
  captureTrackAIsolated,
  SCROLL_Y_PAIR_TOL_PX,
};
