// script/resolve-youtube-ids.mjs
// Output: assets/json/video_index.json { title, youtubeId, matchTitle, channelTitle, channelId, confidence }

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const RECIPES = path.join(ROOT, 'assets', 'json', 'recipes-it.json')
const OUT = path.join(ROOT, 'assets', 'json', 'video_index.json')

const ALLOWED = new Set([
  'UCj3NcgJQJz0B2s3AqJ4vMwA',
  'UC3d5qL6Q9sH9PqO0F6d0kbg',
  'UCmS4G0rKQ2F0r2m6y0xMari'
])

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)) }
function fold(s){
  return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
}
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
  const channelId =
    (/"channelId":"([a-zA-Z0-9_-]{10,})"/.exec(html)?.[1]) ||
    (/itemprop="channelId" content="([a-zA-Z0-9_-]{10,})"/.exec(html)?.[1]) || ''
  const title =
    (/"title":{"runs":\[\{"text":"([^"]{1,200})"/.exec(html)?.[1]) ||
    (/<meta name="title" content="([^"]{1,200})"/.exec(html)?.[1]) || ''
  const channelTitle =
    (/"ownerChannelName":"([^"]{1,200})"/.exec(html)?.[1]) ||
    (/itemprop="author" content="([^"]{1,200})"/.exec(html)?.[1]) || ''
  return { channelId, title, channelTitle }
}
function extractId(input){
  const s = String(input||'').trim()
  if(/^[a-zA-Z0-9_-]{11}$/.test(s)) return s
  try{
    const u = new URL(s)
    if(u.hostname.includes('youtube.com')) return u.searchParams.get('v') || ''
    if(u.hostname === 'youtu.be') return u.pathname.slice(1)
  }catch{}
  return ''
}

async function validateId(id){
  const o = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`)
  if(!o.ok) return null
  const watch = await fetch(`https://www.youtube.com/watch?v=${id}`, { headers:{ 'Accept-Language':'en' } })
  if(!watch.ok) return null
  const html = await watch.text()
  const meta = extractFromWatch(html)
  return { id, ...meta }
}

async function searchCandidates(q){
  const url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q)
  const res = await fetch(url, { headers:{ 'Accept-Language':'en' } })
  if(!res.ok) return []
  const html = await res.text()
  return extractIdsFromSearch(html)
}

async function resolveForRecipe(r){
  const out = { title: r.title || '', youtubeId: '', matchTitle: '', channelTitle: '', channelId: '', confidence: 0 }

  const seedId = extractId(r.youtubeId || r.youtube || '')
  if(seedId){
    const meta = await validateId(seedId)
    if(meta && ALLOWED.has(meta.channelId)){
      out.youtubeId = meta.id
      out.matchTitle = meta.title
      out.channelTitle = meta.channelTitle
      out.channelId = meta.channelId
      out.confidence = tokenScore(r.title||'', meta.title||'')
      return out
    }
  }

  const q = `${r.title||''} ricetta`
  const ids = await searchCandidates(q)
  for(const id of ids){
    const meta = await validateId(id)
    if(!meta) continue
    if(!ALLOWED.has(meta.channelId)) continue
    out.youtubeId = meta.id
    out.matchTitle = meta.title
    out.channelTitle = meta.channelTitle
    out.channelId = meta.channelId
    out.confidence = tokenScore(r.title||'', meta.title||'')
    return out
  }

  return out
}

async function main(){
  const raw = JSON.parse(await fs.readFile(RECIPES, 'utf8'))
  const recipes = Array.isArray(raw.recipes) ? raw.recipes : []
  const results = []
  let i = 0

  for(const r of recipes){
    i++
    try{
      const row = await resolveForRecipe(r)
      results.push(row)
      await sleep(800)
    }catch{
      results.push({ title:r.title||'', youtubeId:'', matchTitle:'', channelTitle:'', channelId:'', confidence:0 })
    }
    if(i % 25 === 0) console.log(`Processed ${i}/${recipes.length}`)
  }

  await fs.mkdir(path.dirname(OUT), { recursive:true })
  await fs.writeFile(OUT, JSON.stringify(results, null, 2), 'utf8')
  console.log(`Wrote ${OUT} with ${results.length} rows`)
}

main().catch(err=>{ console.error(err); process.exit(1) })
