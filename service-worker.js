// service-worker.js
// v16.9 cache versionata

const SW_VERSION = '16.9';
const CACHE_NAME = 'rls-cache-' + SW_VERSION;

self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) =>
      c.addAll([
        './',
        './index.html',
        './assets/icons/icon-192.png',
        './assets/icons/icon-512.png',
        './assets/json/recipes-it.json?v=' + SW_VERSION,
        './script/app_v16.js?v=' + SW_VERSION
      ]).catch(()=>{})
    )
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;

  if (req.url.includes('/assets/json/recipes-it.json')) {
    e.respondWith(
      fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((c) => c.put(req, clone));
        return res;
      }).catch(() => caches.match(req))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => hit || fetch(req))
  );
});
