/* service-worker.js — PWA base per GitHub Pages
   - Cache essenziale per lavorare anche con rete lenta
   - Aggiorna subito quando pubblichi una nuova versione
*/
const CACHE_NAME = 'rls-cache-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting(); // installa subito la nuova versione
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k === CACHE_NAME ? null : caches.delete(k))))
    )
  );
  self.clients.claim(); // prendi controllo subito
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Network-first per HTML; cache-first per il resto
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('./index.html'))
    );
  } else {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request))
    );
  }
});
