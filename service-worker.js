/* RLS Service Worker v10.4 */
const CACHE_VERSION = "rls-v10-4";
const CORE = [
  "index.html",
  "styles.css",
  "script/app_17.js",
  "assets/icons/icon-512.png",
  "manifest.webmanifest"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE_VERSION).then(c => c.addAll(CORE)));
  self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", e => {
  const url = e.request.url;
  if (url.includes("assets/json/recipes-it.json")) return;
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
