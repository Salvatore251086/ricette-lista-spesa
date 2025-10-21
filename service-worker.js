const CACHE_NAME = 'rls-cache-v2'
const OFFLINE_URL = 'offline.html'

const ASSETS = [
  '/',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'offline.html',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'favicon.ico'
]

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)))
  self.skipWaiting()
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null))))
  )
  self.clients.claim()
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy))
          return res
        })
        .catch(() => caches.match(req).then(r => r || caches.match(OFFLINE_URL)))
    )
    return
  }
  event.respondWith(
    caches.match(req).then(cached => {
      const fetchAndCache = fetch(req)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy))
          return res
        })
        .catch(() => cached)
      return cached || fetchAndCache
    })
  )
})
