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

  function render() {
    var byId = {};
    photosData.photos.forEach(function (photo) { byId[photo.id] = photo; });
    var featured = (photosData.featured || []).map(function (id) { return byId[id]; }).filter(Boolean);
    // Legacy data without a featured list still gets a hero; an explicit
    // admin selection of 1–3 photos is respected as-is.
    if (!featured.length) featured = photosData.photos.slice(0, 5);
    featured = featured.slice(0, 5);
    grid.innerHTML = featured.map(sceneMarkup).join("");
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


  load();
})();
