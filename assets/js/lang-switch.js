(function () {
  "use strict";

  function initLangSwitch(root) {
    var buttons = root.querySelectorAll(".lang-switch__btn");
    if (!buttons.length) return;

    root.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      var list = Array.prototype.slice.call(buttons);
      var idx = list.indexOf(document.activeElement);
      if (idx < 0) return;
      e.preventDefault();
      var next =
        e.key === "ArrowRight"
          ? list[(idx + 1) % list.length]
          : list[(idx - 1 + list.length) % list.length];
      next.focus();
      next.click();
    });
  }

  function initGlobal() {
    document.querySelectorAll("[data-lang-switch]").forEach(initLangSwitch);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGlobal);
  } else {
    initGlobal();
  }
})();
