/* service-worker.js */
const CACHE_NAME = 'rls-v3';

/* Metti qui SOLO file locali che esistono davvero nel repo */
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/shortcut-96.png',
  'styles.css' // se non lo usi/eliminalo
];

/* Install: precache con tolleranza agli errori singoli */
self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    for (const url of PRECACHE) {
      try {
        // cache='reload' forza il prelievo bypassando eventuale SW precedente
        await cache.add(new Request(url, { cache: 'reload' }));
      } catch (err) {
        // Non bloccare l’installazione se un asset manca
        console.warn('[SW] Skip missing asset:', url, err?.message || err);
      }
    }
    await self.skipWaiting();
  })());
});

/* Activate: ripulisci cache vecchie */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(
      names.map((name) => (name !== CACHE_NAME) && caches.delete(name))
    );
    await self.clients.claim();
  })());
});

/* Fetch: 
   - per navigazioni HTML → network-first con fallback cache
   - per asset stessi-origin → cache-first con fallback rete
   - per richieste cross-origin (es. Plausible) → lascia passare alla rete
*/
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // ignora richieste di altri domini
  if (url.origin !== self.location.origin) return;

  // Navigazioni (HTML)
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (_) {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  // Asset stessi-origin → cache-first
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);
    if (cached) return cached;
    try {
      const fresh = await fetch(req);
      // salva solo GET riuscite
      if (req.method === 'GET' && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch (_) {
      return cached || Response.error();
    }
  })());
});
