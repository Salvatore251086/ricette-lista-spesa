#!/usr/bin/env node
// Uso
// node script/import-recipes.mjs urls.txt > new_recipes.json

import fs from 'node:fs/promises'

const listFile = process.argv[2]
if (!listFile) {
  console.error('Passa urls.txt')
  process.exit(1)
}

const ALLOWED = new Set([
  'ricette.giallozafferano.it',
  'www.giallozafferano.it',
  'blog.giallozafferano.it',
  'www.fattoincasadabenedetta.it',
  'www.cucchiaio.it',
  'www.misya.info',
  'www.lacucinaitaliana.it',
  'www.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com'
])

const ua = {
  'User-Agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/124 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'it-IT,it;q=0.9,en;q=0.8'
}

const urls = (await fs.readFile(listFile, 'utf8'))
  .split(/\r?\n/).map(s => s.trim()).filter(Boolean)

const out = []
for (const url of urls) {
  const one = await importOne(url).catch(e => ({ error: String(e), url }))
  if (!one) continue
  if (one.error) {
    console.error('Errore su', url, one.error)
    continue
  }
  out.push(one)
}

console.log(JSON.stringify(out, null, 2))

async function importOne(u) {
  let url
  try {
    url = new URL(u)
  } catch {
    throw new Error('URL non valido')
  }
  if (!ALLOWED.has(url.hostname)) throw new Error('Dominio non permesso')

  const res = await fetch(url, { headers: ua, redirect: 'follow' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const html = await res.text()

  const fromLD = extractFromLD(html)
  const fromMicro = fromLD || extractFromMicro(html)
  const fromHeur = fromMicro || extractHeur(html)

  const base = fromHeur || {}
  const title = base.title || ''
  const image = absolutize(base.image || '', url)
  const videoId = ytId(base.video || '')

  const ingredients = toArray(base.ingredients).map(s => s.trim()).filter(Boolean)
  const steps = toArray(base.steps).map(s => s.trim()).filter(Boolean)

  const rec = {
    id: slug(title),
    title: title,
    time: Number.isFinite(base.time) ? base.time : undefined,
    servings: Number.isFinite(base.servings) ? base.servings : undefined,
    tags: [],
    image: image || 'assets/icons/icon-512.png',
    ingredients: normalizeIngredients(ingredients),
    steps: steps,
    url: url.toString(),
    video: videoId || ''
  }
  Object.keys(rec).forEach(k => rec[k] === undefined && delete rec[k])
  if (!rec.title || !rec.ingredients?.length || !rec.steps?.length) {
    throw new Error('Estrazione incompleta')
  }
  return rec
}

function extractFromLD(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  for (const m of scripts) {
    const raw = safeJSON(m[1])
    if (!raw) continue
    const nodes = Array.isArray(raw) ? raw
      : [raw, ...(raw.graph || []), ...(raw['@graph'] || [])]
    for (const n of nodes) {
      if (!n || typeof n !== 'object') continue
      const t = String(n['@type'] || '').toLowerCase()
      if (!t.includes('recipe')) continue
      const ing = arr(n.recipeIngredient)
      const steps = stepsFromLD(n.recipeInstructions)
      const time = minutesFromISO(n.totalTime || n.cookTime || n.prepTime)
      const img = pickFirst(n.image)
      const title = n.name || ''
      const video = n?.video?.embedUrl || n?.video?.contentUrl || n?.video?.url || ''
      return { title, image: img, ingredients: ing, steps, time, servings: numFrom(n.recipeYield), video }
    }
  }
  return null
}

function extractFromMicro(html) {
  const has = /itemtype=["'][^"']*schema\.org\/Recipe["']/i.test(html)
  if (!has) return null
  const title = pickAttr(html, /itemprop=["']name["'][^>]*>([^<]+)</i)
  const image = pickAttr(html, /itemprop=["']image["'][^>]*content=["']([^"']+)["']/i) || pickAttr(html, /itemprop=["']image["'][^>]*src=["']([^"']+)["']/i)
  const yieldTxt = pickAttr(html, /itemprop=["']recipeYield["'][^>]*content=["']([^"']+)["']/i) || pickAttr(html, /itemprop=["']recipeYield["'][^>]*>([^<]+)</i)
  const timeTxt = pickAttr(html, /itemprop=["']totalTime["'][^>]*content=["']([^"']+)["']/i) || pickAttr(html, /itemprop=["']totalTime["'][^>]*>([^<]+)</i)
  const ingredients = [...html.matchAll(/itemprop=["']recipeIngredient["'][^>]*>([^<]+)</gi)].map(m => m[1].trim())
  const steps = [...html.matchAll(/itemprop=["']recipeInstructions["'][^>]*>([^<]+)</gi)].map(m => m[1].trim())
  return {
    title,
    image,
    ingredients,
    steps,
    time: minutesFromISO(timeTxt),
    servings: numFrom(yieldTxt)
  }
}

function extractHeur(html) {
  const title = pickMeta(html, 'og:title') || pickH1(html)
  const image = pickMeta(html, 'og:image')
  const video = pickMeta(html, 'og:video') || firstIframeYouTube(html)
  const ingredients = bestList(html, /(g|ml|uova|olio|burro|farina|pomodoro|pasta|pepe|cipoll|aglio)/i)
  const steps = bestList(html, /(cuoci|versa|mescola|aggiungi|soffrigg|tosta|manteca|inforna|lessa|sbatti|taglia)/i)
  return { title, image, ingredients, steps, video }
}

/* helpers parsing */

function safeJSON(txt) {
  try { return JSON.parse(txt) } catch { return null }
}
function arr(x) { return Array.isArray(x) ? x : (x ? [x] : []) }
function stepsFromLD(val) {
  const a = arr(val)
  const out = []
  for (const v of a) {
    if (!v) continue
    if (typeof v === 'string') out.push(v)
    else if (typeof v === 'object') {
      if (v.text) out.push(String(v.text))
      else if (Array.isArray(v.itemListElement)) out.push(...v.itemListElement.map(i => i.text || '').filter(Boolean))
    }
  }
  return out
}
function minutesFromISO(s) {
  if (!s) return undefined
  const m = String(s).match(/PT(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!m) return undefined
  const h = parseInt(m[1] || '0', 10)
  const mi = parseInt(m[2] || '0', 10)
  return h * 60 + mi
}
function numFrom(s) {
  const m = String(s || '').match(/\d+/)
  return m ? parseInt(m[0], 10) : undefined
}
function pickFirst(v) {
  if (!v) return ''
  if (Array.isArray(v)) return v[0] || ''
  if (typeof v === 'object') return v.url || v.contentUrl || v.src || ''
  return String(v)
}
function pickMeta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${escapeReg(name)}["'][^>]+content=["']([^"']+)["']`, 'i')
  const m = html.match(re)
  return m ? m[1] : ''
}
function pickH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (!m) return ''
  return stripTags(m[1]).trim()
}
function stripTags(s) { return String(s).replace(/<[^>]*>/g, '') }
function bestList(html, wordRe) {
  const lists = [...html.matchAll(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi)]
  const scored = lists.map(m => {
    const items = [...m[2].matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map(x => stripTags(x[1]).trim()).filter(Boolean)
    const score = items.filter(t => wordRe.test(t)).length
    return { items, score }
  }).sort((a, b) => b.score - a.score)
  return scored[0]?.items || []
}
function firstIframeYouTube(html) {
  const m = html.match(/<iframe[^>]+src=["']([^"']+youtube[^"']+)["']/i)
  return m ? m[1] : ''
}
function ytId(u) {
  if (!u) return ''
  try {
    const x = new URL(u)
    if (x.hostname === 'youtu.be') return x.pathname.split('/')[1] || ''
    if (x.hostname.includes('youtube')) {
      if (x.pathname === '/watch') return x.searchParams.get('v') || ''
      if (x.pathname.startsWith('/embed/')) return x.pathname.split('/')[2] || ''
      if (x.pathname.startsWith('/shorts/')) return x.pathname.split('/')[2] || ''
    }
    return ''
  } catch { return '' }
}
function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
}
function escapeReg(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function absolutize(src, base) {
  if (!src) return ''
  try {
    const u = new URL(src, base)
    return u.toString()
  } catch { return src }
}
function toArray(x) { return Array.isArray(x) ? x : (x ? [x] : []) }
function normalizeIngredients(arr) {
  return arr.map(line => {
    const m = line.match(/^(\d+(?:[.,]\d+)?)\s*(g|gr|grammi|kg|ml|cl|l|uova|pz|fette|spicchio|spicchi|cucchiaini?|cucchiai?)?\s*(.*)$/i)
    if (m) {
      const qty = m[1].replace(',', '.')
      const unit = (m[2] || '').toLowerCase()
      const name = (m[3] || '').trim()
      return { ref: slug(name).replace(/-/g, ' '), qty: isNaN(Number(qty)) ? String(qty) : Number(qty), unit }
    }
    return { ref: slug(line).replace(/-/g, ' ') }
  })
}
function pickAttr(html, re) {
  const m = html.match(re)
  return m ? stripTags(m[1]) : ''
}
