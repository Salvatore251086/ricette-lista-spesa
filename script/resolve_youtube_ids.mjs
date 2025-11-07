import fs from 'node:fs/promises'
import path from 'node:path'

const API_KEY = process.env.YT_API_KEY
if (!API_KEY) {
  console.error('Manca YT_API_KEY nelle variabili ambiente')
  process.exit(1)
}

const ROOT = process.cwd()
const RECIPES_PATH = path.join(ROOT, 'assets/json/recipes-it.json')
const RESOLVED_PATH = path.join(ROOT, 'assets/json/video_index.resolved.json')
const WL_PATH = path.join(ROOT, 'assets/json/video_channel_whitelist.json')

const START = Number(process.env.START || 0)
const LIMIT = Number(process.env.LIMIT || 60)

function norm(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function coreTokens(title) {
  const stop = new Set([
    'alla', 'al', 'di', 'con', 'e', 'da', 'la', 'il', 'lo', 'le', 'gli',
    'un', 'una', 'uno', 'del', 'della', 'dei', 'degli', 'delle',
    'ai', 'agli', 'alle', 'salsa', 'ricetta'
  ])

  return norm(title)
    .split(' ')
    .filter(t => t && !stop.has(t))
}

function iso8601toSec(iso) {
  const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(iso || '')
  if (!m) return 0

  const h = Number(m[1] || 0)
  const mi = Number(m[2] || 0)
  const s = Number(m[3] || 0)

  return h * 3600 + mi * 60 + s
}

function scoreCandidate(recTitle, cand, wlSet, blockWords) {
  const recTokens = new Set(coreTokens(recTitle))
  const candTokens = new Set(coreTokens(cand.title))

  let overlap = 0
  for (const t of candTokens) {
    if (recTokens.has(t)) overlap++
  }

  const durSec = iso8601toSec(cand.duration)
  const durOk = durSec >= 60 && durSec <= 20 * 60

  const titleLower = cand.title.toLowerCase()
  let bad = false
  for (const w of blockWords) {
    if (titleLower.includes(w)) {
      bad = true
      break
    }
  }

  const whitelist = wlSet.has(norm(cand.channelTitle))

  let s = 0
  s += Math.min(overlap, 6) * 10
  s += durOk ? 20 : -40
  s += whitelist ? 40 : 0
  s += bad ? -100 : 0

  const allCoreIn = [...recTokens].every(t => candTokens.has(t))
  if (allCoreIn && recTokens.size > 0) s += 20

  return { score: s, overlap, whitelist, bad }
}

async function ytSearchSingle(q) {
  const params = new URLSearchParams({
    key: API_KEY,
    part: 'snippet',
    q,
    type: 'video',
    maxResults: '6',
    regionCode: 'IT',
    relevanceLanguage: 'it',
    safeSearch: 'strict'
  })

  const url = 'https://www.googleapis.com/youtube/v3/search?' + params.toString()
  const r = await fetch(url)
  if (!r.ok) throw new Error('YouTube search HTTP ' + r.status)

  const j = await r.json()
  return j.items.map(i => ({
    videoId: i.id.videoId,
    title: i.snippet.title,
    channelTitle: i.snippet.channelTitle
  }))
}

async function ytVideos(ids) {
  if (!ids.length) return []

  const params = new URLSearchParams({
    key: API_KEY,
    part: 'contentDetails,snippet',
    id: ids.join(',')
  })

  const url = 'https://www.googleapis.com/youtube/v3/videos?' + params.toString()
  const r = await fetch(url)
  if (!r.ok) throw new Error('YouTube videos HTTP ' + r.status)

  const j = await r.json()
  return j.items.map(i => ({
    videoId: i.id,
    title: i.snippet.title,
    channelTitle: i.snippet.channelTitle,
    duration: i.contentDetails.duration
  }))
}

async function loadJson(p, fallback) {
  try {
    const s = await fs.readFile(p, 'utf8')
    return JSON.parse(s)
  } catch {
    return fallback
  }
}

async function main() {
  const data = await loadJson(RECIPES_PATH, [])
  // Gestisce sia array puro sia oggetto con chiave recipes
  const recipes = Array.isArray(data)
    ? data
    : (Array.isArray(data.recipes) ? data.recipes : [])

  let resolved = await loadJson(RESOLVED_PATH, [])
  const wl = await loadJson(WL_PATH, { priority: [], blocklist: [] })

  const wlSet = new Set((wl.priority || []).map(norm))
  const blockWords = (wl.blocklist || []).map(w => String(w).toLowerCase())

  const resolvedMap = new Map(resolved.map(r => [norm(r.title), r]))

  const end = Math.min(recipes.length, START + LIMIT)
  const out = []
  let touched = 0

  for (let i = START; i < end; i++) {
    const rec = recipes[i]
    if (!rec || !rec.title) continue

    const key = norm(rec.title)
    const existing = resolvedMap.get(key)

    if (existing && existing.youtubeId) {
      out.push(existing)
      continue
    }

    const query = rec.title + ' ricetta'
    let candidatesMeta = []

    try {
      const searchRes = await ytSearchSingle(query)
      const ids = searchRes.map(x => x.videoId).filter(Boolean)
      const videos = await ytVideos(ids)
      const byId = new Map(videos.map(v => [v.videoId, v]))

      candidatesMeta = searchRes
        .map(s => {
          const v = byId.get(s.videoId)
          if (!v) return null
          return {
            videoId: v.videoId,
            title: v.title,
            channelTitle: v.channelTitle,
            duration: v.duration
          }
        })
        .filter(Boolean)
    } catch (e) {
      console.error('Query fallita per', rec.title, e.message)
    }

    if (!candidatesMeta.length) {
      const row = existing || {
        title: rec.title,
        youtubeId: '',
        channelTitle: '',
        confidence: 0
      }

      out.push(row)
      resolvedMap.set(key, row)
      console.log('SKIP', i, rec.title, 'nessun risultato')
      continue
    }

    const scored = candidatesMeta.map(c => {
      const m = scoreCandidate(rec.title, c, wlSet, blockWords)
      return { ...c, ...m }
    })

    scored.sort((a, b) => {
      if (a.whitelist !== b.whitelist) {
        return a.whitelist ? -1 : 1
      }
      return b.score - a.score
    })

    const top = scored[0]

    let accept = false
    if (top && !top.bad) {
      if (top.score >= 60 && top.overlap >= 2) {
        accept = true
      }
    }

    if (accept) {
      const row = {
        title: rec.title,
        youtubeId: top.videoId,
        channelTitle: top.channelTitle,
        confidence: Number((top.score / 100).toFixed(2))
      }

      out.push(row)
      resolvedMap.set(key, row)
      touched++
      console.log('OK', i, rec.title, '=>', top.channelTitle, top.videoId, 'score', top.score)
    } else {
      const row = existing || {
        title: rec.title,
        youtubeId: '',
        channelTitle: '',
        confidence: 0
      }

      out.push(row)
      resolvedMap.set(key, row)
      console.log('SKIP', i, rec.title, 'top non affidabile score', top ? top.score : 'n/a')
    }
  }

  const merged = new Map()

  for (const r of resolved) {
    merged.set(norm(r.title), r)
  }

  for (const r of out) {
    merged.set(norm(r.title), r)
  }

  const final = Array.from(merged.values())

  await fs.mkdir(path.dirname(RESOLVED_PATH), { recursive: true })
  await fs.writeFile(
    RESOLVED_PATH,
    JSON.stringify(final, null, 2) + '\n',
    'utf8'
  )

  console.log('Aggiornate', touched, 'ricette')
  console.log('Totale righe in video_index.resolved.json', final.length)
}

main().catch(e => {
  console.error('Errore generale', e)
  process.exit(1)
})
