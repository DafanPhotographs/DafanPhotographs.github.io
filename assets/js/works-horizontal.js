(function () {
  "use strict";

  var host = document.querySelector("[data-works-horizontal]");
  if (!host || !window.DaFanMotionShared) return;

  var track = host.querySelector("[data-works-track]");
  var viewport = host.querySelector(".works-horizontal__viewport");
  var shared = window.DaFanMotionShared;

  function motionUnavailable() {
    return typeof gsap === "undefined" || typeof ScrollTrigger === "undefined";
  }

  function teardownClasses() {
    host.classList.remove("works-horizontal--active");
  }

  function releasePinWrapper() {
    var parent = host.parentElement;
    if (parent && parent.classList && parent.classList.contains("pin-spacer")) {
      parent.parentNode.insertBefore(host, parent);
      parent.remove();
    }
  }

  if (motionUnavailable()) {
    teardownClasses();
    return;
  }

  try {
    gsap.registerPlugin(ScrollTrigger);
  } catch (err) {
    teardownClasses();
    return;
  }

  function scrollDistance() {
    if (!track || !viewport) return 0;
    return Math.max(0, track.scrollWidth - viewport.clientWidth);
  }

  var mm = gsap.matchMedia();
  var unbindLayout = null;
  var horizontalTween = null;
  var horizontalST = null;

  function killHorizontal() {
    if (horizontalTween) {
      horizontalTween.kill();
      horizontalTween = null;
    }
    if (horizontalST) {
      horizontalST.kill();
      horizontalST = null;
    }
    if (track) gsap.set(track, { clearProps: "transform,x,width,minWidth,maxWidth" });
    gsap.set([host, viewport], { clearProps: "width,minWidth,maxWidth" });
    if (typeof ScrollTrigger !== "undefined") {
      ScrollTrigger.getAll().forEach(function (st) {
        if (st.vars && st.vars.id === "works-horizontal") st.kill();
      });
    }
    releasePinWrapper();
    shared.refreshScrollTriggers();
  }

  function buildHorizontalTween() {
    killHorizontal();
    if (!host.classList.contains("works-horizontal--active")) return;

    var distance = scrollDistance();
    if (distance <= 1) {
      shared.refreshScrollTriggers();
      return;
    }

    horizontalTween = gsap.to(track, {
      x: function () {
        return -scrollDistance();
      },
      ease: "none",
      scrollTrigger: {
        trigger: host,
        start: "top top",
        end: function () {
          return "+=" + scrollDistance();
        },
        pin: true,
        scrub: 0.85,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        id: "works-horizontal",
      },
    });
    horizontalST = horizontalTween.scrollTrigger;
    shared.refreshScrollTriggers();
  }

  var onFilterChange = function () {
    shared.whenLayoutReady(host, buildHorizontalTween);
  };

  var layoutMql = window.matchMedia(shared.MOTION_MQ);
  function onLayoutMqChange() {
    if (!layoutMql.matches) {
      killHorizontal();
      teardownClasses();
      releasePinWrapper();
    }
  }
  if (layoutMql.addEventListener) layoutMql.addEventListener("change", onLayoutMqChange);
  else if (layoutMql.addListener) layoutMql.addListener(onLayoutMqChange);

  window.addEventListener(
    "resize",
    shared.throttle(function () {
      if (!layoutMql.matches) onLayoutMqChange();
    }, 120),
    { passive: true }
  );

  mm.add(shared.MOTION_MQ, function () {
    host.classList.add("works-horizontal--active");
    document.addEventListener("works-filter-change", onFilterChange);

    unbindLayout = shared.bindLayoutObservers(host, function () {
      shared.whenLayoutReady(host, buildHorizontalTween);
    });

    shared.whenLayoutReady(host, buildHorizontalTween);

    return function () {
      document.removeEventListener("works-filter-change", onFilterChange);
      killHorizontal();
      if (unbindLayout) {
        unbindLayout();
        unbindLayout = null;
      }
      teardownClasses();
    };
  });
})();
