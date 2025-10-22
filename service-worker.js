const CACHE_NAME = 'rls-v3';
const PRECACHE_URLS = [
  './',
  'index.html',
  'app.html',
  'js/app.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/shortcut-96.png',
  'manifest.webmanifest'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE_NAME ? caches.delete(k) : null))
    ).then(() => self.clients.claim())
  );
});

// strategy: network first, fallback cache, infine offline
self.addEventListener('fetch', (event) => {
  const req = event.request;
  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then(m => m || caches.match('index.html')))
  );
});
