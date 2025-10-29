#!/usr/bin/env node
// STRICT + FALLBACK canali ufficiali

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

const ROOT = process.cwd()
const DATA_PATH = path.join(ROOT, 'assets/json/recipes-it.json')
const CHANNELS_PATH = path.join(ROOT, 'channels.json')
const CACHE_DIR = path.join(ROOT, 'assets/json')
const CATALOG_PRIMARY = path.join(CACHE_DIR, 'video_catalog.primary.json')
const CATALOG_FALLBACK = path.join(CACHE_DIR, 'video_catalog.fallback.json')
const INDEX_OUT = path.join(CACHE_DIR, 'video_index.json')

const API = 'https://www.googleapis.com/youtube/v3'
const KEY = process.env.YT_API_KEY
if (!KEY) { console.error('YT_API_KEY mancante'); process.exit(1) }

const sleep = ms => new Promise(r => setTimeout(r, ms))

function norm(s){
  return String(s||'').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9 ]+/g,' ')
    .replace(/\s+/g,' ')
    .trim()
}
function tokens(s){ return norm(s).split(' ').filter(Boolean) }
function includesAll(hay, must){
  const H = new Set(tokens(hay))
  for (const w of must) if (!H.has(norm(w))) return false
  return true
}
function includesNone(hay, banned){
  const H = new Set(tokens(hay))
  for (const w of banned) if (H.has(norm(w))) return false
  return true
}
function jaccard(a,b){
  const A = new Set(tokens(a)), B = new Set(tokens(b))
  if (!A.size || !B.size) return 0
  let inter = 0; for (const x of A) if (B.has(x)) inter++
  return inter / (A.size + B.size - inter)
}

async function api(endpoint, params){
  const usp = new URLSearchParams({ key: KEY, ...params })
  const url = `${API}/${endpoint}?${usp.toString()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API ${endpoint} ${res.status}`)
  return res.json()
}

function parseRef(x){
  const s = String(x||'').trim()
  if (!s) return {type:'empty', value:''}
  if (s.startsWith('UC')) return {type:'channelId', value:s}
  if (s.startsWith('@')) return {type:'handle', value:s}
  try{
    const u = new URL(s)
    const m1 = u.pathname.match(/\/channel\/(UC[0-9A-Za-z_-]{20,})/)
    if (m1) return {type:'channelId', value:m1[1]}
    const m2 = u.pathname.match(/\/(@[A-Za-z0-9._-]+)/)
    if (m2) return {type:'handle', value:m2[1]}
  }catch{}
  return {type:'name', value:s}
}
async function resolveChannelId(ref){
  const h = parseRef(ref)
  if (h.type === 'channelId') return h.value
  if (h.type === 'handle'){
    const j = await api('channels', { part:'id', forHandle:h.value })
    const id = j.items?.[0]?.id
    if (!id) throw new Error(`Handle non trovato: ${h.value}`)
    return id
  }
  const j = await api('search', { part:'snippet', q:h.value, type:'channel', maxResults:1 })
  const id = j.items?.[0]?.id?.channelId || j.items?.[0]?.snippet?.channelId
  if (!id) throw new Error(`Channel non trovato: ${h.value}`)
  return id
}
async function uploadsPlaylistId(channelId){
  const j = await api('channels', { part:'contentDetails', id:channelId })
  const id = j.items?.[0]?.contentDetails?.relatedPlaylists?.uploads
  if (!id) throw new Error(`Uploads non trovata per ${channelId}`)
  return id
}
async function listUploads(plId){
  const out = []; let pageToken = ''
  do{
    const j = await api('playlistItems', {
      part:'snippet,contentDetails', maxResults:50, playlistId:plId, pageToken
    })
    for (const it of j.items || []){
      const id = it.contentDetails?.videoId
      const title = it.snippet?.title || ''
      const channelTitle = it.snippet?.channelTitle || ''
      const channelId = it.snippet?.channelId || ''
      if (id && title) out.push({ id, title, channelTitle, channelId })
    }
    pageToken = j.nextPageToken || ''
    await sleep(60)
  } while(pageToken)
  return out
}

