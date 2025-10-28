/* service-worker v16.9 */
const CACHE_NAME = 'rls-cache-v16-9'
const CORE = [
  './',
  './index.html',
  './script/app_v16.js?v=16.9',
  './assets/json/recipes-it.json',
  './assets/icons/icon-512.png',
  './favicon.ico'
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

/*
  Regole semplici
  1. JSON e richieste stessa origine: network first con fallback cache
  2. statici: cache first con fallback rete
*/
self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)

  if (url.origin === self.location.origin && url.pathname.endsWith('.json')) {
    e.respondWith(networkFirst(req))
    return
  }

  if (url.origin === self.location.origin) {
    e.respondWith(cacheFirst(req))
    return
  }

  // terze parti
  e.respondWith(fetch(req).catch(() => caches.match(req)))
})

async function cacheFirst(req) {
  const cache = await caches.open(CACHE_NAME)
  const hit = await cache.match(req, { ignoreSearch: true })
  if (hit) return hit
  const res = await fetch(req)
  if (res && res.ok) cache.put(req, res.clone())
  return res
}

async function networkFirst(req) {
  const cache = await caches.open(CACHE_NAME)
  try {
    const res = await fetch(req, { cache: 'no-store' })
    if (res && res.ok) cache.put(req, res.clone())
    return res
  } catch {
    const hit = await cache.match(req, { ignoreSearch: true })
    if (hit) return hit
    return new Response('Offline', { status: 503, statusText: 'Offline' })
  }
}
