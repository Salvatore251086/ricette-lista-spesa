/* =========================================================
   Ricette & Lista Spesa — service-worker.js
   Precaching “best-effort” (try/catch), niente POST/PUT in cache,
   strategie semplici per statici e JSON.
   ========================================================= */

const SW_VERSION = 'v5';
const STATIC_CACHE = `static-${SW_VERSION}`;
const RUNTIME_CACHE = `runtime-${SW_VERSION}`;

// Asset statici sicuri da precache (evita file che potrebbero mancare)
const PRECACHE = [
  '/',               // GitHub Pages reindirizza a index
  '/ricette-lista-spesa/',   // radice pagina (tollerante per GitHub Pages)
  'index.html',
  'styles.css',
  'app.js',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/shortcut-96.png',
  'assets/json/recipes-it.json',
  'manifest.webmanifest'
  // NON aggiungere 'import/recipes.json' (potrebbe non esistere)
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    for (const url of PRECACHE) {
      try {
        await cache.add(url);
      } catch (e) {
        // non bloccare l'install se un asset fallisce
        // console.warn('Precaching skip:', url, e);
      }
    }
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter(k => ![STATIC_CACHE, RUNTIME_CACHE].includes(k))
        .map(k => caches.delete(k))
    );
    self.clients.claim();
  })());
});

function isJSON(req) {
  return req.destination === 'document' ? false
    : req.url.endsWith('.json') || req.headers.get('accept')?.includes('application/json');
}

function isStatic(req) {
  // asset statici noti
  const u = new URL(req.url);
  return (
    u.pathname.endsWith('.css') ||
    u.pathname.endsWith('.js') ||
    u.pathname.endsWith('.png') ||
    u.pathname.endsWith('.ico') ||
    u.pathname.endsWith('.webmanifest') ||
    u.pathname.includes('/assets/')
  );
}

// Network-first per JSON (così vedi nuovi import subito), Cache-first per statici
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Evita di cache-izzare richieste non-GET (niente POST/PUT -> errori in Cache API)
  if (request.method !== 'GET') return;

  if (isJSON(request)) {
    event.respondWith(networkFirst(request));
  } else if (isStatic(request)) {
    event.respondWith(cacheFirst(request));
  } else {
    // default: prova rete, fallback cache
    event.respondWith(networkFirst(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const resp = await fetch(request);
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch {
    return cached || new Response('', { status: 504, statusText: 'Offline' });
  }
}

async function networkFirst(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  try {
    const resp = await fetch(request, { cache: 'no-store' });
    if (resp && resp.ok) cache.put(request, resp.clone());
    return resp;
  } catch {
    const fallback = await cache.match(request, { ignoreSearch: true });
    return fallback || new Response('', { status: 504, statusText: 'Offline' });
  }
}
