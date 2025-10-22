#!/usr/bin/env node
// validate-urls.mjs
// Uso:
//   node validate-urls.mjs assets/json/recipes-it.json > report.json
//   node validate-urls.mjs --write-video assets/json/recipes-it.json

import fs from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

const argWrite = process.argv.includes('--write-video');
const file = process.argv.find(a => a.endsWith('.json'));
if (!file) { console.error('Specifica il percorso del JSON ricette'); process.exit(1); }

const ALLOWED = new Set([
  'www.giallozafferano.it',
  'blog.giallozafferano.it',
  'www.fattoincasadabenedetta.it',
  'www.cucchiaio.it',
  'www.misya.info',
  'www.lacucinaitaliana.it',
  'www.youtube.com',
  'youtu.be'
]);

const TIMEOUT_MS = 12000;

function isYouTube(u){
  try { const x = new URL(u); return x.hostname==='www.youtube.com' || x.hostname==='youtu.be'; } catch { return false; }
}
function ytId(u){
  try {
    const x = new URL(u);
    if (x.hostname==='youtu.be') return x.pathname.split('/')[1]||'';
    if (x.hostname==='www.youtube.com'){
      if (x.pathname==='/watch') return x.searchParams.get('v')||'';
      if (x.pathname.startsWith('/shorts/')) return x.pathname.split('/')[2]||'';
      if (x.pathname.startsWith('/embed/')) return x.pathname.split('/')[2]||'';
    }
    return '';
  } catch { return ''; }
}
function isLikelyRecipe(u){
  try {
    const x = new URL(u);
    if (!ALLOWED.has(x.hostname)) return false;
    if (isYouTube(u)) return true;
    const p = x.pathname.toLowerCase();
    return p.includes('/ricette') || p.includes('ricetta') || p.endsWith('.html');
  } catch { return false; }
}

async function safeFetch(url){
  const ac = new AbortController();
  const t = setTimeout(()=>ac.abort(), TIMEOUT_MS);
  try {
    let r = await fetch(url, { method:'HEAD', redirect:'follow', signal: ac.signal });
    if (!r.ok || !(r.headers.get('content-type')||'').includes('text/html')){
      r = await fetch(url, { method:'GET', redirect:'follow', signal: ac.signal });
    }
    const text = await r.text();
    return { ok: r.ok, status: r.status, ct: r.headers.get('content-type')||'', body: text.slice(0, 200000) };
  } catch (e){
    return { ok:false, status:0, ct:'', body:'', err: String(e) };
  } finally {
    clearTimeout(t);
  }
}

function hasRecipeLD(body){
  return /application\/ld\+json/i.test(body) && /"@type"\s*:\s*"(Recipe|Ricetta)"/i.test(body);
}

function uniqId(r){ return r.id || r.title || ''; }

const raw = JSON.parse(await fs.readFile(file, 'utf8'));
const list = Array.isArray(raw) ? raw : (raw.recipes || []);
const out = [];

const pool = [];
const CONC = 6;

for (const rec of list){
  pool.push(checkOne(rec));
  if (pool.length >= CONC){
    const part = await Promise.all(pool.splice(0));
    out.push(...part);
  }
}
out.push(...await Promise.all(pool));

if (argWrite){
  const map = new Map(list.map(r => [uniqId(r), r]));
  let changed = 0;
  for (const it of out){
    if (it.ytId && !map.get(it.id)?.video){
      map.get(it.id).video = it.ytId;
      changed++;
    }
  }
  const result = Array.isArray(raw) ? list : { ...raw, recipes: list };
  await fs.writeFile(file, JSON.stringify(result, null, 2), 'utf8');
  console.log(JSON.stringify({ updated: changed, file }, null, 2));
} else {
  console.log(JSON.stringify(out, null, 2));
}

async function checkOne(r){
  const id = uniqId(r);
  const url = r.url || '';
  const domainOk = url ? isLikelyRecipe(url) : false;
  const youTube = url && isYouTube(url);
  const videoFromField = r.video ? String(r.video) : '';
  const ytFromUrl = url ? ytId(url) : '';
  let yt = '';
  if (videoFromField) yt = videoFromField.includes('http') ? ytId(videoFromField) : videoFromField;
  if (!yt && ytFromUrl) yt = ytFromUrl;

  let status = 0;
  let htmlOk = false;
  let ldRecipe = false;

  if (url){
    const res = await safeFetch(url);
    status = res.status;
    htmlOk = res.ok && res.ct.includes('text/html');
    ldRecipe = htmlOk && hasRecipeLD(res.body);
  }

  return {
    id,
    title: r.title || '',
    url,
    url_status: status,
    url_domain_allowed: domainOk,
    url_has_html: htmlOk,
    url_has_recipe_schema: ldRecipe,
    youTube_url: youTube,
    ytId: yt || '',
    needs_fix: !!url && (!domainOk || !htmlOk || (!youTube && !ldRecipe)),
  };
}
