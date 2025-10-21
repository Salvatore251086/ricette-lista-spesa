const VERSION = 'v5';
const STATIC_CACHE = `static-${VERSION}`;

// ⚠️ SOLO file che esistono davvero nel repo
const STATIC_ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'favicon.ico',

  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-512-maskable.png',
  'assets/icons/shortcut-96.png'
];

// Install: precache robusto (non si rompe se un asset fallisce)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(async (cache) => {
      for (const url of STATIC_ASSETS) {
        try {
          await cache.add(url);
        } catch (err) {
          // Non bloccare l'install se un singolo file fallisce
          console.warn('[SW] Skip precache:', url, err?.message || err);
        }
      }
    })
  );
  self.skipWaiting();
});

// Activate: pulizia cache vecchie
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith('static-') && k !== STATIC_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// Fetch:
// - HTML: network-first con fallback a cache (se c'è)
// - Asset statici (png/ico/webmanifest/js/css): cache-first con salvataggio opportunistico
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Navigazioni / HTML
  if (
    req.mode === 'navigate' ||
    (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))
  ) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // Statici: cache-first
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
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(req, copy));
            return res;
          })
          .catch(() => cached);
      })
    );
  }
});
