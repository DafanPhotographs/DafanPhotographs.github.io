(function () {
  "use strict";

  var rail = document.querySelector("[data-home-stage-rail]");
  var shared = window.DaFanMotionShared;
  if (!rail || !shared) return;

  var scenes = gsap.utils.toArray(rail.querySelectorAll("[data-home-scene]"));
  if (!scenes.length) return;

  function motionUnavailable() {
    return typeof gsap === "undefined" || typeof ScrollTrigger === "undefined";
  }

  function setMotionClass(on) {
    document.documentElement.classList.toggle("home-stages--motion", on);
    rail.classList.toggle("home-stage-rail--motion", on);
  }

  /* Window entry: stage starts at --window-scale-from and reaches 1 exactly when it pins. */
  var LENIS_LERP = 0.1; /* 0.1 ≈ daofor's smoothing; larger = tighter */

  function readWindowScaleFrom() {
    if (!document.body || !document.body.classList.contains("page-home")) return 0.75;
    var raw = getComputedStyle(document.body).getPropertyValue("--window-scale-from").trim();
    var n = parseFloat(raw);
    return isFinite(n) ? n : 0.75;
  }

  var lenis = null;

  function lenisTick(time) {
    if (lenis) lenis.raf(time * 1000);
  }

  function initSmoothScroll() {
    if (lenis || typeof window.Lenis === "undefined") return;
    lenis = new window.Lenis({ lerp: LENIS_LERP, smoothWheel: true });
    window.__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(lenisTick);
    gsap.ticker.lagSmoothing(0);
  }

  function destroySmoothScroll() {
    if (!lenis) return;
    gsap.ticker.remove(lenisTick);
    lenis.destroy();
    lenis = null;
    delete window.__lenis;
  }

  var heroPictureControlsInited = false;

  function initHomeHeroPictureFallback() {
    if (!document.body.classList.contains("page-home")) return;
    document.querySelectorAll(".home-scene-media-scale img[data-cloud-fallback-fill]").forEach(function (img) {
      if (img.dataset.heroPictureBound === "1") return;
      img.dataset.heroPictureBound = "1";
      if (!img.dataset.heroFallbackCycle) img.dataset.heroFallbackCycle = "1";
      img.addEventListener("error", function () {
        var state = img.dataset.heroPictureState || "";
        if (state === "fill" || state === "failed" || state === "retrying") {
          img.dataset.heroPictureState = "failed";
          return;
        }
        var picture = img.closest("picture.home-scene-picture");
        if (picture) {
          picture.querySelectorAll("source").forEach(function (source) {
            source.remove();
          });
        }
        img.dataset.heroPictureState = "retrying";
        var fillUrl = img.getAttribute("data-cloud-fallback-fill");
        if (!fillUrl) {
          img.dataset.heroPictureState = "failed";
          return;
        }
        img.src = fillUrl;
      });
      img.addEventListener("load", function () {
        if (img.dataset.heroPictureState === "retrying") {
          img.dataset.heroPictureState = "fill";
        }
      });
      if (img.complete && img.naturalWidth === 0) {
        img.dispatchEvent(new Event("error"));
      }
    });
  }

  function initHomeHeroPictureResize() {
    if (!document.body.classList.contains("page-home")) return;
    var mq = window.matchMedia("(min-width: 1024px)");
    function onChange() {
      if (!mq.matches) return;
      document.querySelectorAll("picture.home-scene-picture").forEach(function (picture) {
        var img = picture.querySelector("img[data-cloud-fallback-fill]");
        if (!img || img.dataset.heroPictureState !== "fill") return;
        var srcset = picture.getAttribute("data-desktop-limit-srcset");
        if (!srcset) return;
        if (picture.querySelector("source")) return;
        var source = document.createElement("source");
        source.media = "(min-width: 1024px)";
        source.srcset = srcset;
        picture.insertBefore(source, img);
        var cycle = parseInt(img.dataset.heroFallbackCycle || "1", 10);
        if (!isFinite(cycle) || cycle < 1) cycle = 1;
        img.dataset.heroFallbackCycle = String(cycle + 1);
        img.dataset.heroPictureState = "";
      });
    }
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
    } else if (typeof mq.addListener === "function") {
      mq.addListener(onChange);
    }
  }

  function ensureHeroPictureControls() {
    if (heroPictureControlsInited) return;
    heroPictureControlsInited = true;
    initHomeHeroPictureFallback();
    initHomeHeroPictureResize();
  }

  function focusablesIn(scene) {
    var sel =
      'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])';
    var nodes = scene.querySelectorAll(sel);
    if (scene.matches && scene.matches(sel)) {
      var merged = [scene];
      nodes.forEach(function (el) {
        merged.push(el);
      });
      return merged;
    }
    return nodes;
  }

  function setActiveScene(index) {
    scenes.forEach(function (scene, i) {
      var active = i === index;
      scene.classList.toggle("is-stage-active", active);
      scene.setAttribute("aria-hidden", active ? "false" : "true");
      focusablesIn(scene).forEach(function (el) {
        if (el.closest(".site-header")) return;
        if (active) {
          if (el.hasAttribute("data-stage-tabindex")) {
            var prev = el.getAttribute("data-stage-tabindex");
            if (prev === "") el.removeAttribute("tabindex");
            else el.setAttribute("tabindex", prev);
            el.removeAttribute("data-stage-tabindex");
          }
        } else if (!el.hasAttribute("data-stage-tabindex")) {
          el.setAttribute("data-stage-tabindex", el.getAttribute("tabindex") || "");
          el.tabIndex = -1;
        }
      });
    });
    rail.setAttribute("data-active-scene", String(index));
  }

  function releaseFocusability() {
    scenes.forEach(function (scene) {
      scene.removeAttribute("aria-hidden");
      scene.classList.remove("is-stage-active");
      scene.querySelectorAll("[data-stage-tabindex]").forEach(function (el) {
        var prev = el.getAttribute("data-stage-tabindex");
        if (prev === "") el.removeAttribute("tabindex");
        else el.setAttribute("tabindex", prev);
        el.removeAttribute("data-stage-tabindex");
      });
    });
    rail.removeAttribute("data-active-scene");
  }

  var triggers = [];
  var unbindLayout = null;
  var mm = null;
  var onScrollEnd = null;
  var onScrollSync = null;
  var onResizeRefresh = null;

  function killTriggers() {
    triggers.forEach(function (st) {
      if (st && st.kill) st.kill();
    });
    triggers = [];
    scenes.forEach(function (scene) {
      gsap.set(scene, { clearProps: "transform" });
      var stage = scene.querySelector(".home-scene-stage");
      if (stage) gsap.set(stage, { clearProps: "transform" });
      var media = scene.querySelector(".home-scene-media-scale");
      if (media) gsap.set(media, { clearProps: "transform" });
    });
    if (onScrollEnd) {
      ScrollTrigger.removeEventListener("scrollEnd", onScrollEnd);
      onScrollEnd = null;
    }
    if (onScrollSync) {
      window.removeEventListener("scroll", onScrollSync);
      onScrollSync = null;
    }
    if (onResizeRefresh) {
      window.removeEventListener("resize", onResizeRefresh);
      onResizeRefresh = null;
    }
  }

  function syncActiveFromViewport() {
    var best = 0;
    scenes.forEach(function (scene, i) {
      var top = scene.getBoundingClientRect().top;
      if (top <= 4) best = i;
    });
    setActiveScene(best);
  }

  function sceneScrollHandlers(index) {
    return {
      onEnter: function () {
        setActiveScene(index);
      },
      onEnterBack: function () {
        setActiveScene(index);
      },
      onUpdate: function (self) {
        if (self.isActive) setActiveScene(index);
      },
    };
  }

  /**
   * daofor-style entry: the whole stage is a "window" that grows from 75% to 100%.
   * The tween ends at `top top` (the moment the stage pins), so the image SETTLES
   * and stays still while pinned - no endless zoom.
   */
  function buildFeaturedStickyScale(scene, index) {
    var stage = scene.querySelector(".home-scene-stage");
    if (!stage) return;

    var handlers = sceneScrollHandlers(index);

    /* First stage is already in place on load; nothing to animate. */
    if (index === 0) {
      gsap.set(stage, { scale: 1 });
      triggers.push(
        ScrollTrigger.create(
          Object.assign(
            {
              trigger: scene,
              start: "top bottom",
              end: "top top",
              id: "home-scene-" + index,
            },
            handlers
          )
        )
      );
      return;
    }

    gsap.set(stage, { transformOrigin: "50% 50%" });

    var tween = gsap.fromTo(
      stage,
      { scale: readWindowScaleFrom },
      {
        scale: 1,
        ease: "none",
        immediateRender: true,
        scrollTrigger: Object.assign(
          {
            trigger: scene,
            start: "top bottom",
            end: "top top",
            scrub: true,
            invalidateOnRefresh: true,
            id: "home-scene-" + index,
          },
          handlers
        ),
      }
    );

    if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
  }

  function buildMotion() {
    killTriggers();
    setMotionClass(true);
    setActiveScene(0);
    ensureHeroPictureControls();
    initSmoothScroll();

    scenes.forEach(function (scene, index) {
      buildFeaturedStickyScale(scene, index);
    });

    onScrollSync = function () {
      syncActiveFromViewport();
    };
    window.addEventListener("scroll", onScrollSync, { passive: true });

    onScrollEnd = function () {
      syncActiveFromViewport();
    };
    ScrollTrigger.addEventListener("scrollEnd", onScrollEnd);

    unbindLayout = shared.bindLayoutObservers(rail, function () {
      shared.whenLayoutReady(rail, shared.refreshScrollTriggers);
    });

    onResizeRefresh = function () {
      shared.refreshScrollTriggers();
    };
    window.addEventListener("resize", onResizeRefresh, { passive: true });

    shared.whenLayoutReady(rail, function () {
      shared.refreshScrollTriggers();
      applyHashDeepLink();
    });
  }

  function scrollToSceneIndex(index) {
    var scene = scenes[index];
    if (!scene) return;
    var top = scene.getBoundingClientRect().top + window.pageYOffset;
    if (lenis) lenis.scrollTo(Math.max(0, top), { immediate: true });
    else window.scrollTo(0, Math.max(0, top));
    setActiveScene(index);
  }

  function applyHashDeepLink() {
    var hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    var target = document.querySelector(hash);
    if (!target || !rail.contains(target)) return;
    var idx = target.getAttribute("data-home-scene");
    if (idx == null) return;
    scrollToSceneIndex(Number(idx));
  }

  function teardownMotion() {
    destroySmoothScroll();
    killTriggers();
    if (unbindLayout) {
      unbindLayout();
      unbindLayout = null;
    }
    setMotionClass(false);
    releaseFocusability();
    if (typeof ScrollTrigger !== "undefined") ScrollTrigger.refresh();
  }

  if (motionUnavailable()) {
    setMotionClass(false);
    return;
  }

  try {
    gsap.registerPlugin(ScrollTrigger);
  } catch (err) {
    setMotionClass(false);
    return;
  }

  mm = gsap.matchMedia();

  mm.add(shared.HOME_MOTION_MQ, function () {
    buildMotion();
    return teardownMotion;
  });

  var reduceMql = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduceMql.addEventListener("change", function () {
    if (mm) mm.revert();
    requestAnimationFrame(function () {
      if (mm && !reduceMql.matches && window.matchMedia(shared.HOME_MOTION_MQ).matches) {
        mm.refresh();
      }
    });
  });
})();
