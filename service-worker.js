// service-worker.js v8 — stale-while-revalidate e fallback JSON offline
const VERSION = 'v8'
const CORE = [
  './','./index.html','./app.html','./app.js?v=8',
  './assets/icons/icon-192.png','./assets/icons/icon-512.png','./assets/icons/shortcut-96.png',
  './manifest.webmanifest'
]
const JSONS = [
  './assets/json/recipes-it.json',
  './assets/json/ingredients-it.json'
]

self.addEventListener('install', e => {
  e.waitUntil((async ()=>{
    const c = await caches.open(VERSION)
    await c.addAll(CORE.concat(JSONS))
    self.skipWaiting()
  })())
})

self.addEventListener('activate', e => {
  e.waitUntil((async ()=>{
    const keys = await caches.keys()
    await Promise.all(keys.filter(k=>k!==VERSION).map(k=>caches.delete(k)))
    self.clients.claim()
  })())
})

self.addEventListener('fetch', e => {
  const req = e.request
  const url = new URL(req.url)

  // Solo stesso dominio
  if (url.origin !== self.location.origin) {
    e.respondWith(networkThenCache(req))
    return
  }

  // JSON, prova rete poi cache come fallback
  if (JSONS.some(p => url.pathname.endsWith(p.replace('./','/')))) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone()
      caches.open(VERSION).then(c=>c.put(req, copy))
      return res
    }).catch(()=> caches.match(req)))
    return
  }

  // Stale-while-revalidate per tutto il resto
  e.respondWith(staleWhileRevalidate(req))
})

async function networkThenCache(req){
  try {
    const res = await fetch(req)
    const copy = res.clone()
    const c = await caches.open(VERSION); c.put(req, copy)
    return res
  } catch {
    const hit = await caches.match(req)
    if (hit) return hit
    throw new Error('offline')
  }
}
async function staleWhileRevalidate(req){
  const cache = await caches.open(VERSION)
  const cached = await cache.match(req)
  const network = fetch(req).then(res => { cache.put(req, res.clone()); return res }).catch(()=>null)
  return cached || network || new Response('', {status:504, statusText:'Offline'})
}
