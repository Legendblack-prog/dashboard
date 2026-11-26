const CACHE = "bybit-pwa-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./core.js",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon192.png",
  "./icons/icon512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  // API Bybit / ntfy — всегда сеть
  if (url.hostname.includes("bybit.com") || url.hostname.includes("ntfy.sh")) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => cached || fetch(e.request).then((r) => {
      const copy = r.clone();
      caches.open(CACHE).then((c) => c.put(e.request, copy));
      return r;
    }).catch(() => cached))
  );
});
