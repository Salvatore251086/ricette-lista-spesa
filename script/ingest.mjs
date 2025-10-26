// scripts/ingest.mjs
// Estrae ricette da seed URLs, JSON-LD schema.org/Recipe, OpenGraph, RSS.
// Merge con assets/json/recipes-it.json, deduplica per url e titolo normalizzato.

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import fetch from 'node-fetch'
import * as cheerio from 'cheerio'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_PATH = path.join(ROOT, 'assets/json/recipes-it.json')
const SOURCES_PATH = path.join(__dirname, 'sources.json')

const sleep = ms => new Promise(r => setTimeout(r, ms))

function norm(s=''){
  return s.toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu,'')
    .replace(/[\s\W]+/g,' ')
    .trim()
}

function sha(x){ return crypto.createHash('sha1').update(x).digest('hex').slice(0,12) }

function toId(obj){
  const base = obj.url || obj.title || JSON.stringify(obj).slice(0,64)
  return sha(base)
}

function parseJSONLD($){
  const out = []
  $('script[type="application/ld+json"]').each((_, el)=>{
    try{
      const txt = $(el).contents().text().trim()
      if (!txt) return
      const json = JSON.parse(txt)
      const items = Array.isArray(json) ? json : [json]
      for (const it of items){
        const t = it['@type'] || it.type
        if (!t) continue
        const types = Array.isArray(t) ? t : [t]
        if (!types.map(String).some(x => /recipe/i.test(x))) continue
        const r = it
        const ing = (r.recipeIngredient || r.ingredients || []).map(String)
        const instr = (() => {
          const a = r.recipeInstructions
          if (!a) return []
          if (Array.isArray(a)) {
            return a.map(x => typeof x === 'string' ? x : (x.text || '')).filter(Boolean)
          }
          if (typeof a === 'string') return a.split(/\.\s+|\n/g).map(s=>s.trim()).filter(Boolean)
          return []
        })()
        const img = typeof r.image === 'string' ? r.image : Array.isArray(r.image) ? r.image[0] : r.image?.url || ''
        out.push({
          title: r.name || '',
          url: r.mainEntityOfPage?.['@id'] || r.mainEntityOfPage || '',
          image: img,
          time: Number(r.totalTime?.match(/\d+/)?.[0] || r.cookTime?.match(/\d+/)?.[0] || r.prepTime?.match(/\d+/)?.[0] || 0),
          servings: r.recipeYield ? String(r.recipeYield).replace(/[^\d]/g,'') : '',
          ingredients: ing.map(x => ({ ref: x })),
          steps: instr,
          tags: Array.from(new Set([].concat(r.recipeCategory || [], r.recipeCuisine || []))).map(String).filter(Boolean)
        })
      }
    }catch{}
  })
  return out
}

function tryYouTubeId($){
  // iframe embed
  const iframe = $('iframe[src*="youtube.com"],iframe[src*="youtu.be"]').attr('src') || ''
  const m1 = iframe.match(/(?:embed\/|v=)([A-Za-z0-9_-]{11})/)
  if (m1) return m1[1]
  // plain links
  let yid = ''
  $('a[href*="youtube.com"],a[href*="youtu.be"]').each((_,a)=>{
    if (yid) return
    const href = a.attribs?.href || ''
    const m = href.match(/(?:v=|be\/)([A-Za-z0-9_-]{11})/)
    if (m) yid = m[1]
  })
  return yid
}

function og($, p){
  const get = n => $(`meta[property="og:${n}"]`).attr('content') || ''
  return {
    title: get('title') || $('title').first().text().trim(),
    url: get('url') || p,
    image: get('image') || '',
    desc: get('description') || ''
  }
}

async function fetchHTML(url){
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0 IngestionBot',
      'accept': 'text/html,*/*'
    },
    redirect: 'follow'
  })
  if (!res.ok) throw new Error('HTTP '+res.status)
  const text = await res.text()
  return cheerio.load(text)
}

