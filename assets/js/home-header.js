(function () {
  "use strict";

  if (!document.body.classList.contains("page-home")) return;

  var header = document.querySelector(".site-header");
  var sentinel = document.querySelector("[data-home-photo-zone-end]");
  if (!header || !sentinel) return;

  function setSolid(solid) {
    header.classList.toggle("site-header--solid", solid);
    header.classList.toggle("site-header--overlay", !solid);
  }

  if (typeof IntersectionObserver === "undefined") {
    setSolid(true);
    return;
  }

  var io = new IntersectionObserver(
    function (entries) {
      var entry = entries[0];
      if (!entry) return;
      setSolid(entry.isIntersecting);
    },
    { root: null, rootMargin: "0px 0px -30% 0px", threshold: 0 }
  );

  io.observe(sentinel);
  setSolid(false);
})();
