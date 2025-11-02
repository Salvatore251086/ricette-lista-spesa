import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'assets', 'json')
const srcJsonl = join(outDir, 'recipes-index.jsonl')
const dstJson = join(outDir, 'recipes-it.json')

await mkdir(outDir, { recursive: true })

function toAppRecipe(r){
  return {
    id: r._id,
    title: r.title,
    image: r.image || '',
    prepTime: Number(r.prepTime || 0),
    cookTime: Number(r.cookTime || 0),
    ingredients: r.ingredients || [],
    tags: r.tags || [],
    sourceUrl: r.sourceUrl,
    youtubeId: ''
  }
}

async function main(){
  let lines
  try{
    lines = (await readFile(srcJsonl,'utf-8')).split('\n').filter(x=>x.trim())
  }catch{
    lines = []
  }

  const map = new Map()
  for(const line of lines){
    try{
      const obj = JSON.parse(line)
      map.set(obj._id, obj)
    }catch{}
  }

  const BLOCK = 2000
  const items = Array.from(map.values()).slice(0, BLOCK).map(toAppRecipe)

  const out = { recipes: items }
  await writeFile(dstJson, JSON.stringify(out, null, 2), 'utf-8')
  await writeFile(join(outDir, 'merge_last.json'), JSON.stringify({
    snapshot: items.length,
    ts: new Date().toISOString()
  }, null, 2), 'utf-8')

  console.log('Snapshot', items.length)
}

await main()
