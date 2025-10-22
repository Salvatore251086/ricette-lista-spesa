#!/usr/bin/env node
// crawl-gz.mjs — robusto, con retry, fallback e deduplica

import fs from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const SITEMAP_ROOTS = [
  'https://www.giallozafferano.it/sitemap.xml',
  'https://ricette.giallozafferano.it/sitemap.xml'
]

// Fallback se i sitemap non rispondono
const FALLBACK_URLS = [
  'https://ricette.giallozafferano.it/Gnocchi-alla-sorrentina.html',
  'https://ricette.giallozafferano.it/Pollo-alla-cacciatora.html',
  'https://ricette.giallozafferano.it/Lasagne-alla-Bolognese.html',
  'https://ricette.giallozafferano.it/Tiramisu.html',
  'https://ricette.giallozafferano.it/Pesto-alla-genovese.html',
  'https://ricette.giallozafferano.it/Minestrone-di-verdure.html'
]

const OUT_FILE = 'urls.txt'
const CHECKPOINT = '.cache/gz-seen.txt'

await fs.mkdir('.cache', { recursive: true })
await touch(OUT_FILE)

const seen = new Set(await readLines(CHECKPOINT))
const already = new Set((await readLines(OUT_FILE)).map(s => s.toLowerCase()))

const sitemapSet = new Set()
const recipeSet = new Set()
const errors = []

// 1) leggi sitemap root
for (const root of SITEMAP_ROOTS) {
  const txt = await fetchTextMaybeGz(root)
  if (!txt) { errors.push(`Fail root ${root}`); continue }
  for (const loc of extractLocs(txt)) sitemapSet.add(loc)
  for (const u of extractRecipeUrls(txt)) recipeSet.add(u)
}

// 2) espandi sotto-sitemap
for (const sm of Array.from(sitemapSet)) {
  if (isGZRecipe(sm)) { recipeSet.add(sm); continue }
  if (!/\.xml(\.gz)?$/i.test(sm)) continue

  const txt = await fetchTextMaybeGz(sm)
  if (!txt) { errors.push(`Fail sub ${sm}`); continue }

  for (const loc of extractLocs(txt)) {
    if (/\.xml(\.gz)?$/i.test(loc)) sitemapSet.add(loc)
  }
  for (const u of extractRecipeUrls(txt)) recipeSet.add(u)
}

// 3) fallback
if (recipeSet.size === 0) {
  for (const u of FALLBACK_URLS) recipeSet.add(u)
}

// 4) filtra nuovi
const fresh = []
for (const u of recipeSet) {
  const k = u.toLowerCase()
  if (seen.has(k)) continue
  if (already.has(k)) continue
  fresh.push(u)
}

// 5) scrivi file
if (fresh.length) {
  const current = await readLines(OUT_FILE)
  const newList = [...fresh, ...current] // prepend
  await fs.writeFile(OUT_FILE, newList.join('\n') + '\n', 'utf8')
  for (const u of fresh) seen.add(u.toLowerCase())
  await fs.writeFile(CHECKPOINT, Array.from(seen).join('\n') + '\n', 'utf8')
}

// 6) log finale
console.log(JSON.stringify({
  sitemap_checked: sitemapSet.size,
  recipes_found: recipeSet.size,
  appended: fresh.length,
  errors
}, null, 2))

/* helper */

async function fetchTextMaybeGz(url) {
  try {
    for (let i = 0; i < 3; i++) {
      const r = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
          'Accept': 'application/xml,text/xml,text/html;q=0.9,*/*;q=0.8'
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(12000)
      })
      if (!r.ok) { await delay(400 * (i + 1)); continue }
      const ce = r.headers.get('content-encoding') || ''
      const ct = r.headers.get('content-type') || ''
      if (ce.toLowerCase().includes('gzip')) return await r.text()
      if (url.endsWith('.xml.gz') || ct.includes('application/x-gzip')) {
        const buf = new Uint8Array(await r.arrayBuffer())
        return gunzipSync(buf).toString('utf8')
      }
      return await r.text()
    }
    return ''
  } catch {
    return ''
  }
}

function extractLocs(xml) {
  const out = []
  const re = /<loc>([\s\S]*?)<\/loc>/gi
  let m
  while ((m = re.exec(xml))) out.push(m[1].trim())
  return out
}

function extractRecipeUrls(xml) {
  const out = []
  const re = /<loc>([\s\S]*?)<\/loc>/gi
  let m
  while ((m = re.exec(xml))) {
    const u = m[1].trim()
    if (isGZRecipe(u)) out.push(u)
  }
  return out
}

function isGZRecipe(u) {
  try {
    const url = new URL(u)
    const h = url.hostname
    const p = url.pathname.toLowerCase()
    if (!(h === 'www.giallozafferano.it' || h === 'ricette.giallozafferano.it')) return false
    if (h === 'www.giallozafferano.it' && p.includes('/ricetta/')) return true
    if (h === 'ricette.giallozafferano.it' && p.endsWith('.html')) return true
    return false
  } catch { return false }
}

async function readLines(path) {
  try {
    const t = await fs.readFile(path, 'utf8')
    return t.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  } catch { return [] }
}

async function touch(path) {
  try { await fs.access(path) } catch { await fs.writeFile(path, '', 'utf8') }
}

function delay(ms) { return new Promise(r => setTimeout(r, ms)) }
