// script/parsers/cucchiaio.mjs
// Parser per https://www.cucchiaio.it/ricetta/* che legge il JSON-LD di tipo Recipe

import assert from 'node:assert/strict'

export function match(url) {
  return /\/\/www\.cucchiaio\.it\/ricetta\//i.test(url)
}

export async function parse({ url, html, fetchHtml }) {
  // html può già essere passato dal crawler. Se manca, scarica.
  const page = html || await fetchHtml(url)

  // Estrai tutti i blocchi <script type="application/ld+json">
  const ldBlocks = []
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(page)) !== null) {
    const raw = m[1].trim()
    // In molte pagine ci sono più JSON nello stesso script, prova parse sicuro
    try {
      const json = JSON.parse(raw)
      ldBlocks.push(json)
    } catch {
      // Ci sono casi con più oggetti concatenati. Prova a ripulire le virgole finali.
      try {
        const safe = raw
          .replace(/,\s*]/g, ']')
          .replace(/,\s*}/g, '}')
        const json = JSON.parse(safe)
        ldBlocks.push(json)
      } catch {
        // ignoriamo blocco non parseabile
      }
    }
  }

  // Cerca il nodo di tipo Recipe dentro a grafi o array
  const flat = flatten(ldBlocks)
  const recipeNode = flat.find(n => typeIs(n, 'Recipe'))
  assert(recipeNode, 'Recipe JSON-LD non trovato')

  // Campi base
  const title = str(recipeNode.name) || str(recipeNode.headline) || ''
  const image = firstImage(recipeNode.image) || ''
  const ingredients = toArray(recipeNode.recipeIngredient)
    .map(x => String(x).trim())
    .filter(Boolean)

  // I passi possono essere array di HowToStep, HowToSection o testo semplice
  const steps = extractSteps(recipeNode)

  // Porzioni e tempi
  const servings = parseIntOnly(recipeNode.recipeYield)
  const prepTime = isoDurToMinutes(recipeNode.prepTime)
  const cookTime = isoDurToMinutes(recipeNode.cookTime)
  const totalTime = isoDurToMinutes(recipeNode.totalTime) || minutesSum(prepTime, cookTime)

  // Video, se YouTube
  const youtubeId = extractYouTubeId(recipeNode.video)

  return {
    id: genId(url, title),
    title,
    image,
    servings: Number.isFinite(servings) ? servings : 0,
    prepTime,
    cookTime,
    totalTime,
    difficulty: 'easy',
    category: [],
    tags: [],
    ingredients,
    steps,
    sourceUrl: url,
    youtubeId
  }
}

/* Helpers */

function flatten(obj) {
  const out = []
  const stack = toArray(obj)
  while (stack.length) {
    const x = stack.shift()
    if (!x || typeof x !== 'object') continue
    out.push(x)
    // common containers
    toArray(x['@graph']).forEach(n => stack.push(n))
    toArray(x.itemListElement).forEach(n => stack.push(n))
    toArray(x.partOfSeries).forEach(n => stack.push(n))
    toArray(x.hasPart).forEach(n => stack.push(n))
  }
  return out
}

function typeIs(node, t) {
  const v = node && node['@type']
  if (!v) return false
  if (Array.isArray(v)) return v.map(String).some(s => eq(s, t))
  return eq(String(v), t)
}

function eq(a, b) { return a.toLowerCase() === b.toLowerCase() }
function toArray(v) { return Array.isArray(v) ? v : v ? [v] : [] }
function str(v) { return typeof v === 'string' ? v.trim() : '' }

function firstImage(img) {
  if (!img) return ''
  if (typeof img === 'string') return img
  if (Array.isArray(img)) {
    const first = img[0]
    return typeof first === 'string' ? first : str(first && first.url)
  }
  return str(img.url)
}

function extractSteps(node) {
  const out = []
  const inst = toArray(node.recipeInstructions)
  for (const it of inst) {
    if (!it) continue
    if (typeof it === 'string') {
      // testualone unico, splitta per punti o newline
      textToSteps(it).forEach(s => out.push(s))
      continue
    }
    if (Array.isArray(it)) {
      it.forEach(x => stepsFromNode(x).forEach(s => out.push(s)))
      continue
    }
    stepsFromNode(it).forEach(s => out.push(s))
  }
  // dedup e pulizia
  return out.map(s => s.trim()).filter(Boolean)
}

function stepsFromNode(n) {
  const res = []
  // HowToSection con itemListElement
  if (typeIs(n, 'HowToSection')) {
    toArray(n.itemListElement).forEach(x => {
      res.push(...stepsFromNode(x))
    })
    return res
  }
  // HowToStep o simile
  const txt = str(n.text) || str(n.name) || str(n.description)
  if (txt) return textToSteps(txt)
  return []
}

function textToSteps(text) {
  // normalizza e spezza
  const raw = text.replace(/\r/g, '\n').split(/\n+/)
  const lines = raw
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  if (lines.length > 1) return lines
  // se è una singola riga lunga, prova a spezzare su punto
  return text.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean)
}

function parseIntOnly(v) {
  if (!v) return NaN
  const m = String(v).match(/\d+/)
  return m ? Number(m[0]) : NaN
}

function isoDurToMinutes(iso) {
  if (!iso || typeof iso !== 'string') return 0
  // Supporta formati tipo PT1H30M, PT45M, PT2H
  const m = iso.match(/P(T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i)
  if (!m) return 0
  const h = Number(m[2] || 0)
  const min = Number(m[3] || 0)
  return h * 60 + min
}

function minutesSum(a, b) {
  const x = (Number(a) || 0) + (Number(b) || 0)
  return x || 0
}

function extractYouTubeId(video) {
  const v = toArray(video)[0]
  if (!v) return ''
  const urls = [v.embedUrl, v.contentUrl, v.url].map(str).filter(Boolean)
  for (const u of urls) {
    const id = ytId(u)
    if (id) return id
  }
  return ''
}

function ytId(u) {
  try {
    const url = new URL(u)
    if (/youtu\.be$/i.test(url.hostname)) return url.pathname.slice(1)
    if (/youtube\.com$/i.test(url.hostname)) {
      if (url.searchParams.get('v')) return url.searchParams.get('v')
      const m = url.pathname.match(/\/embed\/([^/]+)/)
      if (m) return m[1]
    }
    return ''
  } catch {
    return ''
  }
}

function genId(url, title) {
  const base = str(title) || url
  return hash(base.toLowerCase())
}

function hash(s) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // restituisci esadecimale corto
  return Math.abs(h >>> 0).toString(16)
}
