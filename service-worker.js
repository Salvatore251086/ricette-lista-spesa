// service-worker.js
// Ricette & Lista Spesa — PWA
/* v4 */

const CACHE_VERSION = 'v4';
const STATIC_CACHE = `static-${CACHE_VERSION}`;

// File essenziali da avere sempre pronti offline (percorsi RELATIVI per GitHub Pages)
const CORE_ASSETS = [
  './',                    // index.html
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './favicon.ico',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',
  './assets/icons/shortcut-96.png'
];

// ——— Lifecycle ———
self.addEventListener('install', (event) => {
  // Precache dei core assets con tolleranza a 404 (niente crash su file mancanti)
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    for (const url of CORE_ASSETS) {
      try { await cache.add(url); } catch (_) { /* ignora 404 o cors */ }
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  // Pulisci cache vecchie e prendi il controllo subito
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => (k !== STATIC_CACHE ? caches.delete(k) : null)));
    await self.clients.claim();
  })());
});

// ——— Strategie di fetch ———
// 1) Navigazioni (HTML): Network-first con fallback offline.html
// 2) Asset statici (icone/manifest): Cache-first
// 3) Il resto: Stale-While-Revalidate
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo richieste GET gestite dalla cache
  if (req.method !== 'GET') return;

  // 1) Navigazione documento
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        // aggiorna in background l'index nella cache
        const cache = await caches.open(STATIC_CACHE);
        cache.put('./', fresh.clone()).catch(()=>{});
        return fresh;
      } catch (_) {
        // offline => offline.html oppure cache index
        const cache = await caches.open(STATIC_CACHE);
        const offlinePage = await cache.match('./offline.html');
        return offlinePage || cache.match('./index.html') || Response.error();
      }
    })());
    return;
  }

  // 2) Asset “semplici” (icone/manifest)
  if (url.pathname.includes('/assets/icons/') || url.pathname.endsWith('manifest.webmanifest')) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC_CACHE);
      const cached = await cache.match(req);
      if (cached) return cached;
      try {
        const fresh = await fetch(req);
        cache.put(req, fresh.clone()).catch(()=>{});
        return fresh;
      } catch (_) {
        return cached || Response.error();
      }
    })());
    return;
  }

  // 3) Default: Stale-While-Revalidate
  event.respondWith((async () => {
    const cache = await caches.open(STATIC_CACHE);
    const cached = await cache.match(req);
    const fetchPromise = fetch(req).then((fresh) => {
      cache.put(req, fresh.clone()).catch(()=>{});
      return fresh;
    }).catch(() => cached || Response.error());
    // Se c'è cache, rispondi subito; altrimenti aspetta rete
    return cached || fetchPromise;
  })());
});

// ——— Aggiornamento immediato opzionale ———
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
