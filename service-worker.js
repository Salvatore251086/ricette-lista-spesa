/* RLS Service Worker v9.1
   - Versione con busting manuale per test
*/
const CACHE_VERSION = "rls-v9-1";
const CORE = [
  "/",
  "/index.html",
  "/styles.css",
  "/app.v17.js",
  "/assets/icons/placeholder.svg",
  "/assets/icons/favicon.png",
  "/manifest.webmanifest"
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
  const req = e.request;
  // Evita cache per JSON ricette, lasciamo a runtime con busting
  if (req.url.includes("assets/json/recipes-it.json")) {
    return;
  }
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req))
  );
});
