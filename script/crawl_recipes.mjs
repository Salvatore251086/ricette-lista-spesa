import fs from 'fs' import path from 'path' import { fileURLToPath } from 'url' import * as cheerio from 'cheerio' import { parse as parseCucchiaio, match as matchCucchiaio } from './parsers/cucchiaio.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url)) const ROOT = path.join(__dirname, '..') const AJSON = p => path.join(ROOT, 'assets', 'json', p) const CACHE_DIR = path.join(ROOT, '.cache', 'html')

fs.mkdirSync(CACHE_DIR, { recursive: true })

const SOURCES_FILE = AJSON('recipes-index.jsonl') const URLS_SEED_FILE = AJSON('urls_last.json') const OUT_TMP = AJSON('recipes-it.tmp.jsonl') const LAST_LOG = AJSON('crawl_last.json')

const HEADERS = { 'User-Agent': 'Mozilla/5.0 Chrome/120 RLS-Crawler/1.4', 'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9', 'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache', 'Upgrade-Insecure-Requests': '1' }

function sleep (ms) { return new Promise(r => setTimeout(r, ms)) }

async function fetchHtml (url, tries = 3) { let lastErr = null for (let i = 0; i < tries; i++) { try { const res = await fetch(url, { headers: HEADERS, redirect: 'follow' }) if (!res.ok) throw new Error(HTTP_${res.status}) return await res.text() } catch (e) { lastErr = e await sleep(400 + i * 400) } } throw lastErr || new Error('FETCH_FAIL') }

function safeReadJsonl (file) { if (!fs.existsSync(file)) return [] const text = fs.readFileSync(file, 'utf8') const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0) const out = [] for (const line of lines) { try { out.push(JSON.parse(line)) } catch {} } return out }

function safeReadJson (file, fallback) { if (!fs.existsSync(file)) return fallback try { return JSON.parse(fs.readFileSync(file, 'utf8')) } catch { return fallback } }

function pushJsonl (file, obj) { fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8') }

function pickParser (url) { if (matchCucchiaio(url)) return { parse: parseCucchiaio, site: 'cucchiaio' } return null }

function isXml (url) { return /.xml($|?)/i.test(url) }

function extractRecipeLinksFromHtml (html, baseUrl) { const $ = cheerio.load(html) const links = new Set() $('a[href]').each((_, a) => { let href = String($(a).attr('href') || '').trim() if (!href) return try { const u = new URL(href, baseUrl) const abs = u.toString() if (matchCucchiaio(abs)) links.add(abs) } catch {} }) return Array.from(links) }

async function expandToRecipePages (urls) { const pages = new Set() for (const u of urls) { try { if (isXml(u)) { const xml = await fetchHtml(u) const $ = cheerio.load(xml, { xmlMode: true }) $('url loc').each((, el) => { const loc = $(el).text().trim() if (loc && matchCucchiaio(loc)) pages.add(loc) }) $('sitemap loc').each((, el) => { const loc = $(el).text().trim() if (loc) pages.add(loc) }) } else { const html = await fetchHtml(u) for (const link of extractRecipeLinksFromHtml(html, u)) pages.add(link) } } catch {} } return Array.from(pages).slice(0, 400) }

async function main () { const ts = new Date().toISOString()

const idx = safeReadJsonl(SOURCES_FILE).map(x => x.url).filter(Boolean) const urlsSeed = safeReadJson(URLS_SEED_FILE, [])

const start = Array.from(new Set([...(idx || []), ...(urlsSeed || [])]))

if (start.length === 0) { const runEmpty = { ts, processed: 0, ok: 0, skipped: 0, failed: 0, errors: [], note: 'no-start-urls' } fs.writeFileSync(LAST_LOG, JSON.stringify(runEmpty, null, 2)) console.log(JSON.stringify(runEmpty)) return }

const candidatePages = await expandToRecipePages(start)

if (fs.existsSync(OUT_TMP)) fs.unlinkSync(OUT_TMP) const run = { ts, processed: 0, ok: 0, skipped: 0, failed: 0, errors: [] }

for (const url of candidatePages) { const parser = pickParser(url) if (!parser) { run.skipped += 1 continue } run.processed += 1 try { const html = await fetchHtml(url, 2) const snap = path.join(CACHE_DIR, Buffer.from(url).toString('base64').slice(0, 40) + '.html') fs.writeFileSync(snap, html, 'utf8')

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

fs.writeFileSync(LAST_LOG, JSON.stringify(run, null, 2)) console.log(JSON.stringify(run)) }

main().catch(e => { console.error(e) process.exit(1) })
