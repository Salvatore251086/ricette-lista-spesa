/* Ricette & Lista Spesa – service-worker.js */
self.addEventListener('install', (e) => {
  // Precache "best effort": se una risorsa 404 non fallisce l’install
  const CORE = [
    '/',            // se servito come GitHub Pages usa il path corretto già in scope
    'index.html',
    'styles.css',
    'app.js',
    'assets/icons/icon-192.png',
    'assets/icons/icon-512.png',
    'assets/json/recipes-it.json'
  ];

  e.waitUntil((async () => {
    const cache = await caches.open('rls-v1');
    // cache singolarmente per ignorare 404
    await Promise.allSettled(CORE.map(u => fetch(u, { cache: 'no-store' })
      .then(r => { if (r.ok) return cache.put(u, r.clone()); })));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keep = new Set(['rls-v1']);
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => !keep.has(k)).map(k => caches.delete(k)));
    self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const { request } = e;

  // Bypass per chiamate dinamiche (YouTube, terze parti)
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // network-first per JSON ricette, cache-first per asset statici
  if (request.destination === 'document' || request.url.endsWith('.json')) {
    e.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const c = await caches.open('rls-v1');
        c.put(request, fresh.clone()).catch(()=>{});
        return fresh;
      } catch {
        const cached = await caches.match(request);
        return cached || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      const c = await caches.open('rls-v1');
      c.put(request, fresh.clone()).catch(()=>{});
      return fresh;
    } catch {
      return cached || Response.error();
    }
  })());
});
