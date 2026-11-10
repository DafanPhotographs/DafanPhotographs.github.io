/* 大樊发布后台 · 最小离线壳 */
var CACHE = "dafan-admin-v3";
var SHELL = [
  "/tools/admin.html",
  "/tools/manifest.webmanifest",
  "/tools/icon-192.png",
  "/tools/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return cache.addAll(SHELL);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) {
        return caches.delete(k);
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.indexOf("/tools/") !== 0) return;

  // The admin page itself is network-first so a new deploy is picked up immediately.
  if (url.pathname === "/tools/admin.html" || event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request, { cache: "no-store" }).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put("/tools/admin.html", copy); });
        return res;
      }).catch(function () {
        return caches.match("/tools/admin.html");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;
      return fetch(event.request).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(event.request, copy); });
        return res;
      });
    })
  );
});
