import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import * as cheerio from 'cheerio'
import { parse as parseCucchiaio, match as matchCucchiaio } from './parsers/cucchiaio.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const AJSON = p => path.join(ROOT, 'assets', 'json', p)
const CACHE_DIR = path.join(ROOT, '.cache', 'html')

fs.mkdirSync(CACHE_DIR, { recursive: true })

const SOURCES_FILE = AJSON('recipes-index.jsonl')
const URLS_SEED_FILE = AJSON('urls_last.json')
const OUT_TMP = AJSON('recipes-it.tmp.jsonl')
const LAST_LOG = AJSON('crawl_last.json')

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 Chrome/120 RLS-Crawler/1.3',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
  'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1'
}

function sleep (ms) {
  return new Promise(r => setTimeout(r, ms))
}

async function fetchHtml (url, tries = 3) {
  let lastErr = null
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP_${res.status}`)
      return await res.text()
    } catch (e) {
      lastErr = e
      await sleep(400 + i * 400)
    }
  }
  throw lastErr || new Error('FETCH_FAIL')
}

/* ---------- IO sicure ---------- */

function safeReadJsonl (file) {
  if (!fs.existsSync(file)) return []
  const text = fs.readFileSync(file, 'utf8')
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0)
  const out = []
  for (const line of lines) {
    try {
      out.push(JSON.parse(line))
    } catch {
      // ignora riga corrotta o troncata
    }
  }
  return out
}

function safeReadJson (file, fallback) {
  if (!fs.existsSync(file)) return fallback
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return fallback
  }
}

function pushJsonl (file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8')
}

/* ---------- logica crawler ---------- */

function pickParser (url) {
  if (matchCucchiaio(url)) return { parse: parseCucchiaio }
  return null
}

function isRecipeUrl (url) {
  return !/\.xml($|\?)/i.test(url)
}

async function expandSitemapsToPages (urls) {
  const pages = []
  for (const u of urls) {
    try {
      if (!/\.xml($|\?)/i.test(u)) {
        if (pickParser(u)) pages.push(u)
        continue
      }
      const xml = await fetchHtml(u)
      const $ = cheerio.load(xml, { xmlMode: true })
      $('url loc').each((_, el) => {
        const loc = $(el).text().trim()
        if (loc && isRecipeUrl(loc) && pickParser(loc)) pages.push(loc)
      })
      $('sitemap loc').each((_, el) => {
        const loc = $(el).text().trim()
        if (loc) pages.push(loc)
      })
    } catch {
      // continua
    }
  }
  return Array.from(new Set(pages)).slice(0, 200)
}

async function main () {
  const ts = new Date().toISOString()

  // sorgenti sitemap in JSONL tollerante
  const idx = safeReadJsonl(SOURCES_FILE).map(x => x.url).filter(Boolean)

  // seed da urls_last.json che è un array JSON
  const urlsSeed = safeReadJson(URLS_SEED_FILE, [])

  const start = Array.from(new Set([...(idx || []), ...(urlsSeed || [])]))

  // niente start, esci pulito
  if (start.length === 0) {
    const runEmpty = { ts, processed: 0, ok: 0, skipped: 0, failed: 0, errors: [], note: 'no-start-urls' }
    fs.writeFileSync(LAST_LOG, JSON.stringify(runEmpty, null, 2))
    console.log(JSON.stringify(runEmpty))
    return
  }

  const candidatePages = await expandSitemapsToPages(start)

  if (fs.existsSync(OUT_TMP)) fs.unlinkSync(OUT_TMP)
  const run = { ts, processed: 0, ok: 0, skipped: 0, failed: 0, errors: [] }

  for (const url of candidatePages) {
    run.processed += 1
    const parser = pickParser(url)
    if (!parser) {
      run.skipped += 1
      continue
    }
    try {
      const html = await fetchHtml(url, 2)
      const snap = path.join(CACHE_DIR, Buffer.from(url).toString('base64').slice(0, 40) + '.html')
      fs.writeFileSync(snap, html, 'utf8')

      const recipe = parser.parse(html, url)
      if (!recipe?.title || !(recipe?.ingredients || []).length) throw new Error('VALIDATION_MIN_FAIL')

      pushJsonl(OUT_TMP, recipe)
      run.ok += 1
      await sleep(120)
    } catch (e) {
      run.failed += 1
      run.errors.push({ url, error: String(e?.message || e) })
      await sleep(120)
    }
  }

  fs.writeFileSync(LAST_LOG, JSON.stringify(run, null, 2))
  console.log(JSON.stringify(run))
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
