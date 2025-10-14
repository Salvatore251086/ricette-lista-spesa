// service-worker.js (allineato a GitHub Pages /ricette-lista-spesa/)
const BASE = '/ricette-lista-spesa/';
const CACHE_NAME = 'rls-cache-v9';

const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'styles.css',
  BASE + 'app.js',
  BASE + 'manifest.webmanifest',
  BASE + 'offline.html',
  BASE + 'assets/icon-192.png',
  BASE + 'assets/icon-512.png',
  BASE + 'assets/icon-512-maskable.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Prova a mettere in cache solo le risorse che rispondono 200
      const okUrls = [];
      for (const url of ASSETS) {
        try {
          const res = await fetch(url, { cache: 'no-cache' });
          if (res.ok) okUrls.push(url);
        } catch (e) { /* ignora 404/network */ }
      }
      return cache.addAll(okUrls);
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null))
    ).then(() => self.clients.claim())
  );
});

// Network falling back to cache per HTML; cache-first per statici
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Navigazioni (HTML): network first, fallback cache/offline
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        return fresh;
      } catch {
        const cache = await caches.open(CACHE_NAME);
        const cached = await cache.match(BASE + 'index.html');
        return cached || Response.error();
      }
    })());
    return;
  }

  // Statici (CSS/JS/immagini): cache first, poi rete
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    } catch {
      // offline fallback per HTML diretto
      if (req.destination === 'document') {
        const off = await cache.match(BASE + 'offline.html');
        if (off) return off;
      }
      return Response.error();
    }
  })());
});
