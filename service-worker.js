// service-worker.js  — cache statico sicuro
const VERSION = 'v3';
const ASSETS = [
  './',
  './index.html',
  './app.html',
  './app.js',
  './assets/json/recipes-it.json',
  './assets/json/ingredients-it.json',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/shortcut-96.png',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // cache-first per asset dell’app
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req))
    );
    return;
  }

  // network-first per risorse esterne
  event.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
