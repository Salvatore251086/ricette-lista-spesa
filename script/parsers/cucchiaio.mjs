import * as cheerio from 'cheerio'

export function match(url) {
  try {
    const u = new URL(url)
    return /(^|\.)cucchiaio\.it$/.test(u.hostname) && /\/ricetta\//.test(u.pathname)
  } catch {
    return false
  }
}

function textClean(s) {
  return (s || '').replace(/\s+/g, ' ').trim()
}

function pickAll($, selectors) {
  for (const sel of selectors) {
    const els = $(sel)
    if (els && els.length) return els
  }
  return []
}

export function parse(html, url) {
  const $ = cheerio.load(html)

  const title =
    textClean($('h1[itemprop="name"]').first().text()) ||
    textClean($('h1').first().text())

  const ingrEls = pickAll($, [
    '[itemprop="recipeIngredient"]',
    '.ingredienti li',
    '.ingredients li',
    '.scheda-ingredienti li',
    'ul li.ingredienti__list__item'
  ])
  const ingredients = []
  ingrEls.each((_, el) => {
    const t = textClean($(el).text())
    if (t) ingredients.push(t)
  })

  const stepEls = pickAll($, [
    '[itemprop="recipeInstructions"] li',
    '.preparazione ol li',
    '.preparazione li',
    '.steps li',
    '.procedimento li'
  ])
  const steps = []
  stepEls.each((_, el) => {
    const t = textClean($(el).text())
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
    image,
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
