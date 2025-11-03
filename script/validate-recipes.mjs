#!/usr/bin/env node
// Uso:
// node script/validate-recipes.mjs assets/json/recipes-it.json new_recipes.json
// Regola minima: titolo presente e almeno ingredienti oppure passi

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

const baseJson = safeJson(await fs.readFile(baseFile, 'utf8')) || { recipes: [] }
const addJson = safeJson(await fs.readFile(addFile, 'utf8')) || { recipes: [] }
const base = Array.isArray(baseJson) ? baseJson : baseJson.recipes || []
const add = Array.isArray(addJson) ? addJson : addJson.recipes || []

const errs = []
const seen = new Set(base.map(x => key(x)))

for (const r of add) {
  const k = key(r)

  const titleOk = hasText(r.title)
  const ingrOk = Array.isArray(r.ingredients) && r.ingredients.filter(hasText).length >= 2
  const stepsOk = Array.isArray(r.steps) && r.steps.filter(hasText).length >= 2

  if (!titleOk) errs.push(msg(r, 'title mancante'))
  if (!(ingrOk || stepsOk)) errs.push(msg(r, 'servono ingredienti o passi'))

  if (!r.sourceUrl && !r.url) errs.push(msg(r, 'url sorgente mancante'))
  const src = r.sourceUrl || r.url || ''
  if (src && !isAllowed(src)) errs.push(msg(r, 'dominio non permesso'))

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

function key(r) {
  return String(r.id || r.title || '').toLowerCase()
}
function isAllowed(u) {
  try { return ALLOWED.has(new URL(u).hostname) } catch { return false }
}
function msg(r, t) {
  return `[${r.id || r.title || 'sconosciuto'}] ${t}`
}
function safeJson(t) {
  try { return JSON.parse(t) } catch { return null }
}
function hasText(s) {
  return !!String(s || '').trim()
}
