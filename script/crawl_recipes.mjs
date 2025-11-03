// script/crawl_recipes.mjs
// Crawl ricette da sorgenti configurate e aggiorna i file ausiliari

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets', 'json');

const OUT_URLS_LAST = path.join(ASSETS, 'urls_last.json');
const OUT_INDEX = path.join(ASSETS, 'recipes-index.jsonl');

// user-agent semplice
const UA = 'RLS-Crawler/1.2 (+https://github.com)';

// util
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function ensureFile(p, initial) {
  try {
    await fs.access(p);
  } catch {
    await fs.writeFile(p, initial, 'utf8');
  }
}

async function readJSONSafe(p, fallback) {
  try {
    const txt = await fs.readFile(p, 'utf8');
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function normalizeSources(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.sources)) return raw.sources;
  if (raw && typeof raw === 'object') {
    const arr = Object.values(raw).filter(x => x && typeof x === 'object');
    if (arr.length) return arr;
  }
  return [];
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return await res.text();
}

// parser minimale sitemap XML → array URL
function extractUrlsFromSitemap(xml) {
  const urls = [];
  const re = /<loc>([^<]+)<\/loc>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const u = m[1].trim();
    if (u.startsWith('http')) urls.push(u);
  }
  return urls;
}

async function crawlSitemap(src) {
  try {
    const xml = await fetchText(src.url);
    let urls = extractUrlsFromSitemap(xml);

    if (src.urlPattern) {
      const rx = new RegExp(src.urlPattern);
      urls = urls.filter(u => rx.test(u));
    }
    if (src.maxUrls && Number.isFinite(src.maxUrls)) {
      urls = urls.slice(0, src.maxUrls);
    }
    return urls;
  } catch (e) {
    console.error('[sitemap] errore', src.url, e.message);
    return [];
  }
}

async function main() {
  // 1) assicura file output anche se vuoti
  await ensureFile(OUT_URLS_LAST, '[]');
  await ensureFile(OUT_INDEX, '');

  // 2) carica sources in modo tollerante
  const raw = await readJSONSafe(path.join(ASSETS, 'sources.json'), []);
  const sources = normalizeSources(raw);

  if (!sources.length) {
    console.warn('Nessuna sorgente valida in assets/json/sources.json');
    return;
  }

  const allUrls = new Set();

  for (const s of sources) {
    const type = (s.type || 'sitemap').toLowerCase();
    if (type !== 'sitemap') {
      console.warn('Tipo non supportato, uso sitemap di default:', type);
    }
    const urls = await crawlSitemap(s);
    urls.forEach(u => allUrls.add(u));
    await sleep(250); // rate-limit leggero
  }

  // 3) scrivi urls_last.json deduplicato
  const list = Array.from(allUrls);
  await fs.writeFile(OUT_URLS_LAST, JSON.stringify(list, null, 2), 'utf8');

  // 4) append minimale all’indice JSONL
  // Qui non estraiamo ancora i dettagli ricetta, salviamo solo le URL per step successivi
  if (list.length) {
    const lines = list.map(u => JSON.stringify({ url: u, ts: new Date().toISOString() })).join('\n') + '\n';
    await fs.appendFile(OUT_INDEX, lines, 'utf8');
  }

  console.log('Crawl completato. URL totali:', list.length);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
