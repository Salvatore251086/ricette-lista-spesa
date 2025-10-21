const CACHE_NAME = 'rls-cache-v17'
const OFFLINE_URL = 'offline.html'

const ASSETS = [
  'index.html',
  'styles.css',
  'app.js?v=2',
  'manifest.webmanifest',
  'offline.html',
  'favicon.ico',
  // icone PNG
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-512-maskable.png',
  // icone WebP
  'assets/icons/icon-192.webp',
  'assets/icons/icon-512.webp'
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

  // Pagine di navigazione
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r)
        .then(res => {
          caches.open(CACHE_NAME).then(c => c.put(r, res.clone()))
          return res
        })
        .catch(() =>
          caches.match(r).then(x => x || caches.match(OFFLINE_URL))
        )
    )
    return
  }

  // Statiche, cache-first con aggiornamento in background
  e.respondWith(
    caches.match(r).then(cached => {
      const net = fetch(r)
        .then(res => {
          caches.open(CACHE_NAME).then(c => c.put(r, res.clone()))
          return res
        })
        .catch(() => cached)
      return cached || net
    })
  )
})
