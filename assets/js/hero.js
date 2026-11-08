(function () {
  var TITLE_KEYS = ["s1.title", "s2.title", "s3.title"];

  function resolveI18n(key) {
    if (!window.DaFanI18n || !window.DaFanI18n.dict) return null;
    var lang = window.DaFanI18n.getLang();
    var pack = window.DaFanI18n.dict[lang] || window.DaFanI18n.dict.zh;
    return pack[key] || null;
  }

  function initHero(root) {
    var slides = root.querySelectorAll("[data-hero-slide]");
    var visual = root.querySelector("[data-hero-visual]");
    var titleEl = root.querySelector("[data-hero-scene-title]");
    if (!slides.length) return;

    var index = 0;
    var hoverPaused = false;
    var reducedMotion = false;
    var timerId = null;
    var INTERVAL_MS = 5200;

    function mqReduceMotion() {
      return window.matchMedia("(prefers-reduced-motion: reduce)");
    }

    function readReducedMotion() {
      reducedMotion = mqReduceMotion().matches;
      root.classList.toggle("hero-reduced", reducedMotion);
    }

    function effectivePaused() {
      return hoverPaused || document.visibilityState === "hidden" || reducedMotion;
    }

    function syncHeroTitle(i) {
      if (!titleEl) return;
      var key = TITLE_KEYS[i] || TITLE_KEYS[0];
      titleEl.setAttribute("data-i18n", key);
      var text = resolveI18n(key);
      if (text) titleEl.textContent = text;
    }

    function setSlide(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (el, idx) {
        var on = idx === index;
        el.classList.toggle("is-active", on);
        el.setAttribute("aria-hidden", on ? "false" : "true");
      });
      syncHeroTitle(index);
    }

    function clearTimer() {
      if (timerId != null) {
        window.clearInterval(timerId);
        timerId = null;
      }
    }

    function tick() {
      if (!effectivePaused()) setSlide(index + 1);
    }

    function startTimer() {
      clearTimer();
      if (reducedMotion) return;
      timerId = window.setInterval(tick, INTERVAL_MS);
    }

    if (visual) {
      visual.addEventListener("mouseenter", function () {
        hoverPaused = true;
      });
      visual.addEventListener("mouseleave", function () {
        hoverPaused = false;
      });
    }

    document.addEventListener("langchange", function () {
      syncHeroTitle(index);
    });

    mqReduceMotion().addEventListener("change", function () {
      readReducedMotion();
      setSlide(0);
      startTimer();
    });

    readReducedMotion();
    setSlide(0);
    startTimer();
  }

  function initBackToTop() {
    var btn = document.querySelector("[data-home-back-to-top]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function init() {
    document.querySelectorAll("[data-hero-root]").forEach(initHero);
    initBackToTop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
