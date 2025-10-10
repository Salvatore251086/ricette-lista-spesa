// service-worker.js
// PWA cache + fallback offline
const CACHE_NAME = 'app-cache-v2';

const ASSETS = [
  './',
  './index.html',
  './settings.html',
  './offline.html',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
];

// Install: precache asset principali
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: pulizia cache vecchie
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Prova ad abilitare il navigation preload (aiuta su rete lenta)
      if ('navigationPreload' in self.registration) {
        try { await self.registration.navigationPreload.enable(); } catch(e){}
      }
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Fetch: pagine -> network-first con fallback offline
// asset statici -> cache-first con aggiornamento in background
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Pagine di navigazione (document/html)
  if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
    return;
  }

  // Per tutto il resto: cache-first
  event.respondWith(cacheFirst(req));
});

// Network first per pagine
async function networkFirst(request) {
  try {
    // Se c'è navigation preload, usala
    const preload = await eventPreloadResponse();
    if (preload) return preload;

    const netRes = await fetch(request);
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, netRes.clone());
    return netRes;
  } catch (err) {
    const cache = await caches.open(CACHE_NAME);
    // Se abbiamo già la pagina in cache, usala; altrimenti offline.html
    const cached = await cache.match(request);
    return cached || cache.match('./offline.html');
  }
}

// Cache first per asset statici
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  try {
    const resp = await fetch(request);
    // Salva in cache le risposte “buone”
    if (resp && resp.status === 200) cache.put(request, resp.clone());
    return resp;
  } catch (e) {
    // ultimo fallback: offline.html solo se la richiesta è html
    if (request.headers.get('accept')?.includes('text/html')) {
      return cache.match('./offline.html');
    }
    throw e;
  }
}

// Supporto navigation preload (se attiva)
async function eventPreloadResponse() {
  try {
    const e = /** @type {ExtendableEvent & {preloadResponse?: Promise<Response>}} */ (self._lastFetchEvent);
    if (e && e.preloadResponse) return await e.preloadResponse;
  } catch(_) {}
  return null;
}

// Piccolo hack per accedere all’evento fetch corrente (serve al preload)
self.addEventListener('fetch', (e) => { self._lastFetchEvent = e; }, {capture:true});

// Messaggi dal client (es. skipWaiting)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
