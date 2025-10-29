#!/usr/bin/env node
// scripts/resolve-youtube-ids.mjs
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const ROOT = process.cwd()
const DATA_PATH = path.join(ROOT, 'assets/json/recipes-it.json')
const CHANNELS_PATH = path.join(ROOT, 'channels.json')
const CATALOG_CACHE = path.join(ROOT, 'assets/json/video_catalog.cache.json')
const INDEX_OUT = path.join(ROOT, 'assets/json/video_index.json')

const API = 'https://www.googleapis.com/youtube/v3'
const KEY = process.env.YT_API_KEY
if (!KEY) {
  console.error('Errore. Variabile YT_API_KEY assente')
  process.exit(1)
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function score(a, b) {
  const A = norm(a).split(' ')
  const B = norm(b).split(' ')
  if (!A.length || !B.length) return 0
  const setB = new Set(B)
  let hit = 0
  for (const w of A) if (setB.has(w)) hit++
  return hit / Math.max(A.length, B.length)
}

async function api(endpoint, params) {
  const usp = new URLSearchParams({ key: KEY, ...params })
  const url = `${API}/${endpoint}?${usp.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API ${endpoint} ${res.status}`)
  return res.json()
}

// Accetta UC..., @handle, url canale, url video, nome canale
function extractHintIdOrHandle(x) {
  const s = String(x || '').trim()
  if (!s) return { type: 'empty', value: '' }
  if (s.startsWith('UC')) return { type: 'channelId', value: s }
  if (s.startsWith('@')) return { type: 'handle', value: s }
  try {
    const u = new URL(s)
    const m1 = u.pathname.match(/\/channel\/(UC[0-9A-Za-z_-]{20,})/)
    if (m1) return { type: 'channelId', value: m1[1] }
    const m2 = u.pathname.match(/\/(@[A-Za-z0-9._-]+)/)
    if (m2) return { type: 'handle', value: m2[1] }
    if (u.pathname.startsWith('/watch') || u.pathname.startsWith('/shorts') || u.hostname === 'youtu.be') {
      const id = u.searchParams.get('v') || u.pathname.split('/').pop()
      if (id && id.length >= 10) return { type: 'videoId', value: id }
    }
  } catch {}
  return { type: 'name', value: s }
}

async function resolveChannelId(hint) {
  const h = extractHintIdOrHandle(hint)
  if (h.type === 'channelId') return h.value
  if (h.type === 'handle') {
    const j = await api('channels', { part: 'id', forHandle: h.value })
    const id = j.items?.[0]?.id
    if (!id) throw new Error(`Channel non trovato per handle ${h.value}`)
    return id
  }
  if (h.type === 'videoId') {
    const j = await api('videos', { part: 'snippet', id: h.value })
    const id = j.items?.[0]?.snippet?.channelId
    if (!id) throw new Error(`Channel non trovato dal video ${h.value}`)
    return id
  }
  const j = await api('search', { part: 'snippet', q: h.value, type: 'channel', maxResults: 1 })
  const id = j.items?.[0]?.snippet?.channelId || j.items?.[0]?.id?.channelId
  if (!id) throw new Error(`Channel non trovato per nome ${h.value}`)
  return id
}

async function getUploadsPlaylistId(anyChannelRef) {
  const channelId = await resolveChannelId(anyChannelRef)
  const j = await api('channels', { part: 'contentDetails', id: channelId })
  const id = j.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!id) throw new Error(`Uploads playlist non trovata per ${channelId}`)
  return id
}

async function listPlaylistVideos(playlistId) {
  const out = []
  let pageToken = ''
  do {
    const j = await api('playlistItems', {
      part: 'snippet,contentDetails',
      maxResults: 50,
      playlistId,
      pageToken
    })
    for (const it of j.items || []) {
      const id = it.contentDetails?.videoId
      const title = it.snippet?.title || ''
      const channelTitle = it.snippet?.channelTitle || ''
      if (id && title) out.push({ id, title, channelTitle })
    }
    pageToken = j.nextPageToken || ''
    await sleep(60)
  } while (pageToken)
  return out
}

async function buildCatalog() {
  const channels = JSON.parse(fs.readFileSync(CHANNELS_PATH, 'utf8'))
  const catalog = []
  for (const c of channels) {
    const uploads = await getUploadsPlaylistId(c.channelId || c.handle || c.url || c.name)
    const vids = await listPlaylistVideos(uploads)
    for (const v of vids) catalog.push({ ...v, channelAlias: c.name })
  }
  return catalog
}

function loadData(p) {
  const raw = fs.readFileSync(p, 'utf8')
  const json = JSON.parse(raw)
  const arr = Array.isArray(json) ? json : (json.recipes || [])
  return { raw, json, arr }
}

function saveData(p, original, arr) {
  const out = Array.isArray(original) ? arr : { ...original, recipes: arr }
  fs.writeFileSync(p, JSON.stringify(out, null, 2))
}

function sha(x) {
  return crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex')
}

;(async () => {
  let catalog
  try {
    catalog = JSON.parse(fs.readFileSync(CATALOG_CACHE, 'utf8'))
  } catch {
    catalog = await buildCatalog()
    fs.mkdirSync(path.dirname(CATALOG_CACHE), { recursive: true })
    fs.writeFileSync(CATALOG_CACHE, JSON.stringify(catalog, null, 2))
  }

  const { json: original, arr: recipes } = loadData(DATA_PATH)

  let updated = 0
  const index = []

  for (const r of recipes) {
    const q = r.youtubeQuery || r.title
    const best = catalog
      .map(v => ({ ...v, sc: score(q, v.title) }))
      .sort((a, b) => b.sc - a.sc)[0]

    if (best && best.sc >= 0.45) {
      if (r.youtubeId !== best.id) {
        r.youtubeId = best.id
        updated++
      }
      index.push({
        title: r.title,
        youtubeId: r.youtubeId,
        matchTitle: best.title,
        channelTitle: best.channelTitle,
        confidence: Number(best.sc.toFixed(3))
      })
    } else {
      index.push({
        title: r.title,
        youtubeId: r.youtubeId || '',
        matchTitle: '',
        channelTitle: '',
        confidence: 0
      })
    }
  }

  fs.writeFileSync(INDEX_OUT, JSON.stringify(index, null, 2))

  const before = sha(original)
  saveData(DATA_PATH, original, recipes)
  const after = sha(JSON.parse(fs.readFileSync(DATA_PATH, 'utf8')))

  console.log(`Video catalogati: ${catalog.length}`)
  console.log(`Ricette aggiornate: ${updated}`)
  console.log(`Indice: ${path.relative(ROOT, INDEX_OUT)}`)
  console.log(before === after ? 'Nessuna modifica al file ricette' : 'File ricette aggiornato')
})().catch(err => {
  console.error(err)
  process.exit(1)
})
