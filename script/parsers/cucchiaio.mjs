// script/parsers/cucchiaio.mjs
// Parser per https://www.cucchiaio.it/
// Strategia: legge JSON-LD Recipe nei <script type="application/ld+json">
// Nessuna dipendenza esterna

import { readFile } from 'node:fs/promises'

function safeJsonParse(str) {
  try {
    return JSON.parse(str)
  } catch {
    // alcuni siti mettono array o più oggetti concatenati
    try {
      const fixed = str
        .replace(/[\u0000-\u001f]+/g, '')
        .replace(/,\s*]/g, ']')
        .replace(/,\s*}/g, '}')
      return JSON.parse(fixed)
    } catch {
      return null
    }
  }
}

function pickRecipe(nodes) {
  if (!nodes) return null
  const arr = Array.isArray(nodes) ? nodes : [nodes]
  for (const n of arr) {
    if (!n) continue
    if (typeof n === 'object' && (n['@type'] === 'Recipe' || (Array.isArray(n['@type']) && n['@type'].includes('Recipe')))) {
      return n
    }
    // @graph
    if (Array.isArray(n['@graph'])) {
      const hit = n['@graph'].find(x => x && (x['@type'] === 'Recipe' || (Array.isArray(x['@type']) && x['@type'].includes('Recipe'))))
      if (hit) return hit
    }
  }
  return null
}

function isoToMinutes(iso) {
  if (!iso) return 0
  // ISO 8601 duration es. PT1H30M
  const m = String(iso).match(/P(T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i)
  if (!m) return 0
  const h = Number(m[2] || 0)
  const min = Number(m[3] || 0)
  const s = Number(m[4] || 0)
  return h * 60 + min + Math.round(s / 60)
}

function normalizeQuantity(text) {
  const t = String(text || '').trim()
  if (!t) return { qty: 1, unit: '' }
  // prova a separare numero e unità
  const m = t.match(/^([\d.,/]+)\s*(.*)$/)
  if (!m) return { qty: 1, unit: t }
  let qty = m[1].replace(',', '.')
  if (qty.includes('/')) {
    const [a, b] = qty.split('/').map(Number)
    if (a && b) qty = a / b
  }
  return { qty: Number(qty) || 1, unit: m[2].trim() }
}

function tokenizeIngredient(line) {
  const s = String(line || '').replace(/\s+/g, ' ').trim()
  if (!s) return null
  // spesso formato: "200 g spaghetti" oppure "spaghetti 200 g"
  const front = s.match(/^([\d.,/]+\s*[^\s]+)\s+(.*)$/)
  if (front) {
    const { qty, unit } = normalizeQuantity(front[1])
    return { name: front[2], quantity: qty, unit }
  }
  const tail = s.match(/^(.*)\s+([\d.,/]+\s*[^\s]+)$/)
  if (tail) {
    const { qty, unit } = normalizeQuantity(tail[2])
    return { name: tail[1], quantity: qty, unit }
  }
  return { name: s, quantity: 1, unit: '' }
}

export function parseFromHtml(html, url) {
  const scripts = []
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let m
  while ((m = re.exec(html))) {
    const raw = m[1]
      .replace(/<!--[\s\S]*?-->/g, '')
      .trim()
    if (!raw) continue
    const json = safeJsonParse(raw)
    if (json) scripts.push(json)
  }

  const recipe = pickRecipe(scripts)
  if (!recipe) {
    return null
  }

  const title = String(recipe.name || '').trim()
  const image = Array.isArray(recipe.image) ? recipe.image[0] : recipe.image || ''
  const prepTime = isoToMinutes(recipe.prepTime)
  const cookTime = isoToMinutes(recipe.cookTime)
  const totalTime = isoToMinutes(recipe.totalTime)
  const servings = Number(recipe.recipeYield || 0) || 0
  const keywords = []
  if (recipe.recipeCategory) keywords.push(...(Array.isArray(recipe.recipeCategory) ? recipe.recipeCategory : [recipe.recipeCategory]))
  if (recipe.recipeCuisine) keywords.push(...(Array.isArray(recipe.recipeCuisine) ? recipe.recipeCuisine : [recipe.recipeCuisine]))
  if (recipe.keywords) keywords.push(...String(recipe.keywords).split(',').map(s => s.trim()).filter(Boolean))

  const ing = []
  const srcIngr = recipe.recipeIngredient || recipe.ingredients || []
  for (const line of Array.isArray(srcIngr) ? srcIngr : [srcIngr]) {
    const obj = tokenizeIngredient(line)
    if (obj) ing.push(obj)
  }

  const steps = []
  const inst = recipe.recipeInstructions || []
  const flat = Array.isArray(inst) ? inst : [inst]
  for (const it of flat) {
    if (!it) continue
    if (typeof it === 'string') {
      const s = it.trim()
      if (s) steps.push(s)
    } else if (typeof it === 'object') {
      if (Array.isArray(it.itemListElement)) {
        for (const el of it.itemListElement) {
          const s = (el && (el.text || el.name)) ? String(el.text || el.name).trim() : ''
          if (s) steps.push(s)
        }
      } else {
        const s = String(it.text || it.name || '').trim()
        if (s) steps.push(s)
      }
    }
  }

  let youtubeId = ''
  const video = recipe.video || {}
  const vurl = typeof video === 'string' ? video : video.contentUrl || video.url || ''
  if (vurl) {
    const u = new URL(vurl, url)
    if (u.hostname.includes('youtube.com')) youtubeId = u.searchParams.get('v') || ''
    if (u.hostname === 'youtu.be') youtubeId = u.pathname.slice(1)
  }

  const id = (title || url)
    .toLowerCase()
    .replace(/https?:\/\//, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')

  return {
    id,
    title,
    description: String(recipe.description || '').trim(),
    image,
    servings,
    prepTime: prepTime || (totalTime && !cookTime ? totalTime : 0),
    cookTime,
    difficulty: 'easy',
    category: [],
    ingredients: ing,
    steps,
    tags: Array.from(new Set(keywords.map(s => s.toLowerCase()))),
    sourceUrl: url,
    youtubeId
  }
}

// debug locale
if (import.meta.url === `file://${process.argv[1]}` && process.argv[2]) {
  const html = await readFile(process.argv[2], 'utf8')
  const res = parseFromHtml(html, 'https://www.cucchiaio.it/')
  console.log(JSON.stringify(res, null, 2))
}
