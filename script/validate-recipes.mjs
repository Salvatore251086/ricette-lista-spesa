#!/usr/bin/env node
// uso: node script/validate-recipes.mjs assets/json/recipes-it.json report.json

import fs from 'node:fs'
import { URL } from 'node:url'

const file = process.argv[2]
const reportFile = process.argv[3] || null
if (!file) { console.error('Passa il percorso del JSON ricette'); process.exit(1) }

const ALLOWED = new Set([
  'ricette.giallozafferano.it',
  'www.giallozafferano.it',
  'blog.giallozafferano.it',
  'www.fattoincasadabenedetta.it',
  'www.cucchiaio.it',
  'www.misya.info',
  'www.lacucinaitaliana.it',
  'www.youtube.com',
  'youtu.be'
])

const txt = fs.readFileSync(file, 'utf8')
let data
try { data = JSON.parse(txt) } catch (e) {
  console.error('JSON non valido:', e.message)
  process.exit(2)
}
if (!Array.isArray(data)) {
  console.error('Il file deve contenere un array di ricette')
  process.exit(2)
}

const errors = []
const ids = new Set()

function isYouTubeHost(h){
  return h === 'www.youtube.com' || h === 'youtu.be' || h === 'www.youtube-nocookie.com'
}
function getYtId(v){
  if (!v) return ''
  if (!v.includes('http')) return v
  try {
    const u = new URL(v)
    if (u.hostname === 'youtu.be') return u.pathname.split('/')[1] || ''
    if (u.hostname === 'www.youtube.com'){
      if (u.pathname === '/watch') return u.searchParams.get('v') || ''
      if (u.pathname.startsWith('/shorts/')) return u.pathname.split('/')[2] || ''
      if (u.pathname.startsWith('/embed/')) return u.pathname.split('/')[2] || ''
    }
    return ''
  } catch { return '' }
}
function isIdLike(s){ return /^[A-Za-z0-9_-]{11}$/.test(s) }

data.forEach((r, idx) => {
  const where = `ricetta[${idx}]`

  // id
  if (!r.id || typeof r.id !== 'string') errors.push(`${where}: id mancante o non stringa`)
  else {
    if (ids.has(r.id)) errors.push(`${where}: id duplicato "${r.id}"`)
    ids.add(r.id)
  }

  // title
  if (!r.title || typeof r.title !== 'string') errors.push(`${where}: title mancante o non stringa`)

  // url
  if (!r.url || typeof r.url !== 'string' || !r.url.startsWith('https://')) {
    errors.push(`${where}: url mancante o non https`)
  } else {
    try {
      const u = new URL(r.url)
      if (!ALLOWED.has(u.hostname) && !isYouTubeHost(u.hostname)) {
        errors.push(`${where}: dominio non permesso ${u.hostname}`)
      }
    } catch {
      errors.push(`${where}: url non valido`)
    }
  }

  // video
  if (r.video != null) {
    const id = getYtId(String(r.video))
    if (!id) errors.push(`${where}: video non riconosciuto come ID/URL YouTube`)
    else if (!isIdLike(id)) errors.push(`${where}: video ID non valido`)
  }

  // ingredients formato misto ok, ma almeno uno presente
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    errors.push(`${where}: ingredients mancante o vuoto`)
  }

  // campi numerici base
  if (r.time != null && Number.isNaN(parseInt(r.time, 10))) {
    errors.push(`${where}: time non numerico`)
  }
})

if (reportFile && fs.existsSync(reportFile)) {
  try {
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
    const bad = report.filter(x => x.needs_fix)
    bad.forEach(x => {
      errors.push(`link non valido per id "${x.id}" (${x.url})`)
    })
  } catch {
    // ignora report rotto
  }
}

if (errors.length) {
  console.error('Errori trovati:')
  errors.forEach(e => console.error('-', e))
  process.exit(3)
}
console.log('OK dati ricette')
