(function () {
  "use strict";

  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var mobileMql = window.matchMedia("(max-width: 767.98px)");
  var archive = document.querySelector("[data-photography-archive]");
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

  // Phones skip the scroll-linked entrance entirely: every photo is shown at
  // full opacity and native scrolling is used.
  function isStatic() {
    return reduce || mobileMql.matches;
  }

  // The oversized word is split into spans so each letter can rise into
  // place. Keep the full word on the h1 for screen readers and no-JS.
  function initWordIntro() {
    var word = document.querySelector(".photography-hero__word");
    if (!word || reduce || typeof gsap === "undefined") return;
    var label = word.textContent.trim();
    if (!label) return;
    word.setAttribute("aria-label", label);
    word.textContent = "";
    var chars = [];
    label.split("").forEach(function (ch) {
      var span = document.createElement("span");
      span.className = "word-char";
      span.setAttribute("aria-hidden", "true");
      span.textContent = ch;
      word.appendChild(span);
      chars.push(span);
    });
    word.classList.add("is-split");
    gsap.fromTo(
      chars,
      { yPercent: 70, opacity: 0 },
      {
        yPercent: 0,
        opacity: 1,
        duration: 0.85,
        ease: "power3.out",
        stagger: 0.055,
        delay: 0.08,
        clearProps: "transform"
      }
    );
  }

  function lenisTick(time) {
    if (lenis) lenis.raf(time * 1000);
  }

  function initMotion() {
    if (lenis) {
      if (typeof gsap !== "undefined") gsap.ticker.remove(lenisTick);
      lenis.destroy();
      lenis = null;
      delete window.__lenis;
    }
    if (isStatic()) return;
    if (window.Lenis) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      window.__lenis = lenis;
      if (typeof gsap !== "undefined") {
        gsap.ticker.add(lenisTick);
        gsap.ticker.lagSmoothing(0);
      } else {
        (function raf(time) {
          lenis.raf(time);
          requestAnimationFrame(raf);
        })(0);
      }
      lenis.on("scroll", queuePaint);
    }
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
    if (isStatic()) return;
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
    if (isStatic()) {
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

  var galleryItems = [];
  var pswp = null;

  function buildGalleryItems() {
    galleryItems = data.photos.map(function (photo) {
      var ratio = 3 / 2;
      if (photo.width && photo.height) ratio = photo.width / photo.height;
      ratio = Math.min(2.6, Math.max(0.75, ratio));
      return {
        src: imageUrl(photo.publicId, "c_limit,w_2400,q_auto,f_auto"),
        msrc: imageUrl(photo.publicId, "c_limit,w_400,q_auto,f_auto"),
        width: photo.width || 2400,
        height: photo.height || Math.round(2400 / ratio),
        alt: text(photo.alt) || text(photo.title),
        photo: photo
      };
    });
  }

  function captionMarkup() {
    return '<div class="pswp-photo-caption">' +
      '<span class="pswp-photo-caption__location" data-caption-location></span>' +
      '<h2 class="pswp-photo-caption__title" data-caption-title></h2>' +
      '<p class="pswp-photo-caption__copy" data-caption-copy></p>' +
      '</div>';
  }

  function updateCaptionFor(el, instance) {
    if (!el || !data) return;
    var item = galleryItems[instance.currIndex];
    if (!item) return;
    var photo = item.photo;
    var box = el.querySelector(".pswp-photo-caption");
    if (!box) return;
    var location = data.locations && data.locations[photo.location] ? text(data.locations[photo.location]) : "";
    var locEl = box.querySelector("[data-caption-location]");
    locEl.textContent = location;
    locEl.hidden = !location;
    box.querySelector("[data-caption-title]").textContent = text(photo.title);
    box.querySelector("[data-caption-copy]").textContent = text(photo.copy);
  }

  function syncHash(instance) {
    if (instance !== pswp) return;
    var item = galleryItems[instance.currIndex];
    if (!item) return;
    activeId = item.photo.id;
    history.replaceState(null, "", "#" + activeId);
  }

  function openPhoto(id, updateHash) {
    if (!data) return;
    var PS = window.PhotoSwipe && (window.PhotoSwipe.default || window.PhotoSwipe);
    if (!PS) return;
    buildGalleryItems();
    var index = -1;
    for (var i = 0; i < galleryItems.length; i += 1) {
      if (galleryItems[i].photo.id === id) { index = i; break; }
    }
    if (index < 0) return;
    activeId = id;
    if (lenis) lenis.stop();
    document.body.classList.add("lightbox-open");
    var instance = new PS({
      dataSource: galleryItems,
      index: index,
      pswpModule: PS,
      showHideAnimationType: "fade",
      bgOpacity: 0.94,
      paddingFn: function (viewportSize) {
        var narrow = viewportSize.x < 768;
        return {
          top: narrow ? 46 : 58,
          bottom: narrow ? 132 : 156,
          left: narrow ? 8 : 18,
          right: narrow ? 8 : 18
        };
      },
      loop: true,
      counter: false,
      close: true,
      arrowKeys: true,
      returnFocus: true,
      trapFocus: true
    });
    pswp = instance;
    instance.on("uiRegister", function () {
      instance.ui.registerElement({
        name: "photo-caption",
        className: "pswp-photo-caption-host",
        appendTo: "root",
        order: 9,
        isButton: false,
        html: captionMarkup(),
        onInit: function (el, pswpInstance) {
          updateCaptionFor(el, pswpInstance);
          pswpInstance.on("change", function () { updateCaptionFor(el, pswpInstance); });
        }
      });
    });
    instance.on("change", function () { syncHash(instance); });
    instance.on("close", function () {
      if (instance !== pswp) return;
      pswp = null;
      activeId = null;
      document.body.classList.remove("lightbox-open");
      if (lenis) lenis.start();
      history.replaceState(null, "", location.pathname + location.search);
      if (lastTrigger) {
        lastTrigger.focus();
        lastTrigger = null;
      }
    });
    instance.init();
    if (updateHash !== false) history.replaceState(null, "", "#" + id);
  }

  function applyLang() {
    lang = document.documentElement.lang || "zh";
    if (!data) return;
    renderArchive();
    if (pswp) {
      var caption = pswp.element.querySelector(".pswp-photo-caption-host");
      if (caption) updateCaptionFor(caption, pswp);
    }
  }

  function boot() {
    initWordIntro();
    initMotion();
    window.addEventListener("scroll", queuePaint, { passive: true });
    window.addEventListener("resize", function () {
      measureItems();
      paint();
    });
    mobileMql.addEventListener("change", function () {
      initMotion();
      refreshMotion();
    });
    fetch(new URL("../data/photos.json", location.href), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (payload) {
        data = payload;
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
