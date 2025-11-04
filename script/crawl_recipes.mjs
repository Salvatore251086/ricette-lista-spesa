// script/crawl_recipes.mjs
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import { validateRecipe } from './validator.mjs'
import sources from '../assets/json/sources.json' assert { type: 'json' }
import { parse as parseCucchiaio, match as matchCucchiaio } from './parsers/cucchiaio.mjs'
import * as Cucchiaio from './parsers/cucchiaio.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Registriamo i parser disponibili
const PARSERS = [
  { match: matchCucchiaio, parse: parseCucchiaio }
]

// cartelle di lavoro
const CACHE_DIR = path.join(__dirname, '../assets/json/.cache')
const FAIL_HTML_DIR = path.join(CACHE_DIR, 'fail_html')
const FAIL_JSON_DIR = path.join(CACHE_DIR, 'fail_json')
for (const d of [CACHE_DIR, FAIL_HTML_DIR, FAIL_JSON_DIR]) {
  fs.mkdirSync(d, { recursive: true })
}

const UA =
  'RLS-Crawler/1.1 (+https://github.com/)' // user agent “pulito”
const HEADERS = {
  'User-Agent': UA,
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache'
}

const MAX_RETRIES = 2
const RETRY_STATUSES = new Set([403, 429, 500, 502, 503, 504])

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchPage(url) {
  let lastErr
  for (let i = 0; i <= MAX_RETRIES; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' })
      if (!res.ok) {
        if (RETRY_STATUSES.has(res.status) && i < MAX_RETRIES) {
          await sleep(500 + i * 500)
          continue
        }
        throw new Error(`HTTP_${res.status}`)
      }
      return await res.text()
    } catch (e) {
      lastErr = e
      if (i < MAX_RETRIES) {
        await sleep(500 + i * 500)
        continue
      }
    }
  }
  throw lastErr
}

function pickParser(url) {
  return PARSERS.find(p => p.match(url))
}

function recipeToMinimal(r) {
  return {
    id: r.id,
    title: r.title,
    image: r.image || '',
    servings: r.servings || 0,
    prepTime: r.prepTime || 0,
    cookTime: r.cookTime || 0,
    difficulty: r.difficulty || '',
    category: r.category || [],
    tags: r.tags || [],
    ingredients: r.ingredients || [],
    steps: r.steps || [],
    sourceUrl: r.sourceUrl,
    youtubeId: r.youtubeId || ''
  }
}

async function processUrl(url) {
  const parser = pickParser(url)
  if (!parser) return { status: 'skipped', reason: 'NO_PARSER' }

  try {
    const html = await fetchPage(url)
    const recipe = parser.parse(html, url)
    const { ok, errors } = validateRecipe(recipe)
    if (!ok) {
      dumpFailure(url, html, { reason: 'VALIDATION_MIN_FAIL', errors, recipe })
      return { status: 'failed', reason: 'VALIDATION_MIN_FAIL' }
    }
    return { status: 'ok', recipe: recipeToMinimal(recipe) }
  } catch (e) {
    dumpFailure(url, null, { reason: e.message || 'PARSE_ERROR' })
    return { status: 'failed', reason: e.message || 'PARSE_ERROR' }
  }
}

function safeSlug(url) {
  return Buffer.from(url).toString('base64').replace(/=+$/, '')
}

function dumpFailure(url, html, meta) {
  const slug = safeSlug(url)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  if (html) {
    fs.writeFileSync(path.join(FAIL_HTML_DIR, `${stamp}.${slug}.html`), html)
  }
  fs.writeFileSync(
    path.join(FAIL_JSON_DIR, `${stamp}.${slug}.json`),
    JSON.stringify({ url, ...meta }, null, 2)
  )
}

function readSeedUrls() {
  // usa assets/json/recipes-index.jsonl e/o urls_last.json
  const idxFile = path.join(__dirname, '../assets/json/recipes-index.jsonl')
  const lastFile = path.join(__dirname, '../assets/json/urls_last.json')
  const urls = new Set()

  if (fs.existsSync(idxFile)) {
    const lines = fs.readFileSync(idxFile, 'utf-8').split(/\r?\n/).filter(Boolean)
    for (const line of lines) {
      try {
        const o = JSON.parse(line)
        if (o.url) urls.add(o.url)
      } catch { /* ignore */ }
    }
  }
  if (fs.existsSync(lastFile)) {
    try {
      const arr = JSON.parse(fs.readFileSync(lastFile, 'utf-8'))
      arr.forEach(u => urls.add(u))
    } catch { /* ignore */ }
  }
  return Array.from(urls)
}

async function main() {
  const seed = readSeedUrls()
  let ok = 0, failed = 0, skipped = 0
  const added = []

  for (const url of seed) {
    const r = await processUrl(url)
    if (r.status === 'ok') {
      ok++
      added.push(r.recipe)
    } else if (r.status === 'skipped') {
      skipped++
    } else {
      failed++
    }
  }

  // scrive un merge “grezzo” in assets/json/recipes-it.json
  const outFile = path.join(__dirname, '../assets/json/recipes-it.json')
  let current = { recipes: [] }
  if (fs.existsSync(outFile)) {
    try { current = JSON.parse(fs.readFileSync(outFile, 'utf-8')) } catch { /* noop */ }
  }
  const seen = new Set(current.recipes.map(x => x.sourceUrl))
  for (const r of added) {
    if (!seen.has(r.sourceUrl)) {
      current.recipes.push(r)
      seen.add(r.sourceUrl)
    }
  }
  fs.writeFileSync(outFile, JSON.stringify(current, null, 2))

  console.log(JSON.stringify({
    ts: new Date().toISOString(),
    processed: seed.length,
    ok, skipped, failed,
    cache: {
      fail_html: fs.existsSync(FAIL_HTML_DIR) ? fs.readdirSync(FAIL_HTML_DIR).length : 0,
      fail_json: fs.existsSync(FAIL_JSON_DIR) ? fs.readdirSync(FAIL_JSON_DIR).length : 0
    }
  }))
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
