// script/merge_recipes.mjs
// Unisce assets/json/recipes-it.tmp.jsonl in assets/json/recipes-it.json
// Dedupe per chiave domain+slug e per titolo simile

import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import crypto from 'node:crypto'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const SRC_JSONL = `${ROOT}/assets/json/recipes-it.tmp.jsonl`
const TARGET_JSON = `${ROOT}/assets/json/recipes-it.json`
const MERGE_LAST = `${ROOT}/assets/json/merge_last.json`

async function ensureDir(path) {
  await mkdir(dirname(path), { recursive: true })
}

function slugKey(r) {
  const u = new URL(r.sourceUrl || 'https://local/')
  const host = u.hostname.replace(/^www\./, '')
  const path = u.pathname.replace(/\/$/, '')
  return `${host}${path}`
}

function titleKey(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

async function readJson(path) {
  try {
    const txt = await readFile(path, 'utf8')
    return JSON.parse(txt || '{}')
  } catch {
    return { recipes: [] }
  }
}

async function readJsonl(path) {
  try {
    const txt = await readFile(path, 'utf8')
    return txt.split(/\r?\n/).map(s => s.trim()).filter(Boolean).map(s => JSON.parse(s))
  } catch {
    return []
  }
}

async function backup(targetPath) {
  try { await access(targetPath) } catch { return }
  const stamp = new Date().toISOString().replace(/[:.]/g, '')
  const dst = `${dirname(targetPath)}/recipes-it.backup.${stamp}.json`
  await copyFile(targetPath, dst)
}

function hashRecipe(r) {
  const h = crypto.createHash('sha1')
  h.update(titleKey(r.title))
  h.update(JSON.stringify(r.ingredients || []))
  return h.digest('hex').slice(0, 12)
}

async function main() {
  await ensureDir(TARGET_JSON)

  const base = await readJson(TARGET_JSON)
  const incoming = await readJsonl(SRC_JSONL)

  const byKey = new Map()
  const byTitle = new Map()

  for (const r of base.recipes || []) {
    byKey.set(slugKey(r), r)
    byTitle.set(titleKey(r.title), r)
  }

  let added = 0
  let updated = 0
  for (const r of incoming) {
    const k1 = slugKey(r)
    const k2 = titleKey(r.title)
    if (byKey.has(k1)) {
      // aggiorna campi vuoti
      const cur = byKey.get(k1)
      let changed = false
      for (const f of ['image', 'servings', 'prepTime', 'cookTime', 'difficulty', 'description', 'youtubeId']) {
        if (!cur[f] && r[f]) { cur[f] = r[f]; changed = true }
      }
      if ((cur.ingredients || []).length === 0 && (r.ingredients || []).length > 0) { cur.ingredients = r.ingredients; changed = true }
      if ((cur.steps || []).length === 0 && (r.steps || []).length > 0) { cur.steps = r.steps; changed = true }
      const tagset = new Set([...(cur.tags || []), ...(r.tags || [])])
      cur.tags = Array.from(tagset)
      if (changed) updated += 1
    } else if (byTitle.has(k2)) {
      // probabile duplicato per slug differente
      const cur = byTitle.get(k2)
      let changed = false
      for (const f of ['image', 'servings', 'prepTime', 'cookTime', 'difficulty', 'description', 'youtubeId', 'sourceUrl']) {
        if (!cur[f] && r[f]) { cur[f] = r[f]; changed = true }
      }
      if ((cur.ingredients || []).length === 0 && (r.ingredients || []).length > 0) { cur.ingredients = r.ingredients; changed = true }
      if ((cur.steps || []).length === 0 && (r.steps || []).length > 0) { cur.steps = r.steps; changed = true }
      const tagset = new Set([...(cur.tags || []), ...(r.tags || [])])
      cur.tags = Array.from(tagset)
      if (changed) updated += 1
    } else {
      // nuova
      const id = r.id || `${k2}-${hashRecipe(r)}`
      byKey.set(k1, { ...r, id })
      byTitle.set(k2, byKey.get(k1))
      added += 1
    }
  }

  const merged = Array.from(byKey.values())
  await backup(TARGET_JSON)
  await writeFile(TARGET_JSON, JSON.stringify({ recipes: merged }, null, 2))

  const stamp = {
    ts: new Date().toISOString(),
    added,
    updated,
    total: merged.length
  }
  await writeFile(MERGE_LAST, JSON.stringify(stamp, null, 2))
  console.log(JSON.stringify(stamp))
}

main()
