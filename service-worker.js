// service-worker.js
const VERSION = 'v8';
const BASE = '/ricette-lista-spesa'; // percorso del sito su GitHub Pages
const APP_SHELL = [
  `${BASE}/`,
  `${BASE}/index.html`,
  `${BASE}/styles.css`,
  `${BASE}/app.js`,
  `${BASE}/manifest.webmanifest`,
  `${BASE}/offline.html`,
  `${BASE}/assets/icons/icon-192.png`,
  `${BASE}/assets/icons/icon-512.png`,
  `${BASE}/assets/icons/icon-512-maskable.png`,
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(`app-shell-${VERSION}`).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => !k.includes(VERSION))
        .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// --- IMPORTANTISSIMO: niente fallback per robots/sitemap (txt/xml) ---
const BYPASS_APP_SHELL = (url) => {
  // escludi file testuali o feed
  if (url.pathname.endsWith('/robots.txt')) return true;
  if (url.pathname.endsWith('/sitemap.xml')) return true;
  if (url.pathname.endsWith('.txt')) return true;
  if (url.pathname.endsWith('.xml')) return true;
  if (url.pathname.endsWith('.json')) return true;
  return false;
};

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Lascia passare richieste fuori dallo scope o che devono bypassare l'app shell
  if (!url.pathname.startsWith(BASE) || BYPASS_APP_SHELL(url)) return;

  // Navigazioni: app-shell fallback
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() =>
        caches.match(`${BASE}/offline.html`)
      )
    );
    return;
  }

  // Statiche: cache first, poi rete
  event.respondWith(
    caches.match(event.request).then((cached) =>
      cached ||
      fetch(event.request).then((resp) => {
        const respClone = resp.clone();
        caches.open(`runtime-${VERSION}`).then((c) => c.put(event.request, respClone));
        return resp;
      }).catch(() => {
        // eventuale fallback per immagini/font ecc. (qui niente)
      })
    )
  );
});
