(function () {
  "use strict";

  var rail = document.querySelector("[data-home-stage-rail]");
  var shared = window.DaFanMotionShared;
  if (!rail || !shared) return;

  var scenes = gsap.utils.toArray(rail.querySelectorAll("[data-home-scene]"));
  if (!scenes.length) return;

  var HERO_FOCUS = "[data-hero-pill], [data-hero-pause]";

  function motionUnavailable() {
    return typeof gsap === "undefined" || typeof ScrollTrigger === "undefined";
  }

  function setMotionClass(on) {
    document.documentElement.classList.toggle("home-stages--motion", on);
    rail.classList.toggle("home-stage-rail--motion", on);
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

  function killTriggers() {
    triggers.forEach(function (st) {
      if (st && st.kill) st.kill();
    });
    triggers = [];
    if (onScrollEnd) {
      ScrollTrigger.removeEventListener("scrollEnd", onScrollEnd);
      onScrollEnd = null;
    }
    if (onScrollSync) {
      window.removeEventListener("scroll", onScrollSync);
      onScrollSync = null;
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

  function buildMotion() {
    killTriggers();
    setMotionClass(true);
    setActiveScene(0);

    scenes.forEach(function (scene, index) {
      triggers.push(
        ScrollTrigger.create({
          trigger: scene,
          start: "top top",
          end: "+=100%",
          pin: true,
          pinSpacing: true,
          scrub: 0.65,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          id: "home-scene-" + index,
          snap: {
            snapTo: 1,
            duration: { min: 0.12, max: 0.28 },
            delay: 0.015,
            ease: "power1.inOut",
          },
          onEnter: function () {
            setActiveScene(index);
          },
          onEnterBack: function () {
            setActiveScene(index);
          },
          onUpdate: function (self) {
            if (self.isActive) setActiveScene(index);
          },
        })
      );

      var img = scene.querySelector(".home-scene-media img");
      if (img) {
        var tween = gsap.fromTo(
          img,
          { scale: 1.04 },
          {
            scale: 1,
            ease: "none",
            scrollTrigger: {
              trigger: scene,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          }
        );
        if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
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

    shared.whenLayoutReady(rail, function () {
      shared.refreshScrollTriggers();
    });
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

  mm.add(shared.MOTION_MQ, function () {
    buildMotion();
    return teardownMotion;
  });

  var reduceMql = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduceMql.addEventListener("change", function () {
    if (mm) mm.revert();
    requestAnimationFrame(function () {
      if (mm && !reduceMql.matches && window.matchMedia(shared.MOTION_MQ).matches) {
        mm.refresh();
      }
    });
  });
})();
