/* PWA Ricette & Lista Spesa */
const CACHE_VERSION = 'v9';
const PRECACHE = `precache-${CACHE_VERSION}`;
const RUNTIME = `runtime-${CACHE_VERSION}`;

const PRECACHE_URLS = [
  '/ricette-lista-spesa/',
  '/ricette-lista-spesa/index.html',
  '/ricette-lista-spesa/styles.css',
  '/ricette-lista-spesa/app.js',
  '/ricette-lista-spesa/offline.html',
  '/ricette-lista-spesa/manifest.webmanifest',
  '/ricette-lista-spesa/assets/icons/icon-192.png',
  '/ricette-lista-spesa/assets/icons/icon-512.png',
  '/ricette-lista-spesa/assets/icons/icon-512-maskable.png'
];

// Install, precache
self.addEventListener('install', event => {
  event.waitUntil(caches.open(PRECACHE).then(c => c.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

// Activate, pulizia vecchie cache e notify
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map(k => {
      if (!k.includes(CACHE_VERSION)) return caches.delete(k);
    }));
    await self.clients.claim();
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) client.postMessage({ type: 'SW_UPDATED' });
  })());
});

// Messaggi dal client
self.addEventListener('message', evt => {
  if (evt.data && evt.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// Fetch
self.addEventListener('fetch', event => {
  const req = event.request;

  // Ignora non-GET, evita "Cache.put POST unsupported"
  if (req.method !== 'GET') return;

  const accept = req.headers.get('accept') || '';
  const isHTML = event.request.mode === 'navigate' || accept.includes('text/html');

  if (isHTML) {
    // Network first per HTML
    event.respondWith(
      fetch(req)
        .then(resp => {
          const copy = resp.clone();
          caches.open(RUNTIME).then(c => c.put(req, copy));
          return resp;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match('/ricette-lista-spesa/offline.html');
        })
    );
    return;
  }

  // Stale-While-Revalidate per asset
  event.respondWith(staleWhileRevalidate(req));
});

async function staleWhileRevalidate(req) {
  const cache = await caches.open(RUNTIME);
  const cached = await cache.match(req);

  const networkPromise = fetch(req)
    .then(resp => {
      cache.put(req, resp.clone());
      return resp;
    })
    .catch(() => undefined);

  return cached || networkPromise || caches.match('/ricette-lista-spesa/offline.html');
}
