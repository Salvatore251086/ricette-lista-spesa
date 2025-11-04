#!/usr/bin/env node
// Espande i sitemap in URL ricetta e li salva in assets/json/recipes-index.jsonl

import fs from 'node:fs/promises';

const URLS_FILE   = 'assets/json/urls_last.json';     // lista sitemap
const INDEX_FILE  = 'assets/json/recipes-index.jsonl';// output JSONL {url, ts}
const CRAWL_STATE = 'assets/json/crawl_last.json';    // stato ultimo crawl

const UA = 'RLS-Crawler/1.1 (+https://github.com/)';

function nowIso(){ return new Date().toISOString(); }
function safeJson(t){ try{ return JSON.parse(t) }catch{ return null } }

async function readJson(path, fallback){
  try { return safeJson(await fs.readFile(path,'utf8')) ?? fallback; }
  catch { return fallback; }
}
async function appendJsonl(path, rows){
  const lines = rows.map(o => JSON.stringify(o)).join('\n') + '\n';
  await fs.writeFile(path, lines, { flag:'a' });
}

function extractLocs(xml){
  const locs = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gim;
  let m;
  while ((m = re.exec(xml))) locs.push(m[1].trim());
  return locs;
}

function isRecipeUrl(u){
  try {
    const url = new URL(u);
    // CUCCHIAIO, GZ, LCI ecc. Path tipico con /ricetta/
    return /\/ricetta\//i.test(url.pathname);
  } catch { return false; }
}

async function fetchText(u){
  const res = await fetch(u, { headers:{ 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function main(){
  const ts = nowIso();

  const sitemaps = await readJson(URLS_FILE, []);
  if (!Array.isArray(sitemaps) || sitemaps.length === 0) {
    console.error('urls_last.json vuoto');
    console.log(JSON.stringify({ ts, processed:0, ok:0, skipped:0, failed:0, cache:{fail_html:0, fail_json:0} }));
    process.exit(0);
  }

  // evita duplicati rispetto a quanto già indicizzato
  const already = new Set();
  try {
    const txt = await fs.readFile(INDEX_FILE,'utf8');
    for (const line of txt.split(/\r?\n/)) {
      if (!line) continue;
      const row = safeJson(line);
      if (row && row.url) already.add(row.url);
    }
  } catch {}

  const seen = new Set();
  const toAppend = [];
  let processed = 0, ok = 0, skipped = 0, failed = 0;

  for (const sm of sitemaps){
    processed++;
    try {
      const xml = await fetchText(sm);
      const locs = extractLocs(xml);
      for (const u of locs){
        if (!isRecipeUrl(u)) { skipped++; continue; }
        if (already.has(u) || seen.has(u)) { skipped++; continue; }
        seen.add(u);
        toAppend.push({ url: u, ts });
      }
      ok++;
    } catch (e){
      failed++;
      console.error('SITEMAP_FAIL', sm, e.message);
    }
  }

  if (toAppend.length){
    await appendJsonl(INDEX_FILE, toAppend);
  }

  await fs.writeFile(CRAWL_STATE, JSON.stringify({ ts, added: toAppend.length, total_indexed: already.size + toAppend.length }, null, 2));

  console.log(JSON.stringify({
    ts, processed, ok, skipped, failed,
    added: toAppend.length,
    cache: { fail_html:0, fail_json:0 }
  }));
}

main().catch(e => { console.error(e); process.exit(1); });
