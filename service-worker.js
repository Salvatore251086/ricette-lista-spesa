const CACHE = 'app-shell-v3';
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './assets/icons/shortcut-96.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

// IMPORTANTE: gestiamo SOLO richieste di navigazione (pagine).
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return; // niente .js / .css / .json

  e.respondWith((async () => {
    try {
      const fresh = await fetch(e.request);
      return fresh;
    } catch {
      const cache = await caches.open(CACHE);
      const cached = await cache.match('./index.html');
      return cached || new Response('Offline', { status: 503 });
    }
  })());
});
