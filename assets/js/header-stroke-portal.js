/**
 * Home overlay header: dual stroke painted via body-level portals (normal compositing),
 * outside the difference-composited .site-header. Decorative only — no focus or pointer hit targets.
 */
(function () {
  "use strict";

  var ROOT_ID = "header-stroke-portals";
  var LIGHT_ID = "header-stroke-portal-light";
  var DARK_ID = "header-stroke-portal-dark";

  if (!document.body.classList.contains("page-home")) return;
  if (document.documentElement.classList.contains("no-js")) return;

  var header = document.querySelector(".site-header");
  if (!header) return;

  var root = null;
  var lightPortal = null;
  var darkPortal = null;
  var observed = [];
  var headerObserver = null;
  var rafPending = false;
  var active = false;

  function readStrokeTokens() {
    var s = getComputedStyle(document.documentElement);
    return {
      light: s.getPropertyValue("--header-stroke-light").trim() || "#ffffff",
      dark: s.getPropertyValue("--header-stroke-dark").trim() || "#1a120e",
      wLight: s.getPropertyValue("--header-stroke-width-light").trim() || "0.45px",
      wDark: s.getPropertyValue("--header-stroke-width-dark").trim() || "0.35px",
      wSvgMul: parseFloat(s.getPropertyValue("--header-stroke-svg-scale").trim()) || 1.25,
    };
  }

  function isVisible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.01;
  }

  function overlayActive() {
    return header.classList.contains("site-header--overlay");
  }

  function ensurePortals() {
    if (root) return;
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.setAttribute("aria-hidden", "true");
    root.className = "header-stroke-portals";

    lightPortal = document.createElement("div");
    lightPortal.id = LIGHT_ID;
    lightPortal.className = "header-stroke-portal header-stroke-portal--light";
    lightPortal.setAttribute("aria-hidden", "true");

    darkPortal = document.createElement("div");
    darkPortal.id = DARK_ID;
    darkPortal.className = "header-stroke-portal header-stroke-portal--dark";
    darkPortal.setAttribute("aria-hidden", "true");

    root.appendChild(lightPortal);
    root.appendChild(darkPortal);
    document.body.appendChild(root);
  }

  function clearPortals() {
    if (lightPortal) lightPortal.replaceChildren();
    if (darkPortal) darkPortal.replaceChildren();
  }

  function hidePortals() {
    if (root) root.hidden = true;
    clearPortals();
    active = false;
  }

  function showPortals() {
    if (root) root.hidden = false;
    active = true;
  }

  function textGhost(label, r, cs, stroke, width) {
    var ghost = document.createElement("span");
    ghost.className = "header-stroke-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.textContent = label;
    ghost.style.cssText = [
      "position:fixed",
      "left:" + r.left + "px",
      "top:" + r.top + "px",
      "width:" + r.width + "px",
      "height:" + r.height + "px",
      "font:" + cs.font,
      "font-size:" + cs.fontSize,
      "font-weight:" + cs.fontWeight,
      "font-family:" + cs.fontFamily,
      "letter-spacing:" + cs.letterSpacing,
      "line-height:" + cs.lineHeight,
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "color:transparent",
      "-webkit-text-stroke:" + width + " " + stroke,
      "text-shadow:none",
      "background:transparent",
      "mix-blend-mode:normal",
      "pointer-events:none",
      "white-space:nowrap",
    ].join(";");
    return ghost;
  }

  function svgGhost(src, stroke, width, svgMul) {
    var r = src.getBoundingClientRect();
    var wrap = document.createElement("div");
    wrap.className = "header-stroke-ghost header-stroke-ghost--svg";
    wrap.setAttribute("aria-hidden", "true");
    wrap.style.cssText =
      "position:fixed;left:" +
      r.left +
      "px;top:" +
      r.top +
      "px;width:" +
      r.width +
      "px;height:" +
      r.height +
      "px;pointer-events:none;mix-blend-mode:normal;";
    var svg = src.cloneNode(true);
    svg.removeAttribute("id");
    svg.style.fill = "transparent";
    svg.style.stroke = stroke;
    svg.style.strokeWidth = String(parseFloat(width) * svgMul);
    svg.style.width = "100%";
    svg.style.height = "100%";
    wrap.appendChild(svg);
    return wrap;
  }

  function collectTargets() {
    var scope = header.querySelector(".header-chrome");
    if (!scope) return [];
    var nodes = scope.querySelectorAll(".nav-link-label, .lang-switch__btn, .lang-switch__sep");
    var out = [];
    nodes.forEach(function (el) {
      if (isVisible(el)) out.push(el);
    });
    var mark = scope.querySelector(".wordmark__mark");
    if (mark && isVisible(mark)) out.push(mark);
    return out;
  }

  function labelFor(el) {
    if (el.classList.contains("lang-switch__btn")) {
      var lb = el.querySelector(".lang-switch__label");
      return (lb && lb.textContent.trim()) || el.textContent.trim();
    }
    if (el.classList.contains("nav-link-label") || el.classList.contains("lang-switch__sep")) {
      return el.textContent.trim();
    }
    return "";
  }

  function stamp(portal, stroke, width, tokens) {
    var targets = collectTargets();
    for (var i = 0; i < targets.length; i++) {
      var el = targets[i];
      if (el.classList.contains("wordmark__mark")) {
        portal.appendChild(svgGhost(el, stroke, width, tokens.wSvgMul));
        continue;
      }
      var r = el.getBoundingClientRect();
      var cs = getComputedStyle(el);
      var label = labelFor(el);
      if (!label) continue;
      if (el.classList.contains("lang-switch__btn")) {
        var inner = el.querySelector(".lang-switch__label");
        if (inner) {
          r = inner.getBoundingClientRect();
          cs = getComputedStyle(inner);
        }
      }
      portal.appendChild(textGhost(label, r, cs, stroke, width));
    }
  }

  function sync() {
    if (!overlayActive()) {
      hidePortals();
      return;
    }
    ensurePortals();
    showPortals();
    clearPortals();
    var tokens = readStrokeTokens();
    stamp(lightPortal, tokens.light, tokens.wLight, tokens);
    stamp(darkPortal, tokens.dark, tokens.wDark, tokens);
  }

  function requestSync() {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(function () {
      rafPending = false;
      sync();
    });
  }

  function observeHeader() {
    headerObserver = new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i++) {
        if (mutations[i].type === "attributes" && mutations[i].attributeName === "class") {
          requestSync();
          return;
        }
      }
      requestSync();
    });
    headerObserver.observe(header, { attributes: true, attributeFilter: ["class"] });
    var chrome = header.querySelector(".header-chrome");
    if (chrome) {
      headerObserver.observe(chrome, { childList: true, subtree: true, characterData: true });
    }
  }

  function observeTargets() {
    var ro = new ResizeObserver(requestSync);
    ro.observe(header);
    var chrome = header.querySelector(".header-chrome");
    if (chrome) ro.observe(chrome);
    collectTargets().forEach(function (el) {
      ro.observe(el);
    });
    observed.push(ro);
  }

  function teardown() {
    observed.forEach(function (ro) {
      ro.disconnect();
    });
    observed = [];
    if (headerObserver) headerObserver.disconnect();
    headerObserver = null;
    if (root && root.parentNode) root.parentNode.removeChild(root);
    root = lightPortal = darkPortal = null;
    active = false;
  }

  window.addEventListener("resize", requestSync, { passive: true });
  window.addEventListener("scroll", requestSync, { passive: true });
  window.addEventListener("pageshow", requestSync);
  document.addEventListener("langchange", requestSync);
  window.addEventListener("pagehide", teardown);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(requestSync).catch(function () {});
  }

  observeHeader();
  observeTargets();
  requestSync();
})();
