import * as cheerio from 'cheerio'

export function match(url) {
  try {
    const u = new URL(url)
    return /(^|\.)cucchiaio\.it$/.test(u.hostname) && /\/ricetta\//.test(u.pathname)
  } catch {
    return false
  }
}

const clean = s => (s || '').toString().replace(/\s+/g, ' ').trim()

function readJsonLd($) {
  const recipes = []
  $('script[type="application/ld+json"]').each((_, el) => {
    let txt = $(el).contents().text()
    if (!txt) return
    try {
      const data = JSON.parse(txt)
      const flat = Array.isArray(data) ? data : [data]
      for (const node of flat) {
        collectRecipeNodes(node, recipes)
      }
    } catch {
      // ignora blocchi JSON non validi
    }
  })
  return recipes[0] || null
}

function collectRecipeNodes(node, out) {
  if (!node || typeof node !== 'object') return
  const type = Array.isArray(node['@type']) ? node['@type'] : [node['@type']]
  if (type.includes('Recipe')) {
    out.push(node)
  }
  for (const k of Object.keys(node)) {
    const v = node[k]
    if (Array.isArray(v)) v.forEach(x => collectRecipeNodes(x, out))
    else if (v && typeof v === 'object') collectRecipeNodes(v, out)
  }
}

function fromJsonLd(r, url) {
  if (!r) return null
  const getSteps = v => {
    if (!v) return []
    if (typeof v === 'string') return clean(v).split(/\. (?=[A-ZÀ-Ú])/).map(s => clean(s)).filter(Boolean)
    if (Array.isArray(v)) {
      return v.map(x => {
        if (!x) return ''
        if (typeof x === 'string') return clean(x)
        if (x.text) return clean(x.text)
        if (x.name) return clean(x.name)
        return ''
      }).filter(Boolean)
    }
    if (v.text) return clean(v.text).split(/\n+|\. (?=[A-ZÀ-Ú])/).map(s => clean(s)).filter(Boolean)
    return []
  }

  const image = Array.isArray(r.image) ? r.image[0] : r.image || (r.image?.url) || ''
  const ingredients = (r.recipeIngredient || []).map(x => clean(x)).filter(Boolean)
  const steps = getSteps(r.recipeInstructions)

  if (!clean(r.name) || ingredients.length === 0) return null

  return {
    id: Buffer.from(url).toString('base64').slice(0, 24),
    title: clean(r.name),
    image: clean(image),
    servings: Number.parseInt(r.recipeYield?.toString().replace(/\D+/g, ''), 10) || 0,
    prepTime: 0,
    cookTime: 0,
    difficulty: '',
    category: [],
    tags: [],
    ingredients,
    steps,
    sourceUrl: url,
    youtubeId: ''
  }
}

// Raccoglie nodi e restituisce SEMPRE una collezione Cheerio
function pickAll($, selectors) {
  const nodes = []
  for (const sel of selectors) $(sel).each((_, el) => nodes.push(el))
  return $(nodes)
}

export function parse(html, url) {
  const $ = cheerio.load(html)

  // 1) Prova JSON-LD
  const ld = fromJsonLd(readJsonLd($), url)
  if (ld) return ld

  // 2) Fallback HTML
  const title =
    clean($('h1[itemprop="name"]').first().text()) ||
    clean($('meta[property="og:title"]').attr('content')) ||
    clean($('h1').first().text())

  const ingrEls = pickAll($, [
    '[itemprop="recipeIngredient"]',
    '.ingredienti li',
    '.ingredients li',
    '.scheda-ingredienti li',
    'ul.ingredienti li',
    'ul li.ingredienti__list__item',
    '.field--name-field-ingredienti li',
    '.entry-ingredients li'
  ])
  const ingredients = []
  ingrEls.each((_, el) => {
    const t = clean($(el).text())
    if (t) ingredients.push(t)
  })

  const stepEls = pickAll($, [
    '[itemprop="recipeInstructions"] li',
    '[itemprop="recipeInstructions"] p',
    '.preparazione ol li',
    '.preparazione li',
    '.preparazione p',
    '.steps li',
    '.steps p',
    '.procedimento li',
    '.procedimento p',
    '.entry-instructions li',
    '.entry-instructions p'
  ])
  const steps = []
  stepEls.each((_, el) => {
    const t = clean($(el).text())
    if (t) steps.push(t)
  })

  const image =
    $('meta[property="og:image"]').attr('content') ||
    $('img[itemprop="image"]').attr('src') ||
    $('article img').first().attr('src') ||
    ''

  if (!title || ingredients.length === 0) {
    throw new Error('VALIDATION_MIN_FAIL')
  }

  return {
    id: Buffer.from(url).toString('base64').slice(0, 24),
    title,
    image: clean(image),
    servings: 0,
    prepTime: 0,
    cookTime: 0,
    difficulty: '',
    category: [],
    tags: [],
    ingredients,
    steps,
    sourceUrl: url,
    youtubeId: ''
  }
}
