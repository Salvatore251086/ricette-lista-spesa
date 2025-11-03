// script/merge_recipes.mjs
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'assets', 'json')
const jsonlPath = join(outDir, 'recipes-index.jsonl')
const outPath = join(outDir, 'recipes-it.json')
const backupPath = join(outDir, `recipes-it.backup.${new Date().toISOString().replace(/[:.]/g,'-')}.json`)

await mkdir(outDir, { recursive: true })

function keyOf(r){
  const base = [r.title, ...(r.ingredients||[]).map(i=>i.name)].join('|').toLowerCase()
  return createHash('sha1').update(base).digest('hex')
}

function normalize(r){
  return {
    id: r._id || keyOf(r),
    title: r.title?.trim() || '',
    image: r.image || '',
    servings: r.servings || 0,
    prepTime: Number(r.prepTime||0) || 0,
    cookTime: Number(r.cookTime||0) || 0,
    difficulty: r.difficulty || 'easy',
    category: r.category || [],
    tags: r.tags || [],
    ingredients: (r.ingredients||[]).map(i=>({
      name: i.name,
      quantity: Number(i.quantity||i.qty||1) || 1,
      unit: i.unit || ''
    })),
    steps: r.steps || [],
    sourceUrl: r.sourceUrl || '',
    youtubeId: r.youtubeId || ''
  }
}

async function main(){
  let lines
  try{
    lines = (await readFile(jsonlPath,'utf-8')).split('\n').filter(Boolean)
  }catch{
    lines = []
  }

  const map = new Map()
  for(const line of lines){
    try{
      const r = JSON.parse(line)
      const k = keyOf(r)
      if(!map.has(k)) map.set(k, normalize(r))
    }catch{}
  }

  const recipes = Array.from(map.values())
  const data = { recipes }

  // backup vecchio file se esiste
  try{
    const old = await readFile(outPath, 'utf-8')
    await writeFile(backupPath, old, 'utf-8')
  }catch{}

  await writeFile(outPath, JSON.stringify(data, null, 2), 'utf-8')

  // scrivi anche un piccolo report
  await writeFile(join(outDir, 'merge_last.json'), JSON.stringify({
    total: recipes.length,
    ts: new Date().toISOString()
  }, null, 2))

  console.log('Merged recipes:', recipes.length)
}

await main()
