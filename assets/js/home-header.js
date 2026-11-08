(function () {
  "use strict";

  if (!document.body.classList.contains("page-home")) return;

  var header = document.querySelector(".site-header");
  var photoEnd = document.querySelector("[data-home-photo-zone-end]");
  var heroCopyPin = document.querySelector("[data-hero-copy-pin]");
  if (!header || !photoEnd) return;

  function setSolid(solid) {
    header.classList.toggle("site-header--solid", solid);
    header.classList.toggle("site-header--overlay", !solid);
    header.setAttribute("data-header-mode", solid ? "solid" : "overlay");
  }

  /** Solid when the header band no longer sits over the photo rail (marker top at or above header bottom). */
  function headerLeavesPhotoZone() {
    var headerH = header.getBoundingClientRect().height;
    var endTop = photoEnd.getBoundingClientRect().top;
    return endTop <= headerH + 0.5;
  }

  function syncHeaderMode() {
    var pastPhoto = headerLeavesPhotoZone();
    setSolid(pastPhoto);
    if (heroCopyPin) {
      heroCopyPin.classList.toggle("hero-copy-pin--past", pastPhoto);
    }
  }

  if (typeof IntersectionObserver === "undefined") {
    syncHeaderMode();
    window.addEventListener("scroll", syncHeaderMode, { passive: true });
    window.addEventListener("resize", syncHeaderMode, { passive: true });
    return;
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      ticking = false;
      syncHeaderMode();
    });
  }

  var io = new IntersectionObserver(
    function () {
      syncHeaderMode();
    },
    { root: null, rootMargin: "0px", threshold: [0, 0.01, 0.25, 0.5, 1] }
  );

  io.observe(photoEnd);
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  document.addEventListener("langchange", syncHeaderMode);
  syncHeaderMode();
})();
