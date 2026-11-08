(function () {
  "use strict";

  var rail = document.querySelector("[data-home-stage-rail]");
  var shared = window.DaFanMotionShared;
  if (!rail || !shared) return;

  var scenes = gsap.utils.toArray(rail.querySelectorAll("[data-home-scene]"));
  if (!scenes.length) return;

  var HERO_FOCUS = "[data-hero-pill], [data-hero-pause]";
  var FEATURED_SELECTOR = ".featured-panel";

  function motionUnavailable() {
    return typeof gsap === "undefined" || typeof ScrollTrigger === "undefined";
  }

  function setMotionClass(on) {
    document.documentElement.classList.toggle("home-stages--motion", on);
    rail.classList.toggle("home-stage-rail--motion", on);
  }

  function isFeaturedScene(scene) {
    return scene.classList.contains("featured-panel") || scene.matches(FEATURED_SELECTOR);
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
    if (!isFinite(n)) return mobile ? 0.6 : 0.75;
    return n;
  }

  function focusablesIn(scene) {
    return scene.querySelectorAll(
      'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])'
    );
  }

  function setActiveScene(index) {
    scenes.forEach(function (scene, i) {
      var active = i === index;
      scene.classList.toggle("is-stage-active", active);
      scene.setAttribute("aria-hidden", active ? "false" : "true");
      focusablesIn(scene).forEach(function (el) {
        if (el.closest(".site-header") || el.matches(HERO_FOCUS)) return;
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
      if (active) {
        scene.querySelectorAll(HERO_FOCUS).forEach(function (el) {
          if (el.hasAttribute("data-stage-tabindex")) {
            var prev = el.getAttribute("data-stage-tabindex");
            if (prev === "") el.removeAttribute("tabindex");
            else el.setAttribute("tabindex", prev);
            el.removeAttribute("data-stage-tabindex");
          }
        });
      } else {
        scene.querySelectorAll(HERO_FOCUS).forEach(function (el) {
          if (!el.hasAttribute("data-stage-tabindex")) {
            el.setAttribute("data-stage-tabindex", el.getAttribute("tabindex") || "");
            el.tabIndex = -1;
          }
        });
      }
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
      gsap.set(scene, { clearProps: "transform,zIndex" });
      var media = scene.querySelector(".home-scene-media");
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
    var bestDist = Infinity;
    scenes.forEach(function (scene, i) {
      var top = scene.getBoundingClientRect().top;
      var dist = Math.abs(top);
      if (dist < bestDist) {
        bestDist = dist;
        best = i;
      }
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

  function pinSnapBlock() {
    return {
      snap: {
        snapTo: 1,
        duration: { min: 0.12, max: 0.28 },
        delay: 0.015,
        ease: "power1.inOut",
      },
    };
  }

  function buildHeroPin(scene, index) {
    var handlers = sceneScrollHandlers(index);
    triggers.push(
      ScrollTrigger.create(
        Object.assign(
          {
            trigger: scene,
            start: "top top",
            end: "+=100%",
            pin: true,
            pinSpacing: true,
            scrub: 0.65,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            id: "home-scene-" + index,
          },
          pinSnapBlock(),
          handlers
        )
      )
    );
  }

  function buildFeaturedPin(scene, index) {
    var media = scene.querySelector(".home-scene-media");
    if (!media) {
      buildHeroPin(scene, index);
      return;
    }

    var handlers = sceneScrollHandlers(index);
    gsap.set(scene, { zIndex: 20 + index });

    var tween = gsap.fromTo(
      media,
      {
        scale: function () {
          return readMediaScaleFrom();
        },
      },
      {
        scale: 1,
        ease: "none",
        immediateRender: false,
        scrollTrigger: Object.assign(
          {
            trigger: scene,
            start: "top top",
            end: "+=100%",
            pin: true,
            pinSpacing: true,
            scrub: 0.65,
            anticipatePin: 1,
            invalidateOnRefresh: true,
            id: "home-scene-" + index,
          },
          pinSnapBlock(),
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

    scenes.forEach(function (scene, index) {
      if (isFeaturedScene(scene)) {
        buildFeaturedPin(scene, index);
      } else {
        buildHeroPin(scene, index);
      }
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
    var st = triggers.filter(function (t) {
      return t.vars && t.vars.id === "home-scene-" + index;
    })[0];
    if (!st) return;
    window.scrollTo(0, st.start + 2);
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
