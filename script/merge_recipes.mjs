#!/usr/bin/env node
// Merge: legge l'indice URL, scarica un piccolo lotto di ricette nuove, valida soft e aggiorna assets/json/recipes-it.json

import fs from 'node:fs/promises';

const INDEX   = 'assets/json/recipes-index.jsonl';
const OUTFILE = 'assets/json/recipes-it.json';

// domini ammessi (match con validazione soft)
const ALLOWED = new Set([
  'ricette.giallozafferano.it',
  'www.giallozafferano.it',
  'www.fattoincasadabenedetta.it',
  'www.cucchiaio.it',
  'www.misya.info',
  'www.lacucinaitaliana.it',
  'www.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com'
]);

function safeJson(t){ try { return JSON.parse(t) } catch { return null } }
function nowTs(){ return new Date().toISOString().replace(/[:.]/g,''); }
function key(r){ return String(r.id || r.title || '').toLowerCase(); }
function isAllowed(u){ try { return ALLOWED.has(new URL(u).hostname) } catch { return false } }
function slugFromUrl(u){ try { return new URL(u).pathname.split('/').filter(Boolean).pop() || 'ricetta' } catch { return 'ricetta' } }

async function readIndex(){
  let lines = [];
  try {
    const txt = await fs.readFile(INDEX,'utf8');
    lines = txt.split(/\r?\n/).filter(Boolean).map(l => safeJson(l)).filter(Boolean);
  } catch { lines = []; }
  return lines;
}

async function readRecipes(){
  try {
    const obj = safeJson(await fs.readFile(OUTFILE,'utf8')) || {};
    return Array.isArray(obj.recipes) ? obj.recipes : [];
  } catch { return []; }
}

function pickCandidates(index, existingMap, limit=10){
  const list = [];
  for (const it of index){
    const u = it.url || it;
    if (!u) continue;
    if (!isAllowed(u)) continue;
    // prendi solo pagine ricetta tipiche
    if (!/\/ricetta\//.test(u)) continue;
    const k = u.toLowerCase();
    if (existingMap.has(k)) continue;
    list.push(u);
    if (list.length >= limit) break;
  }
  return list;
}

function parseTitle(html){
  // prova og:title
  const m1 = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (m1 && m1[1]) return m1[1].trim();
  // fallback <title>
  const m2 = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (m2 && m2[1]) return m2[1].trim();
  return '';
}

async function fetchRecipe(url){
  const res = await fetch(url, { headers: { 'User-Agent': 'RLS-Crawler/1.1 (+https://github.com/)' }});
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const title = parseTitle(html);
  return {
    id: slugFromUrl(url),
    title,
    image: '',
    servings: 0,
    prepTime: 0,
    cookTime: 0,
    difficulty: 'easy',
    category: [],
    tags: [],
    ingredients: [],
    steps: [],
    sourceUrl: url,
    youtubeId: ''
  };
}

function validateSoft(r){
  const errs = [];
  if (!r.title || !String(r.title).trim()) errs.push('title mancante');
  if (!r.sourceUrl) errs.push('url mancante');
  if (r.sourceUrl && !isAllowed(r.sourceUrl)) errs.push('dominio non permesso');
  return errs;
}

async function main(){
  const tsStart = new Date().toISOString();

  const index = await readIndex();
  const existing = await readRecipes();
  const existingByUrl = new Map(existing.map(r => [String(r.sourceUrl || '').toLowerCase(), r]));

  const candidates = pickCandidates(index, existingByUrl, 10);
  const added = [];

  for (const url of candidates){
    try {
      const r = await fetchRecipe(url);
      const v = validateSoft(r);
      if (v.length){ 
        console.error('SKIP', url, '->', v.join('; '));
        continue;
      }
      added.push(r);
    } catch (e){
      console.error('FAIL', url, '->', e.message);
    }
  }

  if (added.length){
    const backup = `assets/json/recipes-it.backup.${nowTs()}.json`;
    await fs.writeFile(backup, JSON.stringify({recipes: existing}, null, 2));
    const merged = existing.concat(added);
    await fs.writeFile(OUTFILE, JSON.stringify({recipes: merged}, null, 2));
  }

  const summary = { ts: tsStart, added: added.length, total: existing.length + added.length };
  console.log(JSON.stringify(summary));
}

main().catch(e => { console.error(e); process.exit(1); });
