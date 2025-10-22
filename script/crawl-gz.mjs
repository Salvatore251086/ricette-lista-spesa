// script/crawl-gz.mjs
// Legge sitemap pubblici, estrae URL ricette GZ, aggiorna urls.txt in modo incrementale
// Uso locale: node script/crawl-gz.mjs
// In Actions viene eseguito dal workflow

import fs from 'node:fs/promises'

const SITEMAP_ROOTS = [
  'https://www.giallozafferano.it/sitemap.xml',
  'https://ricette.giallozafferano.it/sitemap.xml'
]

const OUT_FILE = 'urls.txt'
const CHECKPOINT = '.cache/gz-seen.txt'

await fs.mkdir('.cache', { recursive: true })

const seen = new Set(await readLines(CHECKPOINT))
const already = new Set(await readLines(OUT_FILE))

const sitemapUrls = new Set()

for (const root of SITEMAP_ROOTS) {
  const txt = await safeFetchText(root)
  if (!txt) continue
  for (const loc of extractXmlTags(txt, 'loc')) {
    if (/\bsitemap\.xml\b/i.test(loc)) sitemapUrls.add(loc)
  }
  // se il root è già sitemap index, sopra bastano
  // ma se è un urlset, prendi anche le <loc> dirette
  for (const loc of extractRecipeUrls([txt])) {
    sitemapUrls.add(loc)
  }
}

// scarica tutti i sitemap raccolti, estrai ricette
const recipeUrls = new Set()
for (const sm of sitemapUrls) {
  const txt = await safeFetchText(sm)
  if (!txt) continue
  for (const u of extractRecipeUrls([txt])) recipeUrls.add(u)
}

// filtra nuovi rispetto a seen e già presenti
const fresh = []
for (const u of recipeUrls) {
  const k = u.toLowerCase()
  if (seen.has(k)) continue
  if (already.has(k)) continue
  fresh.push(u)
}

if (fresh.length) {
  const append = fresh.join('\n') + '\n'
  await fs.appendFile(OUT_FILE, append, 'utf8')
  for (const u of fresh) seen.add(u.toLowerCase())
  await fs.writeFile(CHECKPOINT, Array.from(seen).join('\n') + '\n', 'utf8')
}

console.log(JSON.stringify({ sitemap_checked: sitemapUrls.size, found: recipeUrls.size, appended: fresh.length }, null, 2))

function extractXmlTags(xml, tag) {
  const out = []
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'gi')
  let m
  while ((m = re.exec(xml))) out.push(m[1].trim())
  return out
}

function extractRecipeUrls(xmlChunks) {
  const out = []
  const re = /<loc>([\s\S]*?)<\/loc>/gi
  for (const xml of xmlChunks) {
    let m
    while ((m = re.exec(xml))) {
      const u = m[1].trim()
      if (isGZRecipe(u)) out.push(u)
    }
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

async function safeFetchText(u) {
  try {
    const r = await fetch(u, {
      headers: {
        'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36',
        'Accept': 'application/xml,text/xml,text/html;q=0.9,*/*;q=0.8'
      },
      redirect: 'follow'
    })
    if (!r.ok) return ''
    return await r.text()
  } catch {
    return ''
  }
}

async function readLines(path) {
  try {
    const t = await fs.readFile(path, 'utf8')
    return t.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  } catch {
    return []
  }
}
