/* sw v3 – leggero e difensivo */
const CACHE = 'app-cache-v3';

// Solo asset **esistenti** e stabili
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './assets/icons/shortcut-96.png',
  './assets/icons/icon-192.png',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (c) => {
      try { await c.addAll(CORE); } catch(e) { /* ignora */ }
    }).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

// Network-first su JSON dinamici, cache-first sugli asset
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Evita di interferire con richieste di chrome-devtools/extensions
  if (url.origin !== location.origin) return;

  const isJSON = url.pathname.endsWith('.json');

  if (isJSON) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
        return r;
      }).catch(() => caches.match(e.request))
    );
  } else {
    e.respondWith(
      caches.match(e.request).then((res) => res || fetch(e.request).then((r) => {
        const clone = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone)).catch(()=>{});
        return r;
      }).catch(() => res || Response.error()))
    );
  }
});
