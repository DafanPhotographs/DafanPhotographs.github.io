(function () {
  function initBackToTop() {
    var btn = document.querySelector("[data-home-back-to-top]");
    if (!btn) return;
    btn.addEventListener("click", function () {
      if (window.__lenis) window.__lenis.scrollTo(0, { duration: 1.1 });
      else window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  function init() {
    initBackToTop();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
