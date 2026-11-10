(function () {
  "use strict";

  var grid = document.querySelector("[data-home-scenes]");
  if (!grid) return;

  var lang = document.documentElement.lang || "zh";
  var photosData = null;

  function text(value) {
    if (!value) return "";
    return value[lang] || value.zh || value.en || "";
  }

  function limitUrl(publicId) {
    return (
      "https://res.cloudinary.com/" + photosData.cloudName +
      "/image/upload/c_limit,w_2400,q_auto,f_auto/" + publicId + ".jpg"
    );
  }

  function fillUrl(publicId) {
    return (
      "https://res.cloudinary.com/" + photosData.cloudName +
      "/image/upload/c_fill,g_auto,w_2400,h_1600,f_auto,q_auto/" + publicId + ".jpg"
    );
  }

  function sceneMarkup(photo, index) {
    var title = text(photo.title);
    var loading = index === 0 ? 'fetchpriority="high"' : 'loading="lazy"';
    return (
      '<a class="featured-panel home-scene" id="home-scene-' + photo.id + '" data-home-scene="' + index + '" data-photo-id="' + photo.id + '" href="./photography/#' + photo.id + '" aria-label="' + escapeAttr(title) + '">' +
        '<div class="home-scene-stage">' +
          '<div class="home-scene-media">' +
            '<div class="home-scene-media-scale">' +
              '<picture class="home-scene-picture" data-desktop-limit-srcset="' + escapeAttr(limitUrl(photo.publicId)) + '">' +
                '<source media="(min-width: 1024px)" srcset="' + escapeAttr(limitUrl(photo.publicId)) + '" />' +
                '<img src="' + escapeAttr(fillUrl(photo.publicId)) + '" data-cloud-fallback-fill="' + escapeAttr(fillUrl(photo.publicId)) + '" alt="" width="2400" height="1600" ' + loading + ' decoding="async" />' +
              '</picture>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="home-scene-chrome">' +
          '<div class="home-scene-title-blend">' +
            '<p class="home-scene-title" data-title-zh="' + escapeAttr(photo.title.zh || "") + '" data-title-en="' + escapeAttr(photo.title.en || photo.title.zh || "") + '">' + escapeHtml(title) + '</p>' +
          '</div>' +
        '</div>' +
      '</a>'
    );
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function refreshTitles() {
    grid.querySelectorAll(".home-scene").forEach(function (scene) {
      var title = scene.querySelector(".home-scene-title");
      if (!title) return;
      var value = lang === "en" ? title.getAttribute("data-title-en") : title.getAttribute("data-title-zh");
      if (value) title.textContent = value;
      scene.setAttribute("aria-label", value || "");
    });
  }

  function render() {
    var byId = {};
    photosData.photos.forEach(function (photo) { byId[photo.id] = photo; });
    var featured = (photosData.featured || []).map(function (id) { return byId[id]; }).filter(Boolean);
    photosData.photos.forEach(function (photo) {
      if (featured.length < 3 && featured.indexOf(photo) < 0) featured.push(photo);
    });
    featured = featured.slice(0, 3);
    grid.innerHTML = featured.map(sceneMarkup).join("");
    refreshTitles();
  }

  function load() {
    fetch(new URL("./data/photos.json", location.href), { cache: "no-store" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (payload) {
        photosData = payload;
        render();
        window.__homePhotosReady = true;
        document.dispatchEvent(new Event("photos-ready"));
      })
      .catch(function (error) {
        grid.innerHTML = '<p class="home-scenes-error">照片读取失败：' + escapeHtml(error.message) + "</p>";
        document.dispatchEvent(new Event("photos-ready"));
      });
  }

  document.addEventListener("langchange", function () {
    lang = document.documentElement.lang || "zh";
    if (photosData) refreshTitles();
  });

  load();
})();
