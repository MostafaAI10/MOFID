/* Mofid service worker. Bump CACHE whenever a shell file changes. */
const CACHE = "mofid-v30";

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

  // API endpoints must always hit the network, never the PWA shell cache.
  if (url.pathname.startsWith("/health") || url.pathname.startsWith("/ask")) return;

  e.respondWith(
    caches.match(request).then((hit) => {
      if (hit) {
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
