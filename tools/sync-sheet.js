// tools/sync-sheet.js
// Legge CSV pubblicato, normalizza campi IT/EN, salva assets/json/recipes-it.json

import fs from 'fs/promises'

const CSV_URL = process.env.SHEET_CSV_URL
if (!CSV_URL) {
  console.error('Manca SHEET_CSV_URL')
  process.exit(1)
}

function norm(s) {
  return String(s || '').trim()
}

function splitTags(s) {
  return norm(s).split(/[,;|/]+/).map(x => x.trim()).filter(Boolean)
}

function parseCSV(text) {
  const rows = []
  // parser semplice che rispetta virgolette
  let i = 0, cur = '', cell = '', inQ = false, row = []
  while (i < text.length) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { cell += '"' ; i += 2 ; continue }
        inQ = false
        i++
        continue
      }
      cell += c
      i++
      continue
    }
    if (c === '"') { inQ = true ; i++ ; continue }
    if (c === ',') { row.push(cell) ; cell = '' ; i++ ; continue }
    if (c === '\n') { row.push(cell) ; rows.push(row) ; row = [] ; cell = '' ; i++ ; continue }
    if (c === '\r') { i++ ; continue }
    cell += c
    i++
  }
  row.push(cell)
  rows.push(row)
  return rows
}

function buildMapper(headersRaw) {
  const headers = headersRaw.map(h => norm(h).toLowerCase())
  const idx = nameLike => {
    for (let i = 0; i < headers.length; i++) {
      if (nameLike.test(headers[i])) return i
    }
    return -1
  }
  return {
    iTitle:    idx(/^(title|titolo|nome|name)$/),
    iUrl:      idx(/^(url|link|sorgente|pagina|href)$/),
    iTags:     idx(/^(tags?|categorie|category)$/),
    iYt:       idx(/^(ytid|youtube|video|video_id|video_url)$/),
    iImage:    idx(/^(image|img|immagine|foto)$/),
    iTime:     idx(/^(time|tempo|minuti|mins?)$/),
    iServ:     idx(/^(servings?|porzioni|dosi?)$/)
  }
}

function rowToObj(row, m) {
  const get = i => i >= 0 ? norm(row[i]) : ''
  const title = get(m.iTitle) || 'Senza titolo'
  const url   = get(m.iUrl)
  const tags  = splitTags(get(m.iTags))
  const ytid  = (() => {
    const v = get(m.iYt)
    if (!v) return ''
    const mId = v.match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/)
    return mId ? mId[1] : v.length === 11 ? v : ''
  })()
  const image = get(m.iImage)
  const time  = get(m.iTime)
  const serv  = get(m.iServ)

  return {
    title,
    url,
    tags,
    image: image || 'assets/icons/icon-512.png',
    time: time || '',
    servings: serv || '',
    ytid
  }
}

const res = await fetch(CSV_URL, { cache: 'no-store' })
if (!res.ok) {
  console.error('HTTP', res.status)
  process.exit(1)
}
const text = await res.text()
const table = parseCSV(text)
if (!table.length) {
  console.error('CSV vuoto')
  process.exit(1)
}
const mapper = buildMapper(table[0])
const out = []
for (let r = 1; r < table.length; r++) {
  const obj = rowToObj(table[r], mapper)
  // scarta righe senza titolo e url e ytid e tags
  const hasInfo = obj.title && (obj.url || obj.ytid || obj.tags.length)
  if (hasInfo) out.push(obj)
}

await fs.mkdir('assets/json', { recursive: true })
await fs.writeFile('assets/json/recipes-it.json', JSON.stringify(out, null, 2), 'utf8')
console.log('Aggiornato assets/json/recipes-it.json con', out.length, 'ricette')
