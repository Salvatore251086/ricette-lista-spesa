// SW simple network-first
const VERSION = "v20";
self.addEventListener("install", e => self.skipWaiting());
self.addEventListener("activate", e => self.clients.claim());

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      return fresh;
    } catch {
      const cache = await caches.open(VERSION);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) return cached;
      return Response.error();
    }
  })());
});
