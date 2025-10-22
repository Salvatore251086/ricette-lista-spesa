#!/usr/bin/env node
// crawl-gz.mjs — legge sitemap .xml e .xml.gz, estrae URL ricette GZ e aggiorna urls.txt

import fs from 'node:fs/promises'
import { gunzipSync } from 'node:zlib'

const SITEMAP_ROOTS = [
  'https://www.giallozafferano.it/sitemap.xml',
  'https://ricette.giallozafferano.it/sitemap.xml'
]

const OUT_FILE = 'urls.txt'
const CHECKPOINT = '.cache/gz-seen.txt'

await fs.mkdir('.cache', { recursive: true })

const seen = new Set(await readLines(CHECKPOINT))
const already = new Set(await readLines(OUT_FILE))

const sitemapSet = new Set()

// 1) leggi i sitemap root
for (const root of SITEMAP_ROOTS) {
  const txt = await fetchTextMaybeGz(root)
  if (!txt) continue

  // raccogli i link a sotto-sitemap
  for (const loc of extractLocs(txt)) sitemapSet.add(loc)

  // se il root è già un urlset, raccogli ricette dirette
  for (const u of extractRecipeUrls(txt)) sitemapSet.add(u)
}

// 2) espandi tutti i sotto-sitemap
const recipeSet = new Set()
for (const sm of sitemapSet) {
  // accetta solo sitemap e url diretti ricetta
  if (isGZRecipe(sm)) { recipeSet.add(sm); continue }
  if (!/\.xml(\.gz)?$/i.test(sm)) continue

  const txt = await fetchTextMaybeGz(sm)
  if (!txt) continue

  // se è un index, aggiunge altri sitemap
  for (const loc of extractLocs(txt)) {
    if (/\.xml(\.gz)?$/i.test(loc)) sitemapSet.add(loc)
  }
  // se è un urlset, aggiunge ricette
  for (const u of extractRecipeUrls(txt)) recipeSet.add(u)
}

// 3) filtra nuovi
const fresh = []
for (const u of recipeSet) {
  const k = u.toLowerCase()
  if (seen.has(k)) continue
  if (already.has(k)) continue
  fresh.push(u)
}

// 4) aggiorna file
if (fresh.length) {
  await fs.appendFile(OUT_FILE, fresh.join('\n') + '\n', 'utf8')
  for (const u of fresh) seen.add(u.toLowerCase())
  await fs.writeFile(CHECKPOINT, Array.from(seen).join('\n') + '\n', 'utf8')
}

// 5) log finale
console.log(JSON.stringify({
  sitemap_checked: sitemapSet.size,
  recipes_found: recipeSet.size,
  appended: fresh.length
}, null, 2))

/* helper */

async function fetchTextMaybeGz(url) {
  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'application/xml,text/xml,text/html;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow'
    })
    if (!r.ok) return ''
    // se il server invia già Content-Encoding:gzip, .text() basta
    const ce = r.headers.get('content-encoding') || ''
    const ct = r.headers.get('content-type') || ''
    if (ce.toLowerCase().includes('gzip')) return await r.text()
    if (url.endsWith('.xml.gz') || ct.includes('application/x-gzip')) {
      const buf = new Uint8Array(await r.arrayBuffer())
      return gunzipSync(buf).toString('utf8')
    }
    return await r.text()
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
