// script/crawl_recipes.mjs
// Legge assets/json/recipes-index.jsonl
// Scarica HTML, invoca parser, scrive JSONL temporaneo

import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseFromHtml as parseCucchiaio } from './parsers/cucchiaio.mjs'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const INDEX_PATH = `${ROOT}/assets/json/recipes-index.jsonl`
const OUT_JSONL = `${ROOT}/assets/json/recipes-it.tmp.jsonl`
const CRAWL_LAST = `${ROOT}/assets/json/crawl_last.json`

async function ensureFile(path) {
  try { await access(path) } catch {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, '')
  }
}

function pickParser(url) {
  const u = new URL(url)
  const host = u.hostname.replace(/^www\./, '')
  if (host === 'cucchiaio.it') return parseCucchiaio
  if (host === 'cucchiaio.it'.replace(/^www\./, '')) return parseCucchiaio
  if (host === 'www.cucchiaio.it') return parseCucchiaio
  return null
}

async function* readJsonl(path) {
  const txt = await readFile(path, 'utf8').catch(() => '')
  if (!txt) return
  for (const line of txt.split(/\r?\n/)) {
    const s = line.trim()
    if (!s) continue
    try { yield JSON.parse(s) } catch { /* ignore */ }
  }
}

async function main() {
  await ensureFile(INDEX_PATH)
  await ensureFile(OUT_JSONL)

  const out = createWriteStream(OUT_JSONL, { flags: 'a' })
  let total = 0
  let ok = 0
  let skipped = 0
  let failed = 0

  // batch limit per run
  const LIMIT = Number(process.env.CRAWL_LIMIT || 50)
  for await (const rec of readJsonl(INDEX_PATH)) {
    if (!rec || !rec.url) continue
    if (total >= LIMIT) break
    total += 1

    const parser = pickParser(rec.url)
    if (!parser) {
      skipped += 1
      continue
    }

    try {
      const res = await fetch(rec.url, {
        redirect: 'follow',
        headers: {
          'user-agent': 'RLS-Crawler/1.1 (https://github.com)',
          'accept': 'text/html,application/xhtml+xml'
        }
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const html = await res.text()
      const item = parser(html, rec.url)
      if (item && item.title && item.ingredients && item.ingredients.length > 0) {
        out.write(JSON.stringify(item) + '\n')
        ok += 1
      } else {
        failed += 1
      }
    } catch {
      failed += 1
    }
  }

  out.end()
  const stamp = {
    ts: new Date().toISOString(),
    processed: total,
    ok,
    skipped,
    failed
  }
  await writeFile(CRAWL_LAST, JSON.stringify(stamp, null, 2))
  console.log(JSON.stringify(stamp))
}

main()
