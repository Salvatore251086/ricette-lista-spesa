#!/usr/bin/env node
// Uso
// node script/validate-recipes.mjs assets/json/recipes-it.json new_recipes.json

import fs from 'node:fs/promises'

const baseFile = process.argv[2]
const addFile = process.argv[3]
if (!baseFile || !addFile) {
  console.error('Passa percorsi base e nuovi')
  process.exit(0)
}

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
])

const base = safeJson(await fs.readFile(baseFile, 'utf8')) || []
const add = safeJson(await fs.readFile(addFile, 'utf8')) || []

const errs = []
const seen = new Set(base.map(x => key(x)))

for (const r of add) {
  const k = key(r)
  if (!r.title) errs.push(msg(r, 'title mancante'))
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) errs.push(msg(r, 'ingredients vuoto'))
  if (!Array.isArray(r.steps) || r.steps.length === 0) errs.push(msg(r, 'steps vuoto'))
  if (!r.url) errs.push(msg(r, 'url mancante'))
  if (r.url && !isAllowed(r.url)) errs.push(msg(r, 'dominio non permesso'))
  if (seen.has(k)) errs.push(msg(r, 'duplicato id'))
  seen.add(k)
}

if (errs.length) {
  console.error('VALIDAZIONE FALLITA')
  errs.forEach(e => console.error('-', e))
  process.exit(1)
} else {
  console.log('VALIDAZIONE OK', add.length, 'ricette')
  process.exit(0)
}

function key(r){ return String(r.id || r.title || '').toLowerCase() }
function isAllowed(u){
  try { return ALLOWED.has(new URL(u).hostname) } catch { return false }
}
function msg(r, t){ return `[${r.id || r.title || 'sconosciuto'}] ${t}` }
function safeJson(t){ try{ return JSON.parse(t) }catch{ return null } }
