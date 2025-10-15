// /ricette-lista-spesa/service-worker.js

// ——— Config ———
const VERSION   = 'v5';
const BASE_PATH = '/ricette-lista-spesa';
const CACHE_NAME = `rls-cache-${VERSION}`;
const OFFLINE_URL = `${BASE_PATH}/offline.html`;

// Risorse da precache (devono esistere a questi percorsi)
const PRECACHE_ASSETS = [
  `${BASE_PATH}/`,
  `${BASE_PATH}/index.html`,
  `${BASE_PATH}/styles.css`,
  `${BASE_PATH}/manifest.webmanifest`,
  `${BASE_PATH}/assets/icons/icon-192.png`,
  `${BASE_PATH}/assets/icons/icon-512.png`,
  `${BASE_PATH}/assets/icons/icon-512-maskable.png`,
  OFFLINE_URL
];

// ——— Install: precache ———
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// ——— Activate: pulizia vecchie cache ———
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('rls-cache-') && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// ——— Strategia di fetch ———
// HTML: network-first con fallback a offline.html
// Statici (css/js/img/ico): cache-first con fallback di rete
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Richieste di navigazione (pagine)
  const isHTMLRequest =
    req.mode === 'navigate' ||
    (req.headers.get('accept') || '').includes('text/html');

  if (isHTMLRequest) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          // Opzionale: metti in cache la risposta fresca
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(async () => {
          // Prova cache della pagina, altrimenti offline.html
          const cached = await caches.match(req);
          return cached || caches.match(OFFLINE_URL);
        })
    );
    return;
  }

  // Per tutto il resto: cache-first
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          // Metti in cache risorse statiche recuperate
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(() => {
          // Nessun fallback per asset mancanti (immagini esterne, ecc.)
          return new Response('', { status: 502, statusText: 'offline' });
        });
    })
  );
});
