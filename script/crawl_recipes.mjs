// script/crawl_recipes.mjs  — versione “visibile” + debug, più tollerante
import { readFile, writeFile, appendFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { parse } from 'node-html-parser'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outDir = join(root, 'assets', 'json')
const sourcesPath = join(outDir, 'sources.json')
const outJsonl = join(outDir, 'recipes-index.jsonl')
const debugUrlsPath = join(outDir, 'urls_last.json')
const crawlMetaPath = join(outDir, 'crawl_last.json')

await mkdir(outDir, { recursive: true })

const UA = 'RLS-Crawler/1.1 (+https://github.com/Salvatore251086/ricette-lista-spesa)'

function hash(str){ return createHash('sha1').update(str).digest('hex').slice(0,16) }

function isoToMinutes(iso){
  if(!iso || typeof iso!=='string') return 0
  const m = iso.match(/P(T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?/i)
  if(!m) return 0
  const h = Number(m[2]||0), min = Number(m[3]||0)
  return h*60+min
}

function pickRecipeObjects(json){
  const out=[]
  const walk=o=>{
    if(!o || typeof o!=='object') return
    const t=o['@type']
    if(t==='Recipe' || (Array.isArray(t) && t.includes('Recipe'))) out.push(o)
    if(Array.isArray(o)) o.forEach(walk); else Object.values(o).forEach(walk)
  }
  walk(json); return out
}

async function fetchText(url){
  try{
    const r = await fetch(url, { headers:{ 'user-agent': UA, 'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' } })
    if(!r.ok) return ''
    return await r.text()
  }catch{ return '' }
}

function extractLocsFromSitemap(xml){
  if(!xml) return []
  const locs=[]; const re=/<loc>([^<]+)<\/loc>/g; let m
  while((m=re.exec(xml))) locs.push(m[1].trim())
  return locs
}

function extractLinksFromRss(xml){
  if(!xml) return []
  const links=[]; const re=/<link>([^<]+)<\/link>/g; let m
  while((m=re.exec(xml))){ const u=m[1].trim(); if(u.startsWith('http')) links.push(u) }
  return Array.from(new Set(links))
}

function normalizeIngredients(list){
  const out=[]
  for(const raw of list||[]){
    const s=String(raw)
    const num=s.match(/[\d,.\/]+/)
    const qty=num ? Number(String(num[0]).replace(',','.'))||1 : 1
    const name=s.replace(/[\d,.\/]+/g,'').trim()
    if(name) out.push({ name, quantity:qty, unit:'' })
  }
  return out
}

function mapRecipe(url, r){
  const title=r.name||r.headline||''
  const image=Array.isArray(r.image)? r.image[0] : (r.image?.url || r.image || '')
  const prep=isoToMinutes(r.prepTime)
  const cook=isoToMinutes(r.cookTime)
  const total=isoToMinutes(r.totalTime)
  const ingredients=normalizeIngredients(r.recipeIngredient||r.ingredients||[])
  const tags=[]
  if(r.recipeCategory) tags.push(...(Array.isArray(r.recipeCategory)? r.recipeCategory : [r.recipeCategory]))
  if(r.recipeCuisine) tags.push(...(Array.isArray(r.recipeCuisine)? r.recipeCuisine : [r.recipeCuisine]))
  const id=hash(url+'|'+title)
  return { _id:id, title, image, prepTime:prep||0, cookTime:cook||(total?Math.max(total-prep,0):0), ingredients, tags, sourceUrl:url }
}

function cleanJsonString(raw){
  return String(raw)
    .replace(/\uFEFF/g,'')
    .replace(/\r/g,'')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .trim()
}

// Microdata fallback: schema.org/Recipe
function parseMicrodataRecipe(doc){
  const sel = [
    '[itemscope][itemtype*="://schema.org/Recipe"]',
    '[itemscope][itemtype*="Recipe"]'
  ].join(',')
  const root = doc.querySelector(sel)
  if(!root) return null
  const get = prop => root.querySelector(`[itemprop="${prop}"]`)
  const text = el => el?.text?.trim() || ''
  const title = text(get('name')) || text(get('headline'))
  const image = get('image')?.getAttribute('content') || get('image')?.getAttribute('src') || ''
  const ingNodes = root.querySelectorAll('[itemprop="recipeIngredient"], [itemprop="ingredients"]')
  const ingredients = ingNodes.map(n => n.text.trim()).filter(Boolean)
  const prep = get('prepTime')?.getAttribute('content') || ''
  const cook = get('cookTime')?.getAttribute('content') || ''
  const total = get('totalTime')?.getAttribute('content') || ''
  const cats = root.querySelectorAll('[itemprop="recipeCategory"], [itemprop="recipeCuisine"]').map(n=>n.text.trim()).filter(Boolean)
  return {
    name: title,
    image,
    recipeIngredient: ingredients,
    prepTime: prep,
    cookTime: cook,
    totalTime: total,
    recipeCategory: cats
  }
}

function looksLikeRecipeUrl(u){
  try{
    const p = new URL(u).pathname.toLowerCase()
    return /ricetta|ricette|recipe|recipes/.test(p)
  }catch{ return false }
}

async function loadSources(){
  const raw = await readFile(sourcesPath,'utf-8')
  const cleaned = cleanJsonString(raw)
  return JSON.parse(cleaned)
}

async function crawlSource(src){
  // niente filtro duro qui; lo applichiamo dopo con una quota
  if(src.type==='sitemap'){
    const xml = await fetchText(src.url)
    return extractLocsFromSitemap(xml)
  }
  if(src.type==='rss'){
    const xml = await fetchText(src.url)
    return extractLinksFromRss(xml)
  }
  return []
}

async function extractFromPage(url){
  const html=await fetchText(url)
  if(!html) return []
  const doc=parse(html)

  // JSON-LD, anche @graph
  const scripts=doc.querySelectorAll('script[type="application/ld+json"]')
  for(const s of scripts){
    try{
      const json = JSON.parse(cleanJsonString(s.text))
      const blobs = Array.isArray(json?.['@graph']) ? json['@graph'] : [json]
      for(const b of blobs){
        const recipes = pickRecipeObjects(b)
        if(recipes.length) return recipes.map(r=>mapRecipe(url,r))
      }
    }catch{}
  }

  // Microdata fallback
  try{
    const md = parseMicrodataRecipe(doc)
    if(md && (md.name || (md.recipeIngredient||[]).length)) return [mapRecipe(url, md)]
  }catch{}

  return []
}

async function main(){
  const sources = await loadSources()

  // 1) Costruisci set URL sorgente + debug
  const allUrls = new Set()
  for(const s of sources){
    const list = await crawlSource(s).catch(()=>[])
    // quota per sorgente, e filtro “ricetta” soft
    const filtered = list.filter(u => looksLikeRecipeUrl(u))
    const take = filtered.length ? filtered.slice(0, 500) : list.slice(0, 200) // se il filtro svuota, prendi un po’ a prescindere
    take.forEach(u => allUrls.add(u))
  }
  const urlList = Array.from(allUrls)
  await writeFile(debugUrlsPath, JSON.stringify({ count:urlList.length, urls:urlList.slice(0,2000) }, null, 2))

  // 2) Carica visti
  const seen = new Set()
  try{
    const old = await readFile(outJsonl,'utf-8')
    for(const line of old.split('\n')){ const t=line.trim(); if(!t) continue; seen.add(JSON.parse(t)._id) }
  }catch{}

  // 3) Scansione
  let scanned=0, added=0
  for(const url of urlList){
    scanned++
    const recs = await extractFromPage(url)
    for(const r of recs){
      if(seen.has(r._id)) continue
      await appendFile(outJsonl, JSON.stringify(r)+'\n', 'utf-8')
      seen.add(r._id)
      added++
    }
  }

  // 4) Meta
  await writeFile(crawlMetaPath, JSON.stringify({ scanned, added, total: seen.size, ts: new Date().toISOString() }, null, 2))
  console.log('Scanned', scanned, 'Added', added, 'Total', seen.size)
}

await main()