async function discoverFromFeed(feedUrl){
  const urls = new Set()
  try{
    const res = await fetch(feedUrl, { headers: { 'user-agent': 'IngestionBot' }})
    if (!res.ok) return []
    const xml = await res.text()
    const $ = cheerio.load(xml, { xmlMode: true })
    $('item > link, entry > link').each((_, el)=>{
      const href = el.attribs?.href || $(el).text()
      if (href) urls.add(href.trim())
    })
  }catch{}
  return [...urls]
}

async function crawlSeeds(conf){
  const out = new Set()
  for (const seed of conf.seedUrls){
    if (seed.endsWith('/feed') || seed.includes('/feed') || seed.endsWith('.xml')){
      const urls = await discoverFromFeed(seed)
      urls.forEach(u => out.add(u))
      await sleep(200)
      continue
    }
    try{
      const $ = await fetchHTML(seed)
      $('a[href]').each((_,a)=>{
        const href = a.attribs?.href || ''
        if (!href.startsWith('http')) return
        if (!conf.allowDomains.some(d => href.includes(d))) return
        if (/ricetta|recipe|cucina|piatto|primo|secondo|dolce/i.test($(a).text() + ' ' + href)){
          out.add(href)
        }
      })
      await sleep(250)
    }catch{}
  }
  return [...out]
}

function normalizeRecipe(r, pageOg, yid){
  const title = r.title || pageOg.title
  const url = r.url || pageOg.url
  const image = r.image || pageOg.image
  const time = Number.isFinite(r.time) ? r.time : 0
  const servings = r.servings || ''
  const ingredients = Array.isArray(r.ingredients) ? r.ingredients.filter(i => i && i.ref).slice(0, 40) : []
  const steps = Array.isArray(r.steps) ? r.steps.filter(Boolean).slice(0, 40) : []
  const tags = Array.from(new Set([...(r.tags||[])]))
  const youtubeId = yid || ''
  return {
    id: toId({url, title}),
    title, url, image, time, servings, ingredients, steps, tags, youtubeId
  }
}

async function extractFromPage(url){
  try{
    const $ = await fetchHTML(url)
    const byJsonLd = parseJSONLD($)
    const pageOg = og($, url)
    const yid = tryYouTubeId($)
    if (byJsonLd.length){
      return byJsonLd.map(r => normalizeRecipe(r, pageOg, yid)).filter(x => x.title && x.url)
    }
    // Fallback minimale con OpenGraph
    if (pageOg.title){
      return [normalizeRecipe({
        title: pageOg.title,
        url,
        image: pageOg.image,
        ingredients: [],
        steps: []
      }, pageOg, yid)].filter(x => x.title && x.url)
    }
  }catch{}
  return []
}

async function main(){
  const conf = JSON.parse(await fs.readFile(SOURCES_PATH, 'utf8'))
  const base = JSON.parse(await fs.readFile(DATA_PATH, 'utf8'))

  // indice per deduplica
  const byKey = new Map()
  const add = r => {
    const k = norm(r.title) + '|' + r.url
    if (byKey.has(k)) return
    byKey.set(k, true)
  }
  base.forEach(add)

  const collected = []
  const seedUrls = await crawlSeeds(conf)
  const limited = seedUrls.filter(u => conf.allowDomains.some(d => u.includes(d)))
  const queue = limited.slice(0, conf.maxPagesPerDomain * conf.allowDomains.length)

  for (const url of queue){
    const found = await extractFromPage(url)
    for (const r of found){
      const k = norm(r.title) + '|' + r.url
      if (!byKey.has(k)){
        collected.push(r)
        byKey.set(k, true)
      }
    }
    await sleep(300)
  }

  // merge, ordina per titolo
  const merged = [...base, ...collected]
    .filter(x => x && x.title && x.url)
    .map(r => ({ ...r, id: r.id || toId(r) }))
    .sort((a,b) => String(a.title).localeCompare(String(b.title),'it'))

  await fs.writeFile(DATA_PATH, JSON.stringify(merged, null, 2), 'utf8')
  console.log(`Base: ${base.length} | Nuove: ${collected.length} | Totale: ${merged.length}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
