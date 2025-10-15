/* ==== Ricette & Lista Spesa — Service Worker ==== */
const CACHE_VERSION = 'v9'; // bumpa questo ogni volta che cambi SW
const RUNTIME_CACHE = `runtime-${CACHE_VERSION}`;
const PRECACHE = `precache-${CACHE_VERSION}`;

// Path base dello scope (es. "/ricette-lista-spesa/")
const BASE = new URL('./', self.location).pathname;

// File da precache (tutto GET e stessa origine)
const PRECACHE_URLS = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}styles.css`,
  `${BASE}app.js`,
  `${BASE}manifest.webmanifest`,
  `${BASE}offline.html`,
  // Icone principali
  `${BASE}assets/icons/icon-192.png`,
  `${BASE}assets/icons/icon-512.png`,
  `${BASE}assets/icons/icon-512-maskable.png`,
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRECACHE);
    await cache.addAll(PRECACHE_URLS.map(u => new Request(u, { cache: 'reload' })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Pulisci cache vecchie
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => ![PRECACHE, RUNTIME_CACHE].includes(k))
        .map(k => caches.delete(k))
    );
    clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;

  // 1) Ignora tutto ciò che NON è GET (POST/PUT/DELETE…)
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;

  // 2) Strategie
  if (sameOrigin) {
    // HTML → Network-first con fallback offline
    if (req.destination === 'document' || req.mode === 'navigate') {
      event.respondWith(networkFirst(req));
      return;
    }

    // Statici (css/js/immagini/font) → Stale-while-revalidate
    if (['style', 'script', 'image', 'font'].includes(req.destination)) {
      event.respondWith(staleWhileRevalidate(req));
      return;
    }
  }

  // 3) Per il resto → passa diretto in rete (no cache per cross-origin/opaque)
  // Evita di “puttare” risposte opaque
  event.respondWith(fetch(req).catch(() => caches.match(`${BASE}offline.html`)));
});

/* === Helpers === */

// Network-first per HTML
async function networkFirst(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    // Metti in cache solo risposte OK e "basic" (stessa origine)
    if (fresh.ok && fresh.type === 'basic') {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (err) {
    // offline → prova cache, poi offline.html
    const cached = await caches.match(request);
    return cached || caches.match(`${BASE}offline.html`);
  }
}

// Stale-while-revalidate per asset statici
async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok && response.type === 'basic') {
      cache.put(request, response.clone());
    }
    return response;
  }).catch(() => null);

  return cached || fetchPromise || (await caches.match(`${BASE}offline.html`));
}
