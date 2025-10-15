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
      const resp = await fetch(u, { cach
