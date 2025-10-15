/* service-worker.js */
const APP_VERSION = 'v7'; // aumenta questo numero quando cambi il SW
const APP_PREFIX  = 'rls-pwa';
const CACHE_NAME  = `${APP_PREFIX}-${APP_VERSION}`;

const PRECACHE_URLS = [
  './',                       // start
  './index.html',
  './styles.css',
  './app.js',
  './setting.html',
  './offline.html',
  './manifest.webmanifest',

  // Icone PWA
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png',

  // Screenshot (tolgono i warning "Richer PWA Install UI…")
  './assets/home-wide-1920x1080.png',
  './assets/home-narrow-1080x1920.png'
];

// ---------- Install: precache ----------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

// ---------- Activate: pulizia cache vecchie ----------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k.startsWith(APP_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

// Helpers di routing
const isHTML = (req) =>
  req.headers.get('accept')?.includes('text/html') ||
  req.destination === 'document';

const isStatic = (req) =>
  ['style', 'script', 'image', 'font'].includes(req.destination);

// ---------- Fetch strategies ----------
self.addEventListener('fetch', (event) => {
  const req = event.request;

  // 1) HTML → network-first con fallback cache/offline
  if (isHTML(req)) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
          return res;
        })
        .catch(async () => {
          const cacheHit = await caches.match(req);
          return cacheHit || caches.match('./offline.html');
        })
    );
    return;
  }

  // 2) Statici (CSS/JS/IMG/FONT) → stale-while-revalidate
  if (isStatic(req)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, resClone));
            return res;
          })
          .catch(() => cached); // se rete KO, usa cache se c'è
        return cached || fetchPromise;
      })
    );
    return;
  }

  // 3) altro → cache-first di cortesia
  event.respondWith(
    caches.match(req).then((cached) => cached || fetch(req))
  );
});
