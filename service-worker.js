/* SW v16.1 — cache versionata, network-first per JSON, cache-first per statici */
const SW_VERSION = "v16.1";
const CACHE_STATIC = `static-${SW_VERSION}`;
const CACHE_RUNTIME = `runtime-${SW_VERSION}`;

const CORE = [
  "/ricette-lista-spesa/",
  "index.html?v=v16.1",
  "styles.css?v=v16.1",
  "script/app_v16.js?v=v16.1",
  "script/register-sw.js?v=v16.1",
  "assets/icons/icon-192.png",
  "assets/icons/icon-512.png",
  "manifest.webmanifest"
];

self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_STATIC).then(c => c.addAll(CORE))
  );
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter(k => k !== CACHE_STATIC && k !== CACHE_RUNTIME)
          .map(k => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Network-first per JSON dinamici
const isJsonData = url => url.includes("assets/json/recipes-it.json");

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  // bypass manuale per sviluppo
  if (url.searchParams.get("cache") === "reload") {
    e.respondWith(fetch(e.request));
    return;
  }

  // JSON dati ricette
  if (isJsonData(url.href)) {
    e.respondWith(networkFirst(e.request));
    return;
  }

  // asset statici del nostro sito
  const isSameOrigin = url.origin === self.location.origin;
  if (isSameOrigin) {
    e.respondWith(cacheFirst(e.request));
    return;
  }

  // default
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

async function cacheFirst(req){
  const cached = await caches.match(req, { ignoreSearch: false });
  if (cached) return cached;
  const res = await fetch(req);
  const cache = await caches.open(CACHE_RUNTIME);
  cache.put(req, res.clone());
  return res;
}

async function networkFirst(req){
  try{
    const res = await fetch(req, { cache: "no-store" });
    const cache = await caches.open(CACHE_RUNTIME);
    cache.put(req, res.clone());
    return res;
  }catch{
    const cached = await caches.match(req, { ignoreSearch: false });
    if (cached) return cached;
    throw new Response("Offline", { status: 503 });
  }
}

// messaggi dal client
self.addEventListener("message", e => {
  if (e.data && e.data.type === "SKIP_WAITING") self.skipWaiting();
});
