// service-worker.js
const VERSION = 'v4';
const STATIC_CACHE = `static-${VERSION}`;

const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.ico',

  // Icone: solo file ESISTENTI
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-512-maskable.png',
  'assets/icons/shortcut-96.png',

  // Pagine ausiliarie se presenti
  'offline.html',
  'privacy.html',
  'termini.html'
];

// Install: precache degli asset sicuri (evitiamo file che in passato davano 404)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// Activate: pulizia cache vecchie
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((k) => k.startsWith('static-') && k !== STATIC_CACHE)
        .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Strategia:
// - Navigazioni (HTML): network-first con fallback offline
// - Statici (png, ico, webmanifest, css, js): cache-first
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // HTML / navigazioni
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() =>
          caches.match(req).then((cached) => cached || caches.match('offline.html'))
        )
    );
    return;
  }

  // Asset statici (icone, manifest, css/js): cache-first
  const url = new URL(req.url);
  const isStatic =
    /\.(png|ico|webmanifest|json|css|js)$/i.test(url.pathname) ||
    url.pathname.endsWith('manifest.webmanifest');

  if (isStatic) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            // Evita errori "body already used": usa res.clone()
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            return res;
          })
          .catch(() => cached);
      })
    );
  }
});
