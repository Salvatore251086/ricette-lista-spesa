// app.v16.js — Ricette & Lista Spesa
// Versione collegata a sezione Audit YouTube

const DATA_URL = 'assets/json/recipes-it.json'
const LS_REC_CHECK = 'REC_CHECK'

let RECIPES = []
let FILTER = { text: '' }

document.addEventListener('DOMContentLoaded', () => {
  bindUI()
  loadAndRender(true)
})

function bindUI() {
  const refresh =
    document.querySelector('#btn-refresh, [data-action="refresh"]') ||
    [...document.querySelectorAll('button')]
      .find(b => /aggiorna dati/i.test(b.textContent || ''))

  if (refresh) refresh.addEventListener('click', () => loadAndRender(true))

  const search =
    document.querySelector('#search, input[type="search"]') ||
    document.querySelector('input[placeholder*="Cerca"]')

  if (search) {
    search.addEventListener('input', e => {
      FILTER.text = (e.target.value || '').toLowerCase().trim()
      renderRecipes(RECIPES)
    })
  }

  if (!window.__videoHandlerAdded) {
    window.__videoHandlerAdded = true
    document.addEventListener('click', e => {
      const btn = e.target.closest('.btn-video')
      if (btn) {
        const id = btn.dataset.youtubeId
        if (id) openVideoNoCookie(id)
      }
      const recipeBtn = e.target.closest('.btn-recipe')
      if (recipeBtn) {
        const title = recipeBtn.dataset.title
        alert(`Mostra ricetta: ${title}`)
      }
    })
  }
}

async function loadAndRender(force) {
  const url = `${DATA_URL}?v=${Date.now()}`
  const res = await fetch(url, { cache: 'no-store' })
  const data = await res.json()
  const list = Array.isArray(data) ? data : data.recipes || []

  RECIPES = normalize(list)
  renderRecipes(RECIPES)

  try {
    const hash = await sha256(RECIPES)
    const prev = JSON.parse(localStorage.getItem(LS_REC_CHECK) || '{}')
    const changed = prev.hash != null ? prev.hash !== hash : null

    console.log('Ricette oggi:', RECIPES.length)
    if (prev.count != null) console.log('Ieri:', prev.count)
    console.log('Hash cambiato:', changed === null ? 'primo salvataggio' : changed)

    localStorage.setItem(LS_REC_CHECK, JSON.stringify({
      date: new Date().toISOString().slice(0,10),
      count: RECIPES.length,
      hash
    }))
  } catch (_) {}

  assertYoutubeIds(RECIPES)
}

function normalize(list) {
  return list.map(r => ({
    title: r.title || '',
    tags: Array.isArray(r.tags) ? r.tags : [],
    time: r.time || r.duration || '',
    portions: r.portions || r.servings || '',
    slug: r.slug || '',
    image: r.image || '',
    youtubeId: r.youtubeId || r.videoId || ''
  }))
}

function renderRecipes(list) {
  const grid =
    document.querySelector('#recipes, .recipes, .recipes-grid') ||
    document.querySelector('[data-list="recipes"]') ||
    document.body

  const rows = list
    .filter(r => {
      if (!FILTER.text) return true
      const hay = `${r.title} ${r.tags.join(' ')}`.toLowerCase()
      return hay.includes(FILTER.text)
    })
    .map(renderCard)
    .join('\n')

  grid.innerHTML = rows
}

function renderCard(r) {
  const id = r.youtubeId && String(r.youtubeId).trim()
  const btnVideoHtml = id
    ? `<button class="btn btn-video" data-youtube-id="${id}">Guarda video</button>`
    : ``

  const time = r.time ? `${r.time}` : ''
  const portions = r.portions ? `${r.portions}` : ''
  const meta = [time, portions].filter(Boolean).join(' • ')
  const tags = r.tags.join(' ')
  const img = r.image
    ? `<img src="${r.image}" alt="${escapeHtml(r.title)}" loading="lazy" onerror="this.remove()" />`
    : `<img src="assets/icons/icon-192.png" alt="placeholder" loading="lazy" />`

  return `
  <div class="card recipe-card">
    <div class="thumb">${img}</div>
    <div class="body">
      <h3 class="title3">${escapeHtml(r.title)}</h3>
      <div class="meta">${meta}</div>
      <div class="tags">${escapeHtml(tags)}</div>
      <div class="actions">
        <button class="btn btn-recipe" data-title="${escapeHtml(r.title)}">Ricetta</button>
        ${btnVideoHtml}
      </div>
    </div>
  </div>`
}

function openVideoNoCookie(id) {
  const watch = `https://www.youtube.com/watch?v=${id}`
  const embed = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`
  const win = window.open('about:blank', '_blank')
  let done = false

  const to = setTimeout(() => {
    if (done) return
    done = true
    try { win.location.href = watch } catch (_) { window.open(watch, '_blank') }
  }, 2000)

  const img = new Image()
  img.onload = () => {
    if (done) return
    done = true
    clearTimeout(to)
    try { win.location.href = embed } catch (_) { window.open(embed, '_blank') }
  }
  img.onerror = () => {
    if (done) return
    done = true
    clearTimeout(to)
    try { win.location.href = watch } catch (_) { window.open(watch, '_blank') }
  }
  img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg?ts=${Date.now()}`
}

function assertYoutubeIds(list) {
  const miss = list.filter(r => !r.youtubeId)
  if (miss.length) {
    console.warn('Ricette senza youtubeId:', miss.length)
    console.table(miss.map(r => ({ title: r.title })))
  }
}

async function sha256(s) {
  const buf = new TextEncoder().encode(JSON.stringify(s))
  const dig = await crypto.subtle.digest('SHA-256', buf)
  return [...new Uint8Array(dig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
