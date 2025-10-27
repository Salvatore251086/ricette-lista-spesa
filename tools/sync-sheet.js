/* tools/sync-sheet.js */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import https from 'https'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const SHEET_CSV_URL = process.env.SHEET_CSV_URL || ''
if (!SHEET_CSV_URL) {
  console.error('Manca SHEET_CSV_URL')
  process.exit(1)
}

function fetchCSV(url) {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      if (res.statusCode !== 200) return reject(new Error('HTTP ' + res.statusCode))
      let data = ''
      res.setEncoding('utf8')
      res.on('data', c => data += c)
      res.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

function splitCSVLine(line) {
  const out = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"' && line[i+1] === '"') { cur += '"'; i++ }
    else if (ch === '"') q = !q
    else if (ch === ',' && !q) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

function parseCSV(csv) {
  const lines = csv.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const headers = lines[0].split(',').map(h => h.trim())
  const rows = []
  for (let i = 1; i < lines.length; i++) {
    const raw = splitCSVLine(lines[i])
    const obj = {}
    headers.forEach((h, idx) => obj[h] = (raw[idx] || '').trim())
    rows.push(obj)
  }
  return rows
}

const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim()

function toArray(s, sep) {
  if (!s) return []
  return (typeof sep === 'string' ? s.split(sep) : s.split(sep))
    .map(x => x.trim()).filter(Boolean)
}

function rowToRecipe(r) {
  const tags = toArray(r.tags, ',')
  const ings = toArray(r.ingredients, /\r?\n|;/).map(x => ({
    ref: norm(x).toLowerCase(),
    text: x
  }))
  const out = {
    title: r.title || 'Senza titolo',
    url: r.url || '',
    image: r.image || '',
    time: Number(r.time || 0) || undefined,
    servings: Number(r.servings || 0) || undefined,
    tags,
    youtubeId: r.youtubeId ? String(r.youtubeId).trim() : undefined,
    ingredients: ings.length ? ings : undefined,
    steps: r.steps || undefined
  }
  Object.keys(out).forEach(k => {
    if (out[k] === '' || out[k] === undefined) delete out[k]
    if (Array.isArray(out[k]) && out[k].length === 0) delete out[k]
  })
  return out
}

function sortRecipes(list) {
  return list.slice().sort((a,b)=> norm(a.title).toLowerCase().localeCompare(norm(b.title).toLowerCase(), 'it'))
}

async function main() {
  console.log('Scarico CSV...')
  const csv = await fetchCSV(SHEET_CSV_URL)
  const rows = parseCSV(csv)
  const recipes = sortRecipes(rows.map(rowToRecipe))

  const outDir = path.join(__dirname, '..', 'assets', 'json')
  const outFile = path.join(outDir, 'recipes-it.json')

  fs.mkdirSync(outDir, { recursive: true })
  const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : ''
  const next = JSON.stringify(recipes, null, 2) + '\n'

  if (prev === next) {
    console.log('Nessuna modifica')
    return
  }
  fs.writeFileSync(outFile, next, 'utf8')
  console.log('Aggiornato', outFile)
}

main().catch(err => { console.error(err); process.exit(1) })
