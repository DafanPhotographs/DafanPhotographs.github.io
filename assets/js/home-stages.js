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

  function cssTokenSource() {
    if (document.body && document.body.classList.contains("page-home")) {
      return document.body;
    }
    if (rail) return rail;
    return document.documentElement;
  }

  function readMediaScaleFrom() {
    var root = cssTokenSource();
    var mobile = window.matchMedia("(max-width: 1023.98px)").matches;
    var prop = mobile ? "--media-scale-from-mobile" : "--media-scale-from";
    var raw = getComputedStyle(root).getPropertyValue(prop).trim();
    var n = parseFloat(raw);
    if (!isFinite(n)) return mobile ? 0.6 : 1;
    return n;
  }

  function readMediaScaleTo() {
    var root = cssTokenSource();
    var mobile = window.matchMedia("(max-width: 1023.98px)").matches;
    if (mobile) return 1;
    var raw = getComputedStyle(root).getPropertyValue("--media-scale-to").trim();
    var n = parseFloat(raw);
    if (!isFinite(n)) return 1.06;
    return n;
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

  function buildFeaturedStickyScale(scene, index) {
    var media = scene.querySelector(".home-scene-media-scale");
    if (!media) return;

    var handlers = sceneScrollHandlers(index);
    var mediaPos = { xPercent: -50, yPercent: -50 };

    /* Option A (A-lock): monotonic from→1; rest cover via oversized media + object-fit (CSS). */
    gsap.set(media, Object.assign({ transformOrigin: "center center" }, mediaPos));

    var tween = gsap.fromTo(
      media,
      Object.assign(
        {
          scale: function () {
            return readMediaScaleFrom();
          },
        },
        mediaPos
      ),
      Object.assign(
        {
          scale: function () {
            return readMediaScaleTo();
          },
          ease: "none",
          immediateRender: false,
          scrollTrigger: Object.assign(
            {
              trigger: scene,
              start: index === 0 ? "top top" : "top bottom",
              end: "bottom top",
              scrub: 0.65,
              invalidateOnRefresh: true,
              id: "home-scene-" + index,
            },
            handlers
          ),
        },
        mediaPos
      )
    );

    if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
  }

  function buildMotion() {
    killTriggers();
    setMotionClass(true);
    setActiveScene(0);
    ensureHeroPictureControls();

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
    window.scrollTo(0, Math.max(0, top));
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
