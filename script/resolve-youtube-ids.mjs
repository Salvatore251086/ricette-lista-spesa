// script/resolve-youtube-ids.mjs
// Legge config/project.config.json e scrive assets/json/video_index.resolved.json

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const CFG_PATH = path.join(ROOT, 'config', 'project.config.json')
const CFG_ALL = JSON.parse(await fs.readFile(CFG_PATH, 'utf8'))
const CFG = CFG_ALL.youtube || {}
const PATHS = CFG_ALL.paths || {}

const RECIPES = path.join(ROOT, PATHS.recipes || 'assets/json/recipes-it.json')
const OUT = path.join(ROOT, 'assets', 'json', 'video_index.resolved.json')

const ALLOWED_AUTHORS = new Set(
  (CFG.allowedAuthors || [])
    .map(s => String(s).toLowerCase()
      .replace(/^https?:\/\/(www\.)?youtube\.com\/@/, '')
      .replace(/^@/, '')
    )
)

function sleep(ms){ return new Promise(r => setTimeout(r, ms)) }
function fold(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase() }
function tokenScore(a, b){
  const A = new Set(fold(a).split(/\W+/).filter(Boolean))
  const B = new Set(fold(b).split(/\W+/).filter(Boolean))
  if(!A.size || !B.size) return 0
  let hit = 0
  for(const t of A) if(B.has(t)) hit++
  return hit / Math.max(A.size, B.size)
}
function unique(arr){ return [...new Set(arr)] }
function extractIdsFromSearch(html){
  const ids = [...html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)].map(m=>m[1])
  return unique(ids).slice(0, 10)
}
function extractFromWatch(html){
  const channelTitle =
    (/"ownerChannelName":"([^"]{1,200})"/.exec(html)?.[1]) ||
    (/itemprop="author" content="([^"]{1,200})"/.exec(html)?.[1]) || ''
  const title =
    (/"title":{"runs":\[\{"text":"([^"]{1,200})"/.exec(html)?.[1]) ||
    (/<meta name="title" content="([^"]{1,200})"/.exec(html)?.[1]) || ''
  const handle =
    (/twitter:site" content="@([^"]{1,100})"/.exec(html)?.[1]) || ''
  return { channelTitle, title, handle: String(handle).toLowerCase() }
}
function extractId(x){
  const s = String(x||'').trim()
  if(/^[a-zA-Z0-9_-]{11}$/.test(s)) return s
  try{
    const u = new URL(s)
    if(u.hostname.includes('youtube.com')) return u.searchParams.get('v') || ''
    if(u.hostname === 'youtu.be') return u.pathname.slice(1)
  }catch{}
  return ''
}

// valida che il video esista, ritorna metadati basilari
async function fetchMeta(id){
  const ok = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
  if(!ok.ok) return null
  const w = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers:{ 'Accept-Language':'en' } })
  if(!w.ok) return null
  const html = await w.text()
  const meta = extractFromWatch(html)
  return { id, channelTitle: meta.channelTitle, title: meta.title, handle: meta.handle || meta.channelTitle.toLowerCase().replace(/\s+/g,'') }
}

async function searchCandidates(q){
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q)
  const r = await fetch(url, { headers:{ 'Accept-Language':'en' } })
  if(!r.ok) return []
  const html = await r.text()
  return extractIdsFromSearch(html)
}

async function resolveForRecipe(r){
  const out = { title: r.title || '', youtubeId: '', matchTitle: '', channelTitle: '', channelId: '', confidence: 0 }

  // 1) se c'è un seed, prova
  const seed = extractId(r.youtubeId || r.youtube || '')
  if(seed){
    const meta = await fetchMeta(seed)
    if(meta){
      const allowed = ALLOWED_AUTHORS.size === 0 ? true : ALLOWED_AUTHORS.has(meta.handle) || ALLOWED_AUTHORS.has(meta.channelTitle.toLowerCase())
      if(allowed){
        out.youtubeId = meta.id
        out.matchTitle = meta.title
        out.channelTitle = meta.channelTitle
        out.confidence = tokenScore(r.title||'', meta.title||'')
        return out
      }
    }
  }

  // 2) cerca video e prova SOLO canali consentiti
  const q = `${r.title||''} ricetta`
  const ids = await searchCandidates(q)

  for(const id of ids){
    const meta = await fetchMeta(id)
    if(!meta) continue
    const allowed = ALLOWED_AUTHORS.size === 0 ? true : ALLOWED_AUTHORS.has(meta.handle) || ALLOWED_AUTHORS.has(meta.channelTitle.toLowerCase())
    if(allowed){
      out.youtubeId = meta.id
      out.matchTitle = meta.title
      out.channelTitle = meta.channelTitle
      out.confidence = tokenScore(r.title||'', meta.title||'')
      return out
    }
  }

  // 3) fallback: accetta il primo video valido, anche se non in allowedAuthors
  for(const id of ids){
    const meta = await fetchMeta(id)
    if(!meta) continue
    out.youtubeId = meta.id
    out.matchTitle = meta.title
    out.channelTitle = meta.channelTitle
    out.confidence = tokenScore(r.title||'', meta.title||'')
    return out
  }

  return out
}

async function main(){
  const raw = JSON.parse(await fs.readFile(RECIPES,'utf8'))
  let recipes = Array.isArray(raw.recipes) ? raw.recipes : []
  const LIMIT = parseInt(process.env.LIMIT || '30', 10)
  if(LIMIT > 0) recipes = recipes.slice(0, LIMIT)

  const results = []
  let i = 0
  for(const r of recipes){
    i++
    try{
      results.push(await resolveForRecipe(r))
      await sleep(800)
    }catch{
      results.push({ title:r.title||'', youtubeId:'', matchTitle:'', channelTitle:'', channelId:'', confidence:0 })
    }
    if(i % 10 === 0) console.log('Processed', i, '/', recipes.length)
  }
  await fs.mkdir(path.dirname(OUT), { recursive:true })
  await fs.writeFile(OUT, JSON.stringify(results, null, 2), 'utf8')
  console.log('Wrote', results.length, 'rows to', OUT)
}
main().catch(err=>{ console.error(err); process.exit(1) })
