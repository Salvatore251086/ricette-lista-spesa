import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as cheerio from 'cheerio';
import { parse as parseCucchiaio, match as matchCucchiaio } from './parsers/cucchiaio.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
// FIX percorso: rimuove '..' extra
const AJSON = p => path.join(ROOT, 'assets', 'json', p);
const CACHE_DIR = path.join(ROOT, '.cache', 'html');

fs.mkdirSync(CACHE_DIR, { recursive: true });

const SOURCES_FILE = AJSON('recipes-index.jsonl');
const OUT_TMP = AJSON('recipes-it.tmp.jsonl');
const LAST_LOG = AJSON('crawl_last.json');

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 Chrome/120 RLS-Crawler/1.2',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
  'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1'
};

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchHtml(url, tries = 3) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      return await res.text();
    } catch (e) {
      lastErr = e;
      await sleep(500 + i * 500);
    }
  }
  throw lastErr || new Error('FETCH_FAIL');
}

function pickParser(url) {
  if (matchCucchiaio(url)) return { parse: parseCucchiaio };
  return null;
}

function pushJsonl(file, obj) {
  fs.appendFileSync(file, JSON.stringify(obj) + '\n', 'utf8');
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l));
}

function isRecipeUrl(url) {
  return !/\.xml($|\?)/i.test(url);
}

async function expandSitemapsToPages(urls) {
  const pages = [];
  for (const u of urls) {
    try {
      if (!/\.xml($|\?)/i.test(u)) {
        pages.push(u);
        continue;
      }
      const xml = await fetchHtml(u);
      const $ = cheerio.load(xml, { xmlMode: true });
      $('url loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc && isRecipeUrl(loc)) pages.push(loc);
      });
      $('sitemap loc').each((_, el) => {
        const loc = $(el).text().trim();
        if (loc) pages.push(loc);
      });
    } catch {
      // ignore
    }
  }
  return Array.from(new Set(pages.filter(pickParser))).slice(0, 200);
}

async function main() {
  const ts = new Date().toISOString();
  const idx = readJsonl(SOURCES_FILE).map(x => x.url);
  const seed = readJsonl(AJSON('urls_last.json')).flat();
  const start = Array.from(new Set([...(idx || []), ...(seed || [])]));

  const candidatePages = await expandSitemapsToPages(start);

  if (fs.existsSync(OUT_TMP)) fs.unlinkSync(OUT_TMP);
  const run = { ts, processed: 0, ok: 0, skipped: 0, failed: 0, errors: [] };

  for (const url of candidatePages) {
    run.processed += 1;
    const parser = pickParser(url);
    if (!parser) {
      run.skipped += 1;
      continue;
    }
    try {
      const html = await fetchHtml(url, 2);
      const snap = path.join(CACHE_DIR, Buffer.from(url).toString('base64').slice(0, 40) + '.html');
      fs.writeFileSync(snap, html, 'utf8');

      const recipe = parser.parse(html, url);

      if (!recipe.title || !recipe.ingredients?.length) throw new Error('VALIDATION_MIN_FAIL');
      pushJsonl(OUT_TMP, recipe);
      run.ok += 1;
      await sleep(150);
    } catch (e) {
      run.failed += 1;
      run.errors.push({ url, error: String(e?.message || e) });
      await sleep(150);
    }
  }

  fs.writeFileSync(LAST_LOG, JSON.stringify(run, null, 2));
  console.log(JSON.stringify(run));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
