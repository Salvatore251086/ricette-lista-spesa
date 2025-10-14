/* Ricette & Lista Spesa — SW */
const VERSION = 'v1.0.0';
const BASE = '/ricette-lista-spesa';
const CACHE = `rls-${VERSION}`;

const CORE_ASSETS = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/styles.css`,
  `${BASE}/offline.html`,
  `${BASE}/setting.html`,
  `${BASE}/assets/home-narrow-1080x1920.png`,
  `${BASE}/assets/icons/icon-192.png`,
  `${BASE}/assets/icons/icon-512.png`,
  `${BASE}/assets/icons/icon-512-maskable.png`
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Strategia: HTML -> network-first con fallback offline; statici -> cache-first
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const isHTML = req.headers.get('accept')?.includes('text/html');

  if (isHTML) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, clone));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match(`${BASE}/offline.html`)))
    );
    return;
  }

  // assets statici
  e.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req)
        .then((res) => {
          const resClone = res.clone();
          caches.open(CACHE).then((c) => c.put(req, resClone));
          return res;
        })
        .catch(() => cached);
    })
  );
});
