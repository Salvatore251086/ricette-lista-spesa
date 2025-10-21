const CACHE_NAME = 'rls-cache-v15'
const OFFLINE_URL = 'offline.html'

const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'offline.html',
  'favicon.ico',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-512-maskable.png'
]

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_NAME)
    await Promise.all(
      ASSETS.map(async u => {
        try { await c.add(u) } catch (_) {}
      })
    )
  })())
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => (k !== CACHE_NAME ? caches.delete(k) : null)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const r = e.request

  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(r, copy))
          return res
        })
        .catch(() => caches.match(r).then(x => x || caches.match(OFFLINE_URL)))
    )
    return
  }

  e.respondWith(
    caches.match(r).then(cached => {
      const net = fetch(r)
        .then(res => {
          const copy = res.clone()
          caches.open(CACHE_NAME).then(c => c.put(r, copy))
          return res
        })
        .catch(() => cached)
      return cached || net
    })
  )
})
