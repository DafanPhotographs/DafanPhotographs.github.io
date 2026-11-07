(function () {
  "use strict";

  var shared = window.DaFanMotionShared;
  var section = document.querySelector("[data-home-featured]");
  if (!section || !shared) return;

  var grid = section.querySelector(".featured-grid");
  if (!grid) return;

  function motionUnavailable() {
    return typeof gsap === "undefined" || typeof ScrollTrigger === "undefined";
  }

  function teardownClasses() {
    section.classList.remove("home-featured--pin");
    grid.classList.remove("featured-grid--pin");
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

  var mm = gsap.matchMedia();
  var unbindLayout = null;
  var panelTriggers = [];

  function clearPanelTriggers() {
    panelTriggers.forEach(function (st) {
      if (st && st.kill) st.kill();
    });
    panelTriggers = [];
  }

  mm.add(shared.MOTION_MQ, function () {
    section.classList.add("home-featured--pin");
    grid.classList.add("featured-grid--pin");

    var panels = gsap.utils.toArray(grid.querySelectorAll(".featured-panel"));
    panels.forEach(function (panel, index) {
      var media = panel.querySelector(".featured-panel-media img");
      panelTriggers.push(
        ScrollTrigger.create({
          trigger: panel,
          start: "top top",
          end: "+=100%",
          pin: true,
          pinSpacing: true,
          scrub: 0.85,
          anticipatePin: 1,
          invalidateOnRefresh: true,
          id: "home-panel-" + index,
        })
      );

      if (media) {
        var imgTween = gsap.fromTo(
          media,
          { scale: 1.06 },
          {
            scale: 1,
            ease: "none",
            scrollTrigger: {
              trigger: panel,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
            },
          }
        );
        if (imgTween.scrollTrigger) panelTriggers.push(imgTween.scrollTrigger);
      }
    });

    unbindLayout = shared.bindLayoutObservers(section, function () {
      shared.whenLayoutReady(section, shared.refreshScrollTriggers);
    });

    shared.whenLayoutReady(section, shared.refreshScrollTriggers);

    return function () {
      clearPanelTriggers();
      if (unbindLayout) {
        unbindLayout();
        unbindLayout = null;
      }
      teardownClasses();
    };
  });
})();
