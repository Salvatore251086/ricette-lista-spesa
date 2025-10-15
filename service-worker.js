/* v11 SW con strategie chiare
   - Network-first per HTML
   - Stale-while-revalidate per statici
   - Esclusi POST, robots.txt, sitemap.xml
*/
const BASE = '/ricette-lista-spesa/'
const VERSION = 'v11'
const CACHE_STATIC = `rls-static-${VERSION}`
const PRECACHE = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}app.css`,
  `${BASE}app.js`,
  `${BASE}offline.html`,
  `${BASE}icons/maskable-192.png`,
  `${BASE}icons/maskable-512.png`
]

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_STATIC).then(c => c.addAll(PRECACHE))
  )
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => {
        if (k !== CACHE_STATIC) return caches.delete(k)
      }))
    )
  )
  self.clients.claim()
})

function bypass(req) {
  if (req.method !== 'GET') return true
  const u = new URL(req.url)
  if (u.pathname.endsWith('/robots.txt')) return true
  if (u.pathname.endsWith('/sitemap.xml')) return true
  return false
}

async function networkFirst(req) {
  try {
    const net = await fetch(req)
    const clone = net.clone()
    caches.open(CACHE_STATIC).then(c => c.put(req, clone))
    return net
  } catch (e) {
    const cached = await caches.match(req)
    if (cached) return cached
    return caches.match(`${BASE}offline.html`)
  }
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE_STATIC)
  const cached = await cache.match(req)
  const fetchPromise = fetch(req).then(res => {
    cache.put(req, res.clone())
    return res
  }).catch(() => cached || caches.match(`${BASE}offline.html`))
  return cached || fetchPromise
}

self.addEventListener('fetch', event => {
  const req = event.request
  if (bypass(req)) return

  const url = new URL(req.url)
  const sameOrigin = url.origin === self.location.origin

  if (sameOrigin) {
    if (req.destination === 'document' || req.mode === 'navigate') {
      event.respondWith(networkFirst(req))
      return
    }
    if (['style', 'script', 'image', 'font'].includes(req.destination)) {
      event.respondWith(staleWhileRevalidate(req))
      return
    }
  }

  event.respondWith(
    fetch(req).catch(() => caches.match(`${BASE}offline.html`))
  )
})