function loadJSON(p){
  return JSON.parse(fs.readFileSync(p,'utf8'))
}
function loadData(p){
  const raw = fs.readFileSync(p,'utf8')
  const json = JSON.parse(raw)
  const arr = Array.isArray(json) ? json : (json.recipes || [])
  return { raw, json, arr }
}
function saveData(p, original, arr){
  const out = Array.isArray(original) ? arr : { ...original, recipes: arr }
  fs.writeFileSync(p, JSON.stringify(out, null, 2))
}
function sha(x){ return crypto.createHash('sha1').update(JSON.stringify(x)).digest('hex') }

async function buildCatalog(refs, cachePath){
  try{ return loadJSON(cachePath) }catch{}
  const ids = []
  for (const r of refs){
    try{ ids.push(await resolveChannelId(r)) }catch(e){ console.error(e.message) }
    await sleep(80)
  }
  const cat = []
  for (const id of ids){
    try{
      const pl = await uploadsPlaylistId(id)
      const vids = await listUploads(pl)
      cat.push(...vids)
    }catch(e){ console.error(e.message) }
  }
  fs.mkdirSync(path.dirname(cachePath), { recursive:true })
  fs.writeFileSync(cachePath, JSON.stringify(cat, null, 2))
  return cat
}

;(async () => {
  const cfg = loadJSON(CHANNELS_PATH)
  const primaryRefs = (cfg.primary || []).map(c => c.channelId || c.handle || c.url || c.name)
  const fallbackRefs = (cfg.fallback || []).map(c => c.channelId || c.handle || c.url || c.name)

  const catalogPrimary = await buildCatalog(primaryRefs, CATALOG_PRIMARY)
  const catalogFallback = await buildCatalog(fallbackRefs, CATALOG_FALLBACK)

  const { json: original, arr: recipes } = loadData(DATA_PATH)
  const index = []
  let updated = 0

  for (const r of recipes){
    // lock manuale
    if (r.youtubeIdLock && String(r.youtubeIdLock).trim().length === 11){
      if (r.youtubeId !== r.youtubeIdLock){ r.youtubeId = r.youtubeIdLock; updated++ }
      index.push({ title:r.title, youtubeId:r.youtubeId, matchTitle:'LOCKED', channelTitle:'LOCKED', confidence:1 })
      continue
    }

    const query = r.youtubeQuery || r.title
    const must = Array.isArray(r.youtubeMustInclude) && r.youtubeMustInclude.length
      ? r.youtubeMustInclude.map(norm)
      : tokens(query)
    const banned = Array.isArray(r.youtubeMustNotInclude) ? r.youtubeMustNotInclude.map(norm) : []
    const minScore = r.youtubeMinScore || 0.5

    function pickBest(catalog){
      const cand = catalog.filter(v =>
        includesAll(v.title, must) && includesNone(v.title, banned)
      )
      let best = null
      for (const v of cand){
        const sc = jaccard(query, v.title)
        if (!best || sc > best.sc) best = { ...v, sc }
      }
      return best
    }

    // 1. solo canali primari
    let best = pickBest(catalogPrimary)

    // 2. se non trovato, prova canali fallback
    if (!best || best.sc < minScore){
      best = pickBest(catalogFallback)
    }

    if (best && best.sc >= minScore){
      if (r.youtubeId !== best.id){ r.youtubeId = best.id; updated++ }
      index.push({
        title:r.title, youtubeId:r.youtubeId,
        matchTitle:best.title, channelTitle:best.channelTitle,
        confidence:Number(best.sc.toFixed(3))
      })
    } else {
      // lascia vuoto se non siamo sicuri
      index.push({ title:r.title, youtubeId:r.youtubeId || '', matchTitle:'', channelTitle:'', confidence:0 })
    }
  }

  fs.writeFileSync(INDEX_OUT, JSON.stringify(index, null, 2))

  const before = sha(original)
  saveData(DATA_PATH, original, recipes)
  const after = sha(JSON.parse(fs.readFileSync(DATA_PATH,'utf8')))

  console.log(`Catalogo primario: ${catalogPrimary.length}`)
  console.log(`Catalogo fallback: ${catalogFallback.length}`)
  console.log(`Ricette aggiornate: ${updated}`)
  console.log(`Indice creato: ${path.relative(ROOT, INDEX_OUT)}`)
  console.log(before === after ? 'Nessuna modifica al file ricette' : 'File ricette aggiornato')
})().catch(err => { console.error(err); process.exit(1) })
