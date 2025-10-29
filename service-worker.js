// service-worker.js — Ricette & Lista Spesa
const CACHE_VERSION = 'v18'
const CACHE_NAME = `ricette-cache-${CACHE_VERSION}`

const ASSETS = [
  './',
  './index.html',
  './app.v16.js',            // nome corretto
  './styles.css',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png'
]

// Install con precache robusto
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      const adds = ASSETS.map(u => cache.add(u).catch(() => null))
      await Promise.allSettled(adds)
    })
  )
  self.skipWaiting()
})

// Activate con pulizia cache vecchie
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys
        .filter(k => k.startsWith('ricette-cache-') && k !== CACHE_NAME)
        .map(k => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// Fetch: rete prima per JSON ricette, cache con fallback per statici
self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)

  if (url.pathname.includes('/assets/json/recipes-it.json')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    )
    return
  }

  event.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req).then(res => {
        const copy = res.clone()
        if (req.method === 'GET' && res.ok) {
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy))
        }
        return res
      }).catch(() => caches.match('./index.html'))
    )
  )
})
