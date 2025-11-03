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

await mkdir(outDir, { recursive: true })

const UA = 'RLS-Crawler/1.1 (+https://github.com/
)'

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

// fetch "morbido"
async function fetchText(url){
try{
const r = await fetch(url, { headers:{'user-agent':UA} })
if(!r.ok) return ''
return await r.text()
}catch{ return '' }
}

function extractLocsFromSitemap(xml){
if(!xml) return []
const locs=[]; const re=/<loc>([^<]+)</loc>/g; let m
while((m=re.exec(xml))) locs.push(m[1].trim())
return locs.slice(0, 3000)
}
function extractLinksFromRss(xml){
if(!xml) return []
const links=[]; const re=/<link>([^<]+)</link>/g; let m
while((m=re.exec(xml))){ const u=m[1].trim(); if(u.startsWith('http')) links.push(u) }
return Array.from(new Set(links)).slice(0,1500)
}

function normalizeIngredients(list){
const out=[]
for(const raw of list||[]){
const s=String(raw)
const num=s.match(/[\d,./]+/)
const qty=num ? Number(String(num[0]).replace(',','.'))||1 : 1
const name=s.replace(/[\d,./]+/g,'').trim()
out.push({ name, quantity:qty, unit:'' })
}
return out.filter(x=>x.name)
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

function parseMicrodataRecipe(doc){
const root = doc.querySelector('[itemscope][itemtype*="Recipe"]')
if(!root) return null
const get = prop => root.querySelector([itemprop="${prop}"])
const title = get('name')?.text?.trim() || ''
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
const url = new URL(u)
const p = url.pathname.toLowerCase()
return /ricetta|ricette|recipe|recipes/.test(p)
}catch{ return false }
}

async function loadSources(){
const raw = await readFile(sourcesPath,'utf-8')
const cleaned = cleanJsonString(raw)
return JSON.parse(cleaned)
}

async function crawlSource(src){
if(src.type==='sitemap'){
const xml = await fetchText(src.url)
return extractLocsFromSitemap(xml).filter(looksLikeRecipeUrl)
}
if(src.type==='rss'){
const xml = await fetchText(src.url)
return extractLinksFromRss(xml).filter(looksLikeRecipeUrl)
}
return []
}

async function extractFromPage(url){
const html=await fetchText(url)
if(!html) return []
const doc=parse(html)

// 1) JSON-LD
const scripts=doc.querySelectorAll('script[type="application/ld+json"]')
for(const s of scripts){
try{
const json=JSON.parse(cleanJsonString(s.text))
const recipes=pickRecipeObjects(json)
if(recipes.length) return recipes.map(r=>mapRecipe(url,r))
}catch{}
}

// 2) Microdata fallback
try{
const md = parseMicrodataRecipe(doc)
if(md) return [mapRecipe(url, md)]
}catch{}

return []
}

async function main(){
const sources=await loadSources()
const urls=new Set()
for(const s of sources){
const list=await crawlSource(s).catch(()=>[])
list.forEach(u=>urls.add(u))
}

const seen=new Set()
try{
const old=await readFile(outJsonl,'utf-8')
for(const line of old.split('\n')){ if(!line.trim()) continue; const obj=JSON.parse(line); seen.add(obj._id) }
}catch{}

let scanned=0, added=0
for(const url of urls){
scanned++
const recs=await extractFromPage(url)
for(const r of recs){
if(seen.has(r._id)) continue
await appendFile(outJsonl, JSON.stringify(r)+'\n','utf-8')
seen.add(r._id); added++
}
}
await writeFile(join(outDir,'crawl_last.json'), JSON.stringify({added, scanned, total:seen.size, ts:new Date().toISOString()},null,2))
console.log('Scanned', scanned, 'Added', added, 'Total', seen.size)
}

await main()
