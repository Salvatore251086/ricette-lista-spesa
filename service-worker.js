/* v12 SW robusto per GitHub Pages
   - BASE auto dal scope
   - install non fallisce se un file manca
   - Network-first HTML
   - Stale-while-revalidate statici
   - Esclusi POST, robots.txt, sitemap.xml
*/
const BASE = new URL(self.registration.scope).pathname.endsWith('/')
  ? new URL(self.registration.scope).pathname
  : new URL(self.registration.scope).pathname + '/'

const VERSION = 'v12'
const CACHE_STATIC = `rls-static-${VERSION}`

// Precache minimale, aggiungi app.css/app.js solo se esistono davvero
const PRECACHE = [
  `${BASE}`,
  `${BASE}index.html`,
  `${BASE}offline.html`
]

// Install tollerante ai 404
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_STATIC)
    await Promise.allSettled(PRECACHE.map(async (u) => {
      const resp = await fetch(u, { cache: 'no-store' })
      if (resp.ok) await cache.put(u, resp.clone())
    }))
  })())
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
  } catch {
    const cached = await caches.match(req)
    return cached || caches.match(`${BASE}offline.html`)
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

  event.respondWith(fetch(req).catch(() => caches.match(`${BASE}offline.html`)))
})
