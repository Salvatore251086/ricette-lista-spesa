// v13 — bypass per YouTube e cache solo GET
const VERSION = 'v13'

const CORE = [
  './',
  './index.html',
  './app.html',
  './app.js?v=13',
  './styles.css',
  './manifest.webmanifest',
  './offline.html',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/shortcut-96.png'
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

  // Non gestire mai richieste non-GET
  if (req.method !== 'GET') {
    e.respondWith(fetch(req))
    return
  }

  // JSON dati, rete-prima
  if (/\/assets\/json\/(recipes-it\.json|ingredients-it\.json)/.test(url.pathname)) {
    e.respondWith(fetch(req).catch(()=> caches.match(req)))
    return
  }

  // Bypass totale per domini video YouTube
  const host = url.hostname
  if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com') || host.endsWith('ytimg.com') || host.endsWith('googlevideo.com')) {
    e.respondWith(fetch(req))
    return
  }

  // Stale-while-revalidate per stesso dominio
  if (url.origin === self.location.origin) {
    e.respondWith(staleWhileRevalidate(req))
    return
  }

  // Esterni GET: rete-prima con fallback cache
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
