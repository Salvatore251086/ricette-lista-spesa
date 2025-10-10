// service-worker.js
const CACHE = 'ricette-v1';

// Asset principali (percorsi RELATIVI al repo)
const ASSETS = [
  './',
  './index.html',
  './offline.html',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Solo GET
  if (request.method !== 'GET') return;

  // Network-first per HTML, cache-first per il resto
  if (request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(request, copy));
        return res;
      }).catch(() => caches.match(request).then(r => r || caches.match('./offline.html')))
    );
  } else {
    e.respondWith(
      caches.match(request).then(r => r ||
        fetch(request).then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(request, copy));
          return res;
        }).catch(() => caches.match('./assets/icons/icon-192.png'))
      )
    );
  }
});
