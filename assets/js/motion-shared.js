(function () {
  "use strict";

  /** Desktop fine pointer + reduced-motion off (task card section C). */
  var MOTION_MQ =
    "(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

  function throttle(fn, wait) {
    var t = null;
    var trailing = null;
    return function () {
      var self = this;
      var args = arguments;
      if (t) {
        trailing = function () {
          trailing = null;
          fn.apply(self, args);
        };
        return;
      }
      fn.apply(self, args);
      t = setTimeout(function () {
        t = null;
        if (trailing) trailing();
      }, wait);
    };
  }

  function decodeImages(root) {
    var imgs = root ? root.querySelectorAll("img") : [];
    var tasks = [];
    imgs.forEach(function (img) {
      if (img.complete && img.naturalWidth) return;
      tasks.push(
        typeof img.decode === "function"
          ? img.decode().catch(function () {})
          : new Promise(function (resolve) {
              if (img.complete) resolve();
              else img.addEventListener("load", resolve, { once: true });
            })
      );
    });
    return Promise.all(tasks);
  }

  function whenLayoutReady(root, cb) {
    var fonts =
      document.fonts && document.fonts.ready
        ? document.fonts.ready
        : Promise.resolve();
    return Promise.all([decodeImages(root), fonts]).then(function () {
      cb();
    });
  }

  function refreshScrollTriggers() {
    if (typeof gsap === "undefined" || !window.ScrollTrigger) return;
    ScrollTrigger.refresh();
  }

  function bindLayoutObservers(root, onLayout) {
    var throttled = throttle(onLayout, 200);
    var ro = null;
    if (typeof ResizeObserver !== "undefined" && root) {
      ro = new ResizeObserver(throttled);
      ro.observe(root);
    }
    window.addEventListener("resize", throttled, { passive: true });
    document.addEventListener("langchange", throttled);
    return function () {
      if (ro) ro.disconnect();
      window.removeEventListener("resize", throttled);
      document.removeEventListener("langchange", throttled);
    };
  }

  window.DaFanMotionShared = {
    MOTION_MQ: MOTION_MQ,
    whenLayoutReady: whenLayoutReady,
    refreshScrollTriggers: refreshScrollTriggers,
    bindLayoutObservers: bindLayoutObservers,
    throttle: throttle,
  };
})();
