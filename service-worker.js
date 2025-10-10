// service-worker.js
// v5 — forza update cambiando versione se modifichi l'elenco asset
const CACHE_NAME = 'rls-pwa-v5';
const BASE = '/ricette-lista-spesa/';

// Elenco asset REALI nel repo; metti solo file che esistono davvero
const ASSETS = [
  `${BASE}`,                        // root della webapp
  `${BASE}index.html`,
  `${BASE}offline.html`,
  `${BASE}setting.html`,
  `${BASE}manifest.webmanifest`,
  // Icone PWA
  `${BASE}assets/icons/icon-192.png`,
  `${BASE}assets/icons/icon-512.png`,
  `${BASE}assets/icons/icon-96.png`,
  // Hero / cover
  `${BASE}assets/home-wide-1920x1080.png`,
  `${BASE}assets/home-narrow-1080x1920.png`
];

// Install: cache degli asset (tollerante agli errori)
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // invece di cache.addAll (che fallisce se 1 URL va in errore),
    // aggiungo uno ad uno, ignorando i fallimenti
    await Promise.all(
      ASSETS.map(async (url) => {
        try {
          await cache.add(url);
        } catch (e) {
          // utile in debug: console.warn('[SW] skip cache', url, e);
        }
      })
    );
    await self.skipWaiting();
  })());
});

// Activate: pulizia vecchie cache e presa di controllo
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : Promise.resolve())));
    await self.clients.claim();
  })());
});

// Strategia: HTML -> network-first con fallback offline
//            asset statici -> cache-first con fallback rete
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Navigazioni/documenti: network-first
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // metti in cache in background
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone()).catch(() => {});
        return fresh;
      } catch {
        // offline fallback
        const cache = await caches.open(CACHE_NAME);
        const off = await cache.match(`${BASE}offline.html`);
        return off || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' }});
      }
    })());
    return;
  }

  // Asset statici: cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      // cache only same-origin GET
      if (req.method === 'GET' && new URL(req.url).origin === location.origin) {
        cache.put(req, fresh.clone()).catch(() => {});
      }
      return fresh;
    } catch {
      return new Response('', { status: 504 });
    }
  })());
});
