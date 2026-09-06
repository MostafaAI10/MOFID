/* Mofid service worker - the app must survive with no network at all.
   Bump CACHE when any shell file changes, or clients keep the old copy. */
const CACHE = "mofid-v26";

const SHELL = [
  ".", "index.html", "styles.css", "app.js", "api.js",
  "manifest.webmanifest",
  "data/curriculum.json", "data/suggestions.json", "data/suggestions.en.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  if (request.method !== "GET") return; // never cache /ask

  const url = new URL(request.url);
  if (url.origin !== location.origin) return;

  // Shell and data: cache first, so a cold start with no network still works.
  e.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
        // Refresh in the background when a network happens to be there
        fetch(request).then((res) => {
          if (res && res.ok) caches.open(CACHE).then((c) => c.put(request, res.clone()));
        }).catch(() => {});
        return hit;
      }
      return fetch(request).then((res) => {
        if (res && res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      }).catch(() => caches.match("index.html"));
    })
  );
});
