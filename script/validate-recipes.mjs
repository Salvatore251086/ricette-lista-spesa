#!/usr/bin/env node
// Uso:
// node script/validate-recipes.mjs assets/json/recipes-it.json new_recipes.json
import fs from 'node:fs/promises';

const baseFile = process.argv[2];
const addFile  = process.argv[3];
if (!baseFile || !addFile) {
  console.error('Passa percorsi base e nuovi: base.json new.json');
  process.exit(0);
}

// domini ammessi
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

const base = safeJson(await fs.readFile(baseFile, 'utf8'))?.recipes ?? [];
const add  = safeJson(await fs.readFile(addFile,  'utf8'))?.recipes ?? [];

const errs = [];
const seen = new Set(base.map(key));

// validazione “soft”: richiede solo url valida di dominio ammesso e title non vuoto
for (const r of add) {
  const k = key(r);
  if (!r.title || !String(r.title).trim()) errs.push(msg(r, 'title mancante'));
  if (!r.url) errs.push(msg(r, 'url mancante'));
  if (r.url && !isAllowed(r.url)) errs.push(msg(r, 'dominio non permesso'));
  if (seen.has(k)) errs.push(msg(r, 'duplicato id/title'));
  seen.add(k);
}

if (errs.length) {
  console.error('VALIDAZIONE FALLITA');
  for (const e of errs.slice(0, 50)) console.error('-', e); // limita lo spam
  process.exit(1);
} else {
  console.log('VALIDAZIONE OK', add.length, 'ricette');
  process.exit(0);
}

function key(r){ return String(r.id || r.title || '').toLowerCase(); }
function isAllowed(u){ try { return ALLOWED.has(new URL(u).hostname); } catch { return false; } }
function msg(r, t){ return `[${r.id || r.title || 'sconosciuto'}] ${t}`; }
function safeJson(t){ try { return JSON.parse(t); } catch { return null; } }
