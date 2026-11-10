(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;

  var archive = document.querySelector("[data-photography-archive]");
  if (!archive) return;

  gsap.registerPlugin(ScrollTrigger);

  document.documentElement.classList.add("photo-motion");

  if (window.Lenis) {
    var lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
    window.__lenis = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  var items = gsap.utils.toArray(".archive-item");
  items.forEach(function (item) {
    gsap.fromTo(
      item,
      { y: 150, opacity: 0.1 },
      {
        y: 0,
        opacity: 1,
        ease: "power2.out",
        immediateRender: true,
        scrollTrigger: {
          trigger: item,
          start: "top 95%",
          end: "top 30%",
          scrub: 0.6,
          invalidateOnRefresh: true
        }
      }
    );
  });

  window.addEventListener("load", function () {
    ScrollTrigger.refresh();
  });
  document.addEventListener("langchange", function () {
    ScrollTrigger.refresh();
  });
})();
