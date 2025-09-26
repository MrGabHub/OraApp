const CACHE_NAME = "oraapp-cache-v1";
const ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/apple-touch-icon.png",
  "/favicon.ico",
];

// Installation → mise en cache des assets
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activation → nettoyage anciens caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  clients.claim();
});

// Fetch → sert les assets depuis le cache si dispo
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((resp) => resp || fetch(event.request))
  );
});
