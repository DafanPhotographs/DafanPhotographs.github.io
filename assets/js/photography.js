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
  var triggers = [];
  var lenis = null;
  var activeId = null;
  var lastTrigger = null;

  var AR = [
    { cls: "ar-45", ar: "4:5", h: 1500 },
    { cls: "ar-11", ar: "1:1", h: 1200 },
    { cls: "ar-32", ar: "3:2", h: 800 },
    { cls: "ar-34", ar: "3:4", h: 1600 }
  ];

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

  function initMotion() {
    if (reduce || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
    gsap.registerPlugin(ScrollTrigger);
    if (window.Lenis) {
      lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
      window.__lenis = lenis;
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
      gsap.ticker.lagSmoothing(0);
    }
  }

  function killTriggers() {
    triggers.forEach(function (trigger) {
      if (trigger && trigger.kill) trigger.kill();
    });
    triggers = [];
    archive.querySelectorAll(".archive-item").forEach(function (item) {
      gsap.set(item, { clearProps: "transform,opacity" });
    });
  }

  function applyAppearance() {
    if (reduce || typeof gsap === "undefined" || typeof ScrollTrigger === "undefined") return;
    killTriggers();
    archive.querySelectorAll(".archive-item").forEach(function (item) {
      if (item.classList.contains("is-hidden")) return;
      var tween = gsap.fromTo(
        item,
        {
          y: function (index, target) {
            return Math.min(320, Math.max(80, target.offsetHeight * 0.55));
          },
          opacity: 0.1
        },
        {
          y: 0,
          opacity: 1,
          ease: "power2.out",
          immediateRender: true,
          scrollTrigger: {
            trigger: item,
            start: "top 95%",
            end: "top 25%",
            scrub: 0.6,
            invalidateOnRefresh: true
          }
        }
      );
      if (tween.scrollTrigger) triggers.push(tween.scrollTrigger);
    });
    ScrollTrigger.refresh();
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
    applyAppearance();
  }

  function renderArchive() {
    archive.innerHTML = "";
    data.photos.forEach(function (photo, index) {
      var spec = AR[index % AR.length];
      var button = document.createElement("button");
      button.type = "button";
      button.className = "archive-item " + spec.cls;
      button.setAttribute("data-id", photo.id);
      button.setAttribute("data-location", photo.location || "");
      button.setAttribute("aria-label", text(photo.title));
      var img = document.createElement("img");
      img.src = imageUrl(photo.publicId, "c_fill,g_auto,ar_" + spec.ar + ",w_1200,f_auto,q_auto");
      img.alt = "";
      img.width = 1200;
      img.height = spec.h;
      img.loading = index < 3 ? "eager" : "lazy";
      img.decoding = "async";
      button.appendChild(img);
      button.addEventListener("click", function () {
        lastTrigger = button;
        openPhoto(photo.id);
      });
      archive.appendChild(button);
    });
    current = visiblePhotos();
    applyAppearance();
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
