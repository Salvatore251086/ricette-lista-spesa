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
  'youtu.be',
  'www.youtube-nocookie.com'
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
const warnings = []
const ids = new Set()

function isYtHost(h){
  return h === 'www.youtube.com' || h === 'youtu.be' || h === 'www.youtube-nocookie.com'
}
function ytId(v){
  if (!v) return ''
  if (!String(v).includes('http')) return String(v)
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

  if (!r.id || typeof r.id !== 'string') errors.push(`${where}: id mancante o non stringa`)
  else {
    if (ids.has(r.id)) errors.push(`${where}: id duplicato "${r.id}"`)
    ids.add(r.id)
  }

  if (!r.title || typeof r.title !== 'string') errors.push(`${where}: title mancante o non stringa`)

  if (!r.url || typeof r.url !== 'string' || !r.url.startsWith('https://')) {
    errors.push(`${where}: url mancante o non https`)
  } else {
    try {
      const u = new URL(r.url)
      if (!ALLOWED.has(u.hostname) && !isYtHost(u.hostname)) {
        errors.push(`${where}: dominio non permesso ${u.hostname}`)
      }
    } catch {
      errors.push(`${where}: url non valido`)
    }
  }

  if (r.video != null) {
    const id = ytId(String(r.video))
    if (!id) errors.push(`${where}: video non riconosciuto come ID/URL YouTube`)
    else if (!isIdLike(id)) errors.push(`${where}: video ID non valido`)
  }

  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    errors.push(`${where}: ingredients mancante o vuoto`)
  }

  if (r.time != null && Number.isNaN(parseInt(r.time, 10))) {
    errors.push(`${where}: time non numerico`)
  }
})

// report rete, solo warning in CI
if (reportFile && fs.existsSync(reportFile)) {
  try {
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'))
    for (const x of report){
      if (x && x.url_domain_allowed === false) {
        warnings.push(`dominio non consentito nel report per id "${x.id}"`)
      } else if (x && x.needs_fix) {
        warnings.push(`link potenzialmente non raggiungibile per id "${x.id}"`)
      }
    }
  } catch {
    warnings.push('report.json non leggibile, salto i warning rete')
  }
}

if (warnings.length){
  console.log('Warning:')
  warnings.forEach(w => console.log('-', w))
}
if (errors.length){
  console.error('Errori trovati:')
  errors.forEach(e => console.error('-', e))
  process.exit(3)
}
console.log('OK dati ricette')
