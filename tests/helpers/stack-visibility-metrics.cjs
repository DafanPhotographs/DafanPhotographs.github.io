// @ts-check
/**
 * Stack visibility metrics (real DOM). Formulas documented for QA:
 *
 * targetStageBBoxVisibleRatio = (stage ∩ viewport) height / stage height — geometric only, ignores paint order.
 * targetPixelVisibleRatio = fraction of grid samples in (stage ∩ viewport) where elementFromPoint resolves to target scene.
 * pixelDominantSceneIndex = scene index with most grid hits in viewport (sticky stack paint winner).
 * closingVisible = closing section intersects viewport (any overlap).
 * closingObscuresTarget = closing ∩ target stage overlap height > min(48px, 12% stage height).
 */

async function readTargetStackMeta(page, sceneIndex) {
  return page.evaluate((idx) => {
    const scene = document.querySelector('[data-home-scene="' + idx + '"]');
    const stage = scene && scene.querySelector(".home-scene-stage");
    const media = scene && scene.querySelector(".home-scene-media-scale");
    const img = scene && scene.querySelector("img");
    const rail = document.querySelector("[data-home-stage-rail]");
    const active = rail ? rail.getAttribute("data-active-scene") : null;

    function publicIdFromImg(el) {
      if (!el) return null;
      const src = el.currentSrc || el.src || "";
      for (const id of ["bipenggou", "emeishan", "qingdao"]) {
        if (src.includes("/" + id + "/")) return id;
      }
      return null;
    }

    const scenes = [...document.querySelectorAll("[data-home-scene]")];
    const visibleSceneIndices = scenes
      .filter((s) => {
        const r = s.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight && r.height > 0;
      })
      .map((s) => Number(s.getAttribute("data-home-scene")));

    const vh = window.innerHeight;
    const vw = window.innerWidth;
    let targetStageBBoxVisibleRatio = 0;
    let noEdgeCover = null;
    let visLeft = 0;
    let visTop = 0;
    let visW = 0;
    let visH = 0;
    if (stage && media) {
      const sr = stage.getBoundingClientRect();
      const mr = media.getBoundingClientRect();
      visTop = Math.max(sr.top, 0);
      const visBot = Math.min(sr.bottom, vh);
      visLeft = Math.max(sr.left, 0);
      const visRight = Math.min(sr.right, vw);
      visH = Math.max(0, visBot - visTop);
      visW = Math.max(0, visRight - visLeft);
      targetStageBBoxVisibleRatio = sr.height > 0 ? visH / sr.height : 0;
      const eps = 2;
      noEdgeCover =
        mr.left <= sr.left + eps &&
        mr.right >= sr.right - eps &&
        mr.top <= sr.top + eps &&
        mr.bottom >= sr.bottom - eps;
    }

    const sceneHitCounts = {};
    let targetPixelHits = 0;
    let sampleTotal = 0;
    const cols = 12;
    const rows = 8;
    if (visW > 8 && visH > 8) {
      for (let ri = 0; ri < rows; ri += 1) {
        for (let ci = 0; ci < cols; ci += 1) {
          const x = visLeft + (visW * (ci + 0.5)) / cols;
          const y = visTop + (visH * (ri + 0.5)) / rows;
          if (x < 0 || y < 0 || x >= vw || y >= vh) continue;
          sampleTotal += 1;
          const el = document.elementFromPoint(x, y);
          if (!el) continue;
          const ownerScene = el.closest("[data-home-scene]");
          const ownerIdx = ownerScene ? ownerScene.getAttribute("data-home-scene") : null;
          if (ownerIdx != null) {
            sceneHitCounts[ownerIdx] = (sceneHitCounts[ownerIdx] || 0) + 1;
          }
          if (ownerIdx === String(idx)) targetPixelHits += 1;
        }
      }
    }

    const targetPixelVisibleRatio = sampleTotal > 0 ? targetPixelHits / sampleTotal : 0;
    let pixelDominantSceneIndex = null;
    let maxHits = 0;
    for (const [k, v] of Object.entries(sceneHitCounts)) {
      if (v > maxHits) {
        maxHits = v;
        pixelDominantSceneIndex = Number(k);
      }
    }

    const centerEl = document.elementFromPoint(vw / 2, vh / 2);
    const centerScene = centerEl && centerEl.closest("[data-home-scene]");
    const viewportCenterSceneIndex = centerScene ? Number(centerScene.getAttribute("data-home-scene")) : null;
    const viewportCenterPublicId = publicIdFromImg(centerScene && centerScene.querySelector("img"));

    const pixelDominantScenePublicId =
      pixelDominantSceneIndex != null
        ? publicIdFromImg(
            document.querySelector('[data-home-scene="' + pixelDominantSceneIndex + '"] img')
          )
        : null;

    const st = ScrollTrigger.getAll().find((t) => t.vars && t.vars.id === "home-scene-" + idx);
    const progress = st ? st.progress : null;
    const scrollTriggerActive = st ? !!st.isActive : false;
    const scale = media && typeof gsap !== "undefined" ? Number(gsap.getProperty(media, "scale")) : null;
    const src = img && img.currentSrc ? img.currentSrc : "";
    const targetPublicId = publicIdFromImg(img);

    const closing = document.querySelector(".home-closing");
    let closingVisible = false;
    let closingObscuresTarget = false;
    if (closing && getComputedStyle(closing).display !== "none" && stage) {
      const cr = closing.getBoundingClientRect();
      const sr = stage.getBoundingClientRect();
      closingVisible = cr.bottom > 0 && cr.top < vh;
      const overlapH = Math.min(cr.bottom, sr.bottom) - Math.max(cr.top, sr.top);
      closingObscuresTarget = closingVisible && overlapH > Math.min(48, sr.height * 0.12);
    }

    const onlyTargetInViewport = visibleSceneIndices.length === 1 && visibleSceneIndices[0] === idx;
    const activeMatchesTarget = active === String(idx);
    const pixelDominantMatchesTarget = pixelDominantSceneIndex === idx;
    const targetStageVisibleRatio = targetStageBBoxVisibleRatio;

    const windowCompositionEligible =
      scrollTriggerActive &&
      activeMatchesTarget &&
      pixelDominantMatchesTarget &&
      targetPixelVisibleRatio >= 0.25 &&
      !closingObscuresTarget &&
      progress !== null &&
      progress < 0.95;

    let compositionProof = windowCompositionEligible && onlyTargetInViewport && targetPixelVisibleRatio >= 0.92;
    let compositionProofReason = compositionProof
      ? "target_only_visible_window"
      : !scrollTriggerActive || progress === null
        ? "inactive_or_low_visible_ratio"
        : !activeMatchesTarget
          ? "activeScene_mismatch_target"
          : !pixelDominantMatchesTarget
            ? "pixel_dominant_scene_" + pixelDominantSceneIndex + "_not_target"
            : targetPixelVisibleRatio < 0.25
              ? "target_pixel_visible_ratio_low"
              : windowCompositionEligible
                ? "target_active_in_stack_multi_visible"
                : "inactive_or_low_visible_ratio";

    if (progress !== null && progress >= 0.98) {
      compositionProof = false;
      compositionProofReason = "p1_natural_stack_next_scene_active_active=" + active;
    }

    return {
      scrollY: window.scrollY,
      progress,
      scale,
      targetPublicId,
      expectedPublicId: ["bipenggou", "emeishan", "qingdao"][idx],
      activeScene: active,
      visibleSceneIndices,
      targetStageVisibleRatio,
      targetStageBBoxVisibleRatio,
      targetPixelVisibleRatio,
      pixelDominantSceneIndex,
      pixelDominantScenePublicId,
      viewportCenterSceneIndex,
      viewportCenterPublicId,
      activeMatchesPixelDominant: active === String(pixelDominantSceneIndex),
      sceneHitCounts,
      pixelSampleGrid: { cols, rows, sampleTotal },
      noEdgeCover,
      onlyTargetInViewport,
      windowCompositionEligible,
      compositionProof,
      compositionProofReason,
      closingVisible: !!closingVisible,
      closingObscuresTarget: !!closingObscuresTarget,
      currentSrc: src,
      metricsVersion: "stack-visibility-v2-pixel-grid",
    };
  }, sceneIndex);
}

module.exports = { readTargetStackMeta };
