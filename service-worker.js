// v11 — niente precache dei JSON, JSON sempre rete-prima
const VERSION = 'v11'
const CORE = [
  './',
  './index.html',
  './app.html',
  './app.js?v=11',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/shortcut-96.png',
  './manifest.webmanifest',
  './styles.css',
  './offline.html'
]

self.addEventListener('install', e => {
  e.waitUntil((async ()=>{
    const c = await caches.open(VERSION)
    await c.addAll(CORE)
    self.skipWaiting()
  })())
})

self.addEventListener('activate', e => {
  e.waitUntil((async ()=>{
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
    self.clients.claim()
  })())
})

self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)

  // Bypassa cache per i JSON ricette e ingredienti
  const isJsonData = /\/assets\/json\/(recipes-it\.json|ingredients-it\.json)/.test(url.pathname)
  if (isJsonData) {
    e.respondWith(fetch(req).catch(()=> caches.match(req)))
    return
  }

  // Stale-while-revalidate per il resto dello stesso dominio
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req))
    return
  }

  // Per domini esterni, rete-prima con fallback cache
  e.respondWith(networkThenCache(req))
})

async function staleWhileRevalidate(req){
  const cache = await caches.open(VERSION)
  const cached = await cache.match(req)
  const network = fetch(req).then(res => { cache.put(req, res.clone()); return res }).catch(()=>null)
  return cached || network || caches.match('./offline.html')
}
async function networkThenCache(req){
  try {
    const res = await fetch(req)
    const cache = await caches.open(VERSION)
    cache.put(req, res.clone())
    return res
  } catch {
    const hit = await caches.match(req)
    return hit || caches.match('./offline.html')
  }
}
