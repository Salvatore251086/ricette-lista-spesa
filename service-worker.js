// service-worker.js — Ricette & Lista Spesa
// Versione cache aggiornata per forzare reload
const CACHE_VERSION = 'v17'
const CACHE_NAME = `ricette-cache-${CACHE_VERSION}`

const ASSETS = [
  './',
  './index.html',
  './app.v16.js',
  './styles.css',
  './manifest.webmanifest',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/json/recipes-it.json'
]

// Installazione
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  )
  self.skipWaiting()
})

// Attivazione
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

// Fetch con fallback rete → cache
self.addEventListener('fetch', event => {
  const req = event.request
  const url = new URL(req.url)

  // Evita di cache-bustare le richieste dinamiche (ricette, immagini)
  if (url.pathname.includes('/assets/json/recipes-it.json')) {
    event.respondWith(
      fetch(req).catch(() => caches.match(req))
    )
    return
  }

  // Statici
  event.respondWith(
    caches.match(req).then(cached =>
      cached ||
      fetch(req).then(res => {
        const copy = res.clone()
        if (req.method === 'GET' && res.ok && !url.pathname.endsWith('.mp4')) {
          caches.open(CACHE_NAME).then(cache => cache.put(req, copy))
        }
        return res
      }).catch(() => caches.match('./index.html'))
    )
  )
})
