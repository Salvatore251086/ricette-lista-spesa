/* service-worker.js */

// Importa la versione condivisa
// (NB: path relativo alla root in cui serve il SW)
importScripts('config.js');

// Fallback se per qualche motivo non c'è
const APP_VERSION = (self && self.APP_VERSION) || 'dev';

// Nomi cache versionati
const STATIC_CACHE = `static-v-${APP_VERSION}`;
const RUNTIME_CACHE = `runtime-v-${APP_VERSION}`;

// Pattern dei JSON di dati da NON mettere in cache in modo persistente
const DATA_JSON_RE = /\/assets\/json\/.*\.json(\?.*)?$/i;

// Asset statici “app shell” (metti quello che serve in offline)
// Non includere i JSON dei dati!
const APP_SHELL = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.v16.js',
  '/config.js',
  '/manifest.webmanifest',
  '/favicon.ico',
  '/assets/icons/icon-512.png',
];

// Install
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Activate: pulizia cache vecchie
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Strategia di fetch
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Non gestire metodi non-GET
  if (req.method !== 'GET') return;

  // Dati JSON: NETWORK-FIRST (no cache persistente)
  if (DATA_JSON_RE.test(url.pathname)) {
    event.respondWith(networkFirst(req));
    return;
  }

  // Stesso dominio: Cache-first con fallback a rete
  if (url.origin === location.origin) {
    event.respondWith(cacheFirst(req));
    return;
  }

  // Terze parti: prova cache poi rete (prudente)
  event.respondWith(cacheFirst(req));
});

// Helpers
async function cacheFirst(req) {
  const cached = await caches.match(req);
  if (cached) return cached;

  const resp = await fetch(req);
  // mettiamo solo asset “sicuri” in runtime cache
  if (resp && resp.ok && isRuntimeCacheable(req)) {
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(req, resp.clone());
  }
  return resp;
}

async function networkFirst(req) {
  try {
    const resp = await fetch(req, { cache: 'no-store' });
    return resp; // niente put in cache per i JSON dei dati
  } catch (err) {
    const cached = await caches.match(req);
    if (cached) return cached;
    throw err;
  }
}

function isRuntimeCacheable(req) {
  const url = new URL(req.url);
  // non cachiamo i JSON dei dati
  if (DATA_JSON_RE.test(url.pathname)) return false;
  // cachiamo css/js/png/svg/ico/woff ecc.
  return /\.(css|js|png|jpe?g|gif|svg|ico|webp|woff2?)$/i.test(url.pathname);
}
