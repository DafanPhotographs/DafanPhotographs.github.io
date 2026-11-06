(function () {
  function initHero(root) {
    var slides = root.querySelectorAll("[data-hero-slide]");
    var pills = root.querySelectorAll("[data-hero-pill]");
    var pauseBtn = root.querySelector("[data-hero-pause]");
    var visual = root.querySelector("[data-hero-visual]");
    if (!slides.length) return;

    var index = 0;
    var userPaused = false;
    var hoverPaused = false;
    var focusPaused = false;
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
      return userPaused || hoverPaused || focusPaused || document.visibilityState === "hidden" || reducedMotion;
    }

    function setSlide(i) {
      index = (i + slides.length) % slides.length;
      slides.forEach(function (el, idx) {
        el.classList.toggle("is-active", idx === index);
      });
      pills.forEach(function (el, idx) {
        var on = idx === index;
        el.setAttribute("aria-selected", on ? "true" : "false");
      });
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

    function refreshPauseUi() {
      if (!pauseBtn) return;
      var paused = userPaused;
      pauseBtn.setAttribute("aria-pressed", paused ? "true" : "false");
      var labelKey = paused ? "home.hero.play" : "home.hero.pause";
      var ariaKey = paused ? "home.hero.playAria" : "home.hero.pauseAria";
      if (window.DaFanI18n && window.DaFanI18n.dict) {
        var lang = window.DaFanI18n.getLang();
        var pack = window.DaFanI18n.dict[lang] || window.DaFanI18n.dict.zh;
        if (pack[labelKey]) pauseBtn.textContent = pack[labelKey];
        if (pack[ariaKey]) pauseBtn.setAttribute("aria-label", pack[ariaKey]);
      }
    }

    pills.forEach(function (pill) {
      pill.addEventListener("click", function () {
        var idx = parseInt(pill.getAttribute("data-hero-pill") || "0", 10);
        if (Number.isNaN(idx)) return;
        setSlide(idx);
        startTimer();
      });
    });

    if (pauseBtn) {
      pauseBtn.addEventListener("click", function () {
        userPaused = !userPaused;
        refreshPauseUi();
        startTimer();
      });
    }

    if (visual) {
      visual.addEventListener("mouseenter", function () {
        hoverPaused = true;
      });
      visual.addEventListener("mouseleave", function () {
        hoverPaused = false;
      });
    }

    var focusScopes = [];
    if (visual) focusScopes.push(visual);
    var pillBar = root.querySelector(".hero-pills");
    if (pillBar) focusScopes.push(pillBar);
    if (pauseBtn) focusScopes.push(pauseBtn);

    function containsActive(scope, active) {
      return !!(scope && active && scope.contains(active));
    }

    function updateFocusPaused() {
      var active = document.activeElement;
      focusPaused = focusScopes.some(function (scope) {
        return containsActive(scope, active);
      });
    }

    focusScopes.forEach(function (scope) {
      scope.addEventListener("focusin", updateFocusPaused);
      scope.addEventListener("focusout", function () {
        window.setTimeout(updateFocusPaused, 0);
      });
    });

    document.addEventListener("visibilitychange", function () {
      /* timer keeps running; effectivePaused blocks advance when hidden */
    });

    document.addEventListener("langchange", function () {
      refreshPauseUi();
    });

    mqReduceMotion().addEventListener("change", function () {
      readReducedMotion();
      setSlide(0);
      startTimer();
    });

    readReducedMotion();
    setSlide(0);
    refreshPauseUi();
    startTimer();
  }

  function init() {
    document.querySelectorAll("[data-hero-root]").forEach(initHero);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
