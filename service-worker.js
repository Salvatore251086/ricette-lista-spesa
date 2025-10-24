// SW minimal: niente “takeover” aggressivo, cache sicura
const CACHE = 'rx-cache-v1';
const CORE = [
  './',
  './index.html',
  './styles.css',
  './app.v16.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/json/recipes-it.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // network-first per import dinamici
  if (url.pathname.includes('/import/recipes.json')) {
    e.respondWith((async ()=>{
      try{
        const net = await fetch(e.request);
        const copy = net.clone();
        const cache = await caches.open(CACHE);
        cache.put(e.request, copy);
        return net;
      }catch{
        const cache = await caches.open(CACHE);
        return (await cache.match(e.request)) || new Response('[]',{headers:{'content-type':'application/json'}});
      }
    })());
    return;
  }

  // cache-first per core e assets
  e.respondWith((async ()=>{
    const cache = await caches.open(CACHE);
    const hit = await cache.match(e.request);
    if (hit) return hit;
    try{
      const net = await fetch(e.request);
      if (net.ok && (e.request.method==='GET')) cache.put(e.request, net.clone());
      return net;
    }catch{
      // fallback “silenzioso”
      return new Response('', {status: 408});
    }
  })());
});
