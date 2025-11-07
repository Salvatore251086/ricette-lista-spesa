// tools/build-video-map.js
// Esegui con: node tools/build-video-map.js

const fs = require('fs')
const path = require('path')

const RECIPES_PATH = path.join(__dirname, '..', 'assets', 'json', 'recipes-it.json')
const VIDEO_INPUT_PATH = path.join(__dirname, '..', 'assets', 'json', 'video_index.raw.json')
const VIDEO_OUTPUT_PATH = path.join(__dirname, '..', 'assets', 'json', 'video_index.resolved.json')
const REPORT_PATH = path.join(__dirname, '..', 'assets', 'json', 'video_audit_report.json')

const MIN_CONF = 0.7

run()

function run () {
  const recipesRaw = readJson(RECIPES_PATH)
  const videosRaw = readJson(VIDEO_INPUT_PATH, [])

  const recipes = unwrapRecipes(recipesRaw).map(normalizeRecipe)
  const videos = normalizeVideos(videosRaw)

  const videoIndex = buildVideoIndex(videos)

  const resolved = []
  const missing = []

  recipes.forEach(r => {
    const match = findBestVideo(r, videoIndex)
    if (match) {
      resolved.push({
        title: r.title,
        slug: r.slug,
        youtubeId: match.youtubeId,
        source: match.source || '',
        confidence: match.confidence
      })
    } else {
      missing.push({
        title: r.title,
        slug: r.slug
      })
    }
  })

  const dedupResolved = dedupByKey(resolved, x => x.slug || x.title)

  writeJson(VIDEO_OUTPUT_PATH, dedupResolved)
  writeJson(REPORT_PATH, {
    totalRecipes: recipes.length,
    withVideo: dedupResolved.length,
    missingVideo: missing.length,
    missingList: missing
  })

  console.log('Ricette totali:', recipes.length)
  console.log('Video mappati:', dedupResolved.length)
  console.log('Ricette senza video proposto:', missing.length)
}

function readJson (file, fallback = null) {
  try {
    const raw = fs.readFileSync(file, 'utf8')
    return JSON.parse(raw)
  } catch (e) {
    return fallback
  }
}

function writeJson (file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8')
}

function unwrapRecipes (raw) {
  if (Array.isArray(raw)) return raw
  if (!raw || typeof raw !== 'object') return []

  if (Array.isArray(raw.recipes)) return raw.recipes
  if (Array.isArray(raw.data)) return raw.data

  if (raw.recipes && typeof raw.recipes === 'object') {
    return Object.values(raw.recipes)
  }
  if (raw.data && typeof raw.data === 'object') {
    return Object.values(raw.data)
  }

  const keys = Object.keys(raw)
  for (const k of keys) {
    const v = raw[k]
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') return v
  }
  for (const k of keys) {
    const v = raw[k]
    if (v && typeof v === 'object') {
      const vals = Object.values(v)
      if (vals.length && typeof vals[0] === 'object') return vals
    }
  }
  return []
}

function normalizeRecipe (r, index) {
  const title = String(r.title || r.name || r.recipeTitle || '').trim()
  const slug = (r.slug && String(r.slug).trim()) || slugify(title || 'ricetta-' + index)

  const directYt = String(
    r.youtubeId ||
    r.youtube_id ||
    r.ytId ||
    r.yt ||
    r.youtube ||
    ''
  ).trim()

  return {
    id: index,
    title,
    slug,
    youtubeId: directYt
  }
}

function normalizeVideos (videos) {
  if (!Array.isArray(videos)) return []
  return videos
    .map(v => {
      const title = String(v.title || '').trim()
      const slug = String(v.slug || '').trim()
      const yt = String(v.youtubeId || v.ytId || v.yt || '').trim()
      const source = String(v.source || '').trim()
      let confidence = typeof v.confidence === 'number' ? v.confidence : 0

      if (!yt) return null
      if (!title && !slug) return null

      if (confidence <= 0) confidence = 0.8

      return {
        title,
        slug,
        key: slugify(slug || title),
        youtubeId: yt,
        source,
        confidence
      }
    })
    .filter(Boolean)
}

function buildVideoIndex (videos) {
  const byKey = {}
  videos.forEach(v => {
    if (!v.key) return
    if (!byKey[v.key] || v.confidence > byKey[v.key].confidence) {
      byKey[v.key] = v
    }
  })
  return {
    byKey,
    list: videos
  }
}

function findBestVideo (recipe, index) {
  if (recipe.youtubeId) {
    return {
      youtubeId: recipe.youtubeId,
      title: recipe.title,
      key: recipe.slug,
      confidence: 1
    }
  }

  const key = slugify(recipe.slug || recipe.title)
  if (!key) return null

  const exact = index.byKey[key]
  if (exact && exact.confidence >= MIN_CONF) {
    return exact
  }

  let best = null
  let bestScore = 0

  index.list.forEach(v => {
    if (!v.key || v.confidence < MIN_CONF) return

    if (v.key === key) {
      const score = v.confidence + 0.2
      if (score > bestScore) {
        bestScore = score
        best = v
      }
      return
    }

    if (v.key.includes(key) || key.includes(v.key)) {
      const score = v.confidence * 0.9
      if (score > bestScore) {
        bestScore = score
        best = v
      }
    }
  })

  if (best && bestScore >= MIN_CONF) return best
  return null
}

function dedupByKey (arr, getKey) {
  const seen = new Set()
  const out = []
  arr.forEach(x => {
    const key = getKey(x)
    if (!key || seen.has(key)) return
    seen.add(key)
    out.push(x)
  })
  return out
}

function slugify (str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
