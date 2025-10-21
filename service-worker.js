const CACHE_NAME = 'rls-cache-v7'
const OFFLINE_URL = 'offline.html'

const ASSETS = [
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'offline.html',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-512-maskable.png',
  'assets/screenshots/home-wide-1920x1080.png',
  'assets/screenshots/home-narrow-1080x1920.png',
  'favicon.ico'
]

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE_NAME)
    await Promise.all(ASSETS.map(async u => {
      try { await c.add(u) } catch(_) { /* skip mancante */ }
    }))
  })())
  self.skipWaiting()
})

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.map(k => k !== CACHE_NAME ? caches.delete(k) : null))))
  self.clients.claim()
})

self.addEventListener('fetch', e => {
  const r = e.request
  if (r.mode === 'navigate') {
    e.respondWith(
      fetch(r).then(res => {
        const copy = res.clone()
        caches.open(CACHE_NAME).then(c => c.put(r, copy))
        return res
      }).catch(() => caches.match(r).then(x => x || caches.match(OFFLINE_URL)))
    )
    return
  }
  e.respondWith(
    caches.match(r).then(cached => {
      const f = fetch(r).then(res => {
        const copy = res.clone()
        caches.open(CACHE_NAME).then(c => c.put(r, copy))
        return res
      }).catch(() => cached)
      return cached || f
    })
  )
})
