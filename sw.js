const CACHE_NAME = "where2go-public-v113";
const APP_ASSETS = [
  "styles.css",
  "app.js",
  "config.js",
  "data/data-status.html",
  "data/data-status.js",
  "manifest.webmanifest",
  "assets/icon.svg",
  "assets/icon-192.png",
  "assets/icon-512.png",
  "assets/world-cup-filter-bg.svg",
  "assets/share-card.png",
  "data/events.json",
  "data/event-sources.json",
  "data/geo/town-boundaries.geojson",
  "data/sample-events.json"
];

const NETWORK_FIRST_SUFFIXES = [
  "/",
  "/index.html",
  "/app.js",
  "/config.js",
  "/data/data-status.html",
  "/data/data-status.js",
  "/styles.css",
  "/data/events.json",
  "/data/event-sources.json",
  "/data/geo/town-boundaries.geojson",
  "/data/sample-events.json"
];

function shouldUseNetworkFirst(url) {
  if (url.origin !== self.location.origin) {
    return false;
  }
  return NETWORK_FIRST_SUFFIXES.some((suffix) => url.pathname.endsWith(suffix));
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (shouldUseNetworkFirst(url)) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
      );
    })
  );
});
