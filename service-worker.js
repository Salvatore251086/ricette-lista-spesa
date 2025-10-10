// Versione cache: cambia il valore per forzare update
const CACHE_NAME = 'rls-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Cache-first per asset statici, network-first per il resto
  if (req.method === 'GET' && (req.destination === 'document' || req.destination === 'style' || req.destination === 'script' || req.destination === 'image')) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});
