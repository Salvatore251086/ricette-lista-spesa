#!/usr/bin/env node
// Uso
// node script/merge-recipes.mjs assets/json/recipes-it.json new_recipes.json > merged.json

import fs from 'node:fs/promises'

const baseFile = process.argv[2]
const addFile = process.argv[3]
if (!baseFile || !addFile) {
  console.error('Passa percorso base e nuovi')
  process.exit(1)
}

const base = JSON.parse(await fs.readFile(baseFile, 'utf8'))
const add = JSON.parse(await fs.readFile(addFile, 'utf8'))

const out = []
const seenId = new Set()
const seenUrl = new Set()

function keyId(x) { return String(x.id || '').toLowerCase() }
function keyUrl(x) { return String(x.url || '').trim().toLowerCase() }

for (const r of base) {
  const id = keyId(r)
  const url = keyUrl(r)
  if (id) seenId.add(id)
  if (url) seenUrl.add(url)
  out.push(r)
}

for (const r of add) {
  const id = keyId(r)
  const url = keyUrl(r)
  if (!r.title || !r.ingredients?.length || !r.steps?.length) continue
  if (id && seenId.has(id)) continue
  if (url && seenUrl.has(url)) continue
  if (!id) r.id = slug(r.title)
  seenId.add(keyId(r))
  if (url) seenUrl.add(url)
  out.push(r)
}

console.log(JSON.stringify(out, null, 2))

function slug(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
}
