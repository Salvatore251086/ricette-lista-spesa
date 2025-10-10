/* Ricette & Lista Spesa — Service Worker con fallback offline */
const CACHE_VERSION = 'v2';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

const ASSETS = [
  '/',                    // se il server serve index su /
  '/index.html',
  '/manifest.webmanifest',
  OFFLINE_URL,
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png'
];

// Install: precache asset + offline.html
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

// Activate: pulizia cache vecchie
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((k) => (k !== STATIC_CACHE ? caches.delete(k) : null)))
    )
  );
  self.clients.claim();
});

// Fetch:
// - HTML: network-first → se offline => offline.html
// - Statici: cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // ignora chiamate non GET (POST/PUT ecc.)
  if (req.method !== 'GET') return;

  const acceptsHTML = req.headers.get('accept')?.includes('text/html');

  if (acceptsHTML) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(async () => {
          // prova cache della pagina richiesta, poi fallback offline
          const cached = await caches.match(req);
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // cache-first per asset (css/js/img/font/ico)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // opzionale: fallback per icone (commentato)
        // if (req.destination === 'image') return caches.match('/assets/icons/icon-192.png');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

