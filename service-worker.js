// service-worker.js (root del sito: /ricette-lista-spesa/service-worker.js)
const CACHE = 'app-cache-v6';
const CORE = [
  '/ricette-lista-spesa/',
  '/ricette-lista-spesa/index.html',
  '/ricette-lista-spesa/styles.css',
  '/ricette-lista-spesa/manifest.webmanifest',
  '/ricette-lista-spesa/assets/icons/icon-192.png',
  '/ricette-lista-spesa/assets/icons/icon-512.png',
  '/ricette-lista-spesa/assets/icons/icon-512-maskable.png',
];

self.addEventListener('install', e=>{
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(self.skipWaiting()));
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.map(k=>k!==CACHE?caches.delete(k):null)))
      .then(()=>self.clients.claim())
  );
});

// Stale-While-Revalidate per recipes.json, cache-first per core
self.addEventListener('fetch', e=>{
  const url = new URL(e.request.url);

  // solo nostro origin
  if (url.origin !== location.origin) return;

  // recipes.json: SWR
  if (url.pathname.endsWith('/data/recipes.json')) {
    e.respondWith((async ()=>{
      const cache = await caches.open(CACHE);
      const cached = await cache.match(e.request);
      const network = fetch(e.request).then(res=>{ cache.put(e.request, res.clone()); return res; }).catch(()=>null);
      return cached || network || new Response('[]',{headers:{'Content-Type':'application/json'}});
    })());
    return;
  }

  // core: cache first
  if (CORE.includes(url.pathname)) {
    e.respondWith(caches.match(e.request).then(r=> r || fetch(e.request)));
    return;
  }

  // fallback generico
  e.respondWith(fetch(e.request).catch(()=>caches.match('/ricette-lista-spesa/index.html')));
});
