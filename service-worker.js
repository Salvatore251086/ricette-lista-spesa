const CACHE_NAME = 'ricette-pwa-v1';
const BASE = '/ricette-lista-spesa/';

const ASSETS = [
  BASE,
  BASE + 'index.html',
  BASE + 'manifest.webmanifest',
  BASE + 'offline.html',
  BASE + 'assets/icons/icon-192.png',
  BASE + 'assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k === CACHE_NAME ? null : caches.delete(k)))))
      .then(() => self.clients.claim())
  );
});

// Network first per HTML, cache first per assets
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Navigazioni (HTML)
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(() => caches.match(BASE + 'offline.html'))
    );
    return;
  }

  // Per assets: prova cache poi rete
  event.respondWith(
    caches.match(req).then(cached => cached || fetch(req))
  );
});
