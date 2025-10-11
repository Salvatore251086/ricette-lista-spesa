const CACHE = 'rls-v3';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/icon-512-maskable.png'
];

self.addEventListener('install', (e)=>{
  e.waitUntil(
    caches.open(CACHE).then(c=>c.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e)=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e)=>{
  const req = e.request;
  // asset statici cache-first
  if (req.method === 'GET' && (req.headers.get('accept')||'').includes('text/html') === false) {
    e.respondWith(
      caches.match(req).then(res=>res || fetch(req))
    );
    return;
  }
  // pagine: network con fallback cache
  e.respondWith(
    fetch(req).then(res=>{
      const copy = res.clone();
      caches.open(CACHE).then(c=>c.put(req, copy));
      return res;
    }).catch(()=>caches.match(req).then(r=>r || caches.match('./index.html')))
  );
});
