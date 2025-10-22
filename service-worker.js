/* SW con cache di base, ma JSON ricette e YouTube sempre da rete */

const CACHE = 'rls-static-v4'
const ASSETS = [
  '/',               // se servito da GitHub Pages verrà ignorato
  '/ricette-lista-spesa/',
  'index.html',
  'styles.css',
  'app.js',
  'favicon.ico',
  'manifest.webmanifest',
  'offline.html',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png'
  // non mettere assets/json/recipes-it.json
]

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', e => {
  const { request } = e

  // lascia passare tutto ciò che non è GET
  if (request.method !== 'GET') {
    e.respondWith(fetch(request))
    return
  }

  const url = new URL(request.url)

  // mai in cache il JSON delle ricette
  if (url.pathname.endsWith('/assets/json/recipes-it.json')) {
    e.respondWith(fetch(request))
    return
  }

  // mai in cache risorse YouTube e analytics
  if (/(youtube|ytimg|google-analytics|analytics|doubleclick)/i.test(url.hostname)) {
    e.respondWith(fetch(request))
    return
  }

  // network-first su HTML
  if (request.headers.get('accept')?.includes('text/html')) {
    e.respondWith(
      fetch(request).then(r => {
        const cp = r.clone()
        caches.open(CACHE).then(c => c.put(request, cp)).catch(() => {})
        return r
      }).catch(() => caches.match(request).then(r => r || caches.match('offline.html')))
    )
    return
  }

  // cache-first per statici
  e.respondWith(
    caches.match(request).then(cached => {
      if (cached) return cached
      return fetch(request).then(r => {
        const cp = r.clone()
        caches.open(CACHE).then(c => c.put(request, cp)).catch(() => {})
        return r
      }).catch(() => caches.match('offline.html'))
    })
  )
})
