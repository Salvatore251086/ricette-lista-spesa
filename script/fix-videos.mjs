#!/usr/bin/env node
// script/fix-videos.mjs
// Usage in CI: node script/fix-videos.mjs
// Effetti:
// - legge assets/json/video_catalog.primary.json e .fallback.json
// - valida ogni youtubeId via oEmbed e canale whitelist
// - aggiorna assets/json/recipes-it.json con i soli id validi
// - salva un report in assets/json/video_index.json

import fs from 'node:fs/promises'
import path from 'node:path'

// Percorsi
const ROOT = process.cwd()
const P_RECIPES = path.join(ROOT, 'assets/json/recipes-it.json')
const P_PRIMARY = path.join(ROOT, 'assets/json/video_catalog.primary.json')
const P_FALLBACK = path.join(ROOT, 'assets/json/video_catalog.fallback.json')
const P_REPORT = path.join(ROOT, 'assets/json/video_index.json')

// Canali ammessi
// Confronto su author_url o handle o channel url in lowercase
const ALLOWED_AUTHORS = new Set([
  '@giallozafferano',
  'https://www.youtube.com/@giallozafferano',
  '@fattoincasadabenedetta',
  'https://www.youtube.com/@fattoincasadabenedetta',
  '@misyaincucina',
  'https://www.youtube.com/@misyaincucina',
  '@lacucinaitaliana',
  'https://www.youtube.com/@lacucinaitaliana',
  '@cucchiaio',
  'https://www.youtube.com/@cucchiaio',
  '@chefmaxmariola',
  'https://www.youtube.com/@chefmaxmariola'
])

// Helpers I/O sicuri
async function readJson(file, fallback) {
  try {
    const txt = await fs.readFile(file, 'utf8')
    const v = JSON.parse(txt)
    return v
  } catch {
    return fallback
  }
}

async function writeJson(file, data) {
  const txt = JSON.stringify(data, null, 2)
  await fs.writeFile(file, txt, 'utf8')
}

// Normalizza una lista generica in [{recipeId, youtubeId}]
function normalizeList(list) {
  if (!Array.isArray(list)) return []
  return list.map(x => {
    const recipeId = String(x.recipeId || x.id || '').trim()
    const yt = normalizeYoutube(x.youtubeId || x.youtubeUrl || x.url || '')
    return { recipeId, youtubeId: yt }
  }).filter(x => x.recipeId && x.youtubeId)
}

// Estrae id da url o restituisce id se già valido
function normalizeYoutube(input) {
  const s = String(input || '').trim()
  if (!s) return ''
  // Se è un id già nel formato 11 char
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s

  try {
    const u = new URL(s)
    // https://www.youtube.com/watch?v=ID
    if ((u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be'))) {
      if (u.hostname.includes('youtu.be')) {
        // https://youtu.be/ID
        const id = u.pathname.split('/').filter(Boolean).at(-1) || ''
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : ''
      }
      // youtube.com
      const id = u.searchParams.get('v') || ''
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : ''
    }
    return ''
  } catch {
    return ''
  }
}

// Verifica oEmbed senza chiavi
// Ritorna { ok, id, author_url, author_name, title, reason }
async function verifyYoutubeId(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) {
    return { ok: false, id, reason: 'bad_format' }
  }
  // oEmbed JSON
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`
  try {
    const res = await fetch(url, { method: 'GET' })
    if (!res.ok) {
      return { ok: false, id, reason: `oembed_${res.status}` }
    }
    const data = await res.json()
    const authorUrl = String(data.author_url || '').toLowerCase()
    const authorName = String(data.author_name || '').toLowerCase()

    const allowed = isAllowedAuthor(authorUrl, authorName)
    if (!allowed) {
      return { ok: false, id, author_url: authorUrl, author_name: authorName, reason: 'author_not_allowed' }
    }
    return { ok: true, id, author_url: authorUrl, author_name: authorName, title: data.title || '' }
  } catch {
    return { ok: false, id, reason: 'oembed_error' }
  }
}

function isAllowedAuthor(authorUrl, authorName) {
  const a = [authorUrl, authorName].filter(Boolean)
  for (const v of a) {
    for (const key of ALLOWED_AUTHORS) {
      if (v.includes(key)) return true
    }
  }
  return false
}

function indexById(recipes) {
  const map = new Map()
  const arr = Array.isArray(recipes?.recipes) ? recipes.recipes : []
  for (const r of arr) {
    const k = String(r.id || '').trim()
    if (k) map.set(k, r)
  }
  return { arr, map }
}

async function main() {
  // Carica input
  const recipes = await readJson(P_RECIPES, { recipes: [] })
  const primary = await readJson(P_PRIMARY, [])
  const fallback = await readJson(P_FALLBACK, [])

  const list = [
    ...normalizeList(primary),
    ...normalizeList(fallback)
  ]

  const report = {
    ts: new Date().toISOString(),
    input_counts: {
      primary: Array.isArray(primary) ? primary.length : 0,
      fallback: Array.isArray(fallback) ? fallback.length : 0,
      combined: list.length
    },
    checked: 0,
    accepted: 0,
    rejected: 0,
    details: []
  }

  if (list.length === 0) {
    await writeJson(P_REPORT, { ...report, note: 'empty_catalogs' })
    // Nessuna modifica
    return
  }

  const { arr, map } = indexById(recipes)
  const setAccepted = new Set()

  // Verifica in serie per evitare limiti aggressivi
  for (const item of list) {
    const { recipeId, youtubeId } = item
    if (!map.has(recipeId)) {
      report.details.push({ recipeId, youtubeId, ok: false, reason: 'recipe_not_found' })
      report.rejected++
      continue
    }
    report.checked++

    const v = await verifyYoutubeId(youtubeId)
    if (!v.ok) {
      report.details.push({ recipeId, youtubeId, ok: false, reason: v.reason, author_url: v.author_url, author_name: v.author_name })
      report.rejected++
      continue
    }

    // Aggiorna solo se non già accettato in precedenza
    if (!setAccepted.has(recipeId)) {
      map.get(recipeId).youtubeId = youtubeId
      setAccepted.add(recipeId)
    }
    report.details.push({ recipeId, youtubeId, ok: true, author_url: v.author_url, author_name: v.author_name, title: v.title })
    report.accepted++
  }

  // Scrivi ricette aggiornate
  await writeJson(P_RECIPES, { recipes: arr })

  // Scrivi report
  await writeJson(P_REPORT, report)

  // Log riassunto per i logs CI
  console.log(JSON.stringify({
    ts: report.ts,
    checked: report.checked,
    accepted: report.accepted,
    rejected: report.rejected
  }))
}

main().catch(async err => {
  console.error('fix-videos fatal', err?.message || String(err))
  // Prova a lasciare un report minimo per debug
  try {
    await writeJson(P_REPORT, { ts: new Date().toISOString(), error: String(err?.message || err) })
  } catch {}
  process.exit(1)
})
