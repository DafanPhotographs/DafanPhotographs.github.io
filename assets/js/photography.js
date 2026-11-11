(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var archive = document.querySelector("[data-photography-archive]");
  var filterBar = document.querySelector("[data-photo-filters]");
  var lightbox = document.querySelector("[data-photo-lightbox]");
  if (!archive) return;

  var data = null;
  var lang = document.documentElement.lang || "zh";
  var current = [];
  var itemStates = [];
  var paintQueued = false;
  var lenis = null;
  var activeId = null;
  var lastTrigger = null;

  function text(value) {
    if (!value) return "";
    return value[lang] || value.zh || value.en || "";
  }

  function imageUrl(publicId, transform) {
    return (
      "https://res.cloudinary.com/" + data.cloudName + "/image/upload/" +
      transform + "/" + publicId + ".jpg"
    );
  }

  function photoById(id) {
    return data.photos.filter(function (photo) { return photo.id === id; })[0] || null;
  }

  function visiblePhotos() {
    return data.photos.filter(function (photo) {
      var item = archive.querySelector('[data-id="' + photo.id + '"]');
      return item && !item.classList.contains("is-hidden");
    });
  }

  function clamp01(value) {
    return value < 0 ? 0 : value > 1 ? 1 : value;
  }

  function initMotion() {
    if (reduce) return;
    if (window.Lenis) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      window.__lenis = lenis;
      if (typeof gsap !== "undefined") {
        gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
        gsap.ticker.lagSmoothing(0);
      } else {
        (function raf(time) {
          lenis.raf(time);
          requestAnimationFrame(raf);
        })(0);
      }
      lenis.on("scroll", queuePaint);
    }
    window.addEventListener("scroll", queuePaint, { passive: true });
    window.addEventListener("resize", function () {
      measureItems();
      paint();
    });
  }

  // Measure once with transforms off, then map every photo's viewport
  // position to progress by hand. This keeps the effect aligned even when the
  // masonry columns reflow (ScrollTrigger could cache stale positions).
  function measureItems() {
    itemStates = [];
    archive.querySelectorAll(".archive-item").forEach(function (el) {
      if (el.classList.contains("is-hidden")) return;
      var previous = el.style.transform;
      el.style.transform = "none";
      var rect = el.getBoundingClientRect();
      el.style.transform = previous;
      itemStates.push({
        el: el,
        media: el.querySelector(".archive-media"),
        docTop: rect.top + (window.scrollY || 0),
        height: rect.height
      });
    });
  }

  function paint() {
    if (reduce) return;
    var scroll = window.scrollY || 0;
    itemStates.forEach(function (state) {
      var top = state.docTop - scroll;
      // Reference: 0 at 450px below the viewport, fully arrived near the top.
      var progress = clamp01((1350 - top) / 1250);
      state.el.style.opacity = progress.toFixed(4);
      state.el.style.transform =
        "perspective(1200px) translate3d(0," + (400 * (1 - progress)).toFixed(2) + "px,0)";
      if (state.media) {
        // Inner image drifts the opposite way while the card crosses the
        // viewport, like the reference's 2:3 image inside a 4:5 mask.
        var parallax = clamp01((900 - top) / (900 + state.height));
        state.media.style.transform =
          "translate3d(0," + (-12 + 24 * parallax).toFixed(2) + "%,0)";
      }
    });
  }

  function queuePaint() {
    if (paintQueued) return;
    paintQueued = true;
    requestAnimationFrame(function () {
      paintQueued = false;
      paint();
    });
  }

  function refreshMotion() {
    if (reduce) {
      archive.querySelectorAll(".archive-item").forEach(function (el) {
        el.style.opacity = "1";
        el.style.transform = "none";
        var media = el.querySelector(".archive-media");
        if (media) media.style.transform = "none";
      });
      return;
    }
    measureItems();
    paint();
  }

  function renderFilters() {
    if (!filterBar) return;
    var currentFilter = filterBar.querySelector(".is-active");
    var active = currentFilter ? currentFilter.getAttribute("data-location") : "";
    filterBar.innerHTML = "";
    var all = document.createElement("button");
    all.type = "button";
    all.className = "filter-btn";
    all.setAttribute("data-location", "");
    all.textContent = lang === "en" ? "All" : "全部";
    filterBar.appendChild(all);
    Object.keys(data.locations || {}).forEach(function (key) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "filter-btn";
      button.setAttribute("data-location", key);
      button.textContent = text(data.locations[key]);
      filterBar.appendChild(button);
    });
    var chosen = filterBar.querySelector('[data-location="' + active + '"]') || all;
    chosen.classList.add("is-active");
    filterBar.querySelectorAll("button").forEach(function (button) {
      button.setAttribute("aria-pressed", button === chosen ? "true" : "false");
      button.addEventListener("click", function () {
        setFilter(button.getAttribute("data-location"), button);
      });
    });
  }

  function setFilter(location, button) {
    filterBar.querySelectorAll("button").forEach(function (item) {
      var on = item === button;
      item.classList.toggle("is-active", on);
      item.setAttribute("aria-pressed", on ? "true" : "false");
    });
    archive.querySelectorAll(".archive-item").forEach(function (item) {
      var hide = !!location && item.getAttribute("data-location") !== location;
      item.classList.toggle("is-hidden", hide);
      item.setAttribute("aria-hidden", hide ? "true" : "false");
      item.tabIndex = hide ? -1 : 0;
    });
    current = visiblePhotos();
    refreshMotion();
  }

  function renderArchive() {
    archive.innerHTML = "";
    var columns = [0, 1, 2].map(function () {
      var column = document.createElement("div");
      column.className = "photo-col";
      archive.appendChild(column);
      return column;
    });
    // Keep each photo's own landscape/portrait ratio instead of forcing a
    // uniform crop, and place it in whichever column is currently shortest
    // so mixed 4:3 / 16:9 sets still read as a balanced masonry.
    var columnHeights = [0, 0, 0];
    data.photos.forEach(function (photo, index) {
      var ratio = 3 / 2;
      if (photo.width && photo.height) ratio = photo.width / photo.height;
      ratio = Math.min(2.6, Math.max(0.75, ratio));
      var button = document.createElement("button");
      button.type = "button";
      button.className = "archive-item";
      button.style.aspectRatio = String(ratio);
      button.setAttribute("data-id", photo.id);
      button.setAttribute("data-location", photo.location || "");
      button.setAttribute("aria-label", text(photo.title));
      var img = document.createElement("img");
      img.src = imageUrl(photo.publicId, "c_limit,w_1200,q_auto,f_auto");
      img.alt = "";
      img.width = 1200;
      img.height = Math.round(1200 / ratio);
      img.loading = index < 3 ? "eager" : "lazy";
      img.decoding = "async";
      var media = document.createElement("span");
      media.className = "archive-media";
      media.appendChild(img);
      button.appendChild(media);
      button.addEventListener("click", function () {
        lastTrigger = button;
        openPhoto(photo.id);
      });
      var target = 0;
      for (var i = 1; i < 3; i += 1) {
        if (columnHeights[i] < columnHeights[target]) target = i;
      }
      columns[target].appendChild(button);
      columnHeights[target] += 1 / ratio + 0.03;
    });
    current = visiblePhotos();
    refreshMotion();
  }

  function renderCaption(photo) {
    var title = text(photo.title);
    var copy = text(photo.copy);
    var location = data.locations && data.locations[photo.location] ? text(data.locations[photo.location]) : "";
    lightbox.querySelector("[data-lightbox-title]").textContent = title;
    lightbox.querySelector("[data-lightbox-copy]").textContent = copy;
    lightbox.querySelector("[data-lightbox-location]").textContent = location;
    var img = lightbox.querySelector("[data-lightbox-img]");
    img.src = imageUrl(photo.publicId, "c_limit,w_2400,q_auto,f_auto");
    img.alt = text(photo.alt) || title;
  }

  function openPhoto(id, updateHash) {
    if (!lightbox) return;
    var photo = photoById(id);
    if (!photo) return;
    activeId = id;
    current = visiblePhotos();
    renderCaption(photo);
    lightbox.hidden = false;
    document.body.classList.add("lightbox-open");
    if (lenis) lenis.stop();
    lightbox.querySelector("[data-lightbox-close]").focus();
    if (updateHash !== false) {
      history.replaceState(null, "", "#" + id);
    }
  }

  function closeLightbox() {
    if (!lightbox || lightbox.hidden) return;
    lightbox.hidden = true;
    document.body.classList.remove("lightbox-open");
    if (lenis) lenis.start();
    activeId = null;
    history.replaceState(null, "", location.pathname + location.search);
    if (lastTrigger) lastTrigger.focus();
  }

  function step(delta) {
    if (!activeId) return;
    current = visiblePhotos();
    var index = current.map(function (photo) { return photo.id; }).indexOf(activeId);
    if (index < 0) return;
    var next = current[(index + delta + current.length) % current.length];
    if (next) openPhoto(next.id);
  }

  function bindLightbox() {
    if (!lightbox) return;
    lightbox.querySelector("[data-lightbox-close]").addEventListener("click", closeLightbox);
    lightbox.querySelector("[data-lightbox-prev]").addEventListener("click", function () { step(-1); });
    lightbox.querySelector("[data-lightbox-next]").addEventListener("click", function () { step(1); });
    lightbox.addEventListener("click", function (event) {
      if (event.target === lightbox) closeLightbox();
    });
    document.addEventListener("keydown", function (event) {
      if (lightbox.hidden) return;
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    });
  }

  function applyLang() {
    lang = document.documentElement.lang || "zh";
    if (!data) return;
    renderFilters();
    renderArchive();
    if (activeId && lightbox && !lightbox.hidden) {
      var photo = photoById(activeId);
      if (photo) renderCaption(photo);
    }
  }

  function boot() {
    initMotion();
    bindLightbox();
    fetch(new URL("../data/photos.json", location.href), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (payload) {
        data = payload;
        renderFilters();
        renderArchive();
        requestAnimationFrame(refreshMotion);
        window.addEventListener("load", refreshMotion);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(refreshMotion);
        var hash = location.hash.replace("#", "");
        if (hash && photoById(hash)) openPhoto(hash, false);
      })
      .catch(function (error) {
        archive.innerHTML = '<p class="photo-error">照片读取失败：' + coreEscape(error.message) + "</p>";
      });
    document.addEventListener("langchange", applyLang);
  }

  function coreEscape(value) {
    return String(value).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  boot();
})();
