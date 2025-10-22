/* App minimale, no-cache sul JSON, video YouTube integrato, preferiti locali */

const RECIPES_URL = 'assets/json/recipes-it.json'
const LS_FAVS_KEY = 'rls:favorites'

let RECIPES = []
let FILTER = { q: '', time: 'any', diet: 'any', onlyFav: false }

/* -------------------- bootstrap -------------------- */
document.addEventListener('DOMContentLoaded', async () => {
  await bootstrap()
})

async function bootstrap() {
  try {
    RECIPES = await loadRecipesNoCache()
  } catch (e) {
    console.error('Errore caricamento ricette', e)
    RECIPES = []
  }
  bindUI()
  renderAll()
}

/* -------------------- data -------------------- */

async function loadRecipesNoCache() {
  const url = RECIPES_URL + '?v=' + Date.now()
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

/* -------------------- UI wiring -------------------- */

function bindUI() {
  qs('#search')?.addEventListener('input', e => {
    FILTER.q = e.target.value.trim().toLowerCase()
    renderAll()
  })

  qs('#filter-time')?.addEventListener('change', e => {
    FILTER.time = e.target.value
    renderAll()
  })

  qs('#filter-diet')?.addEventListener('change', e => {
    FILTER.diet = e.target.value
    renderAll()
  })

  qs('#toggle-favs')?.addEventListener('click', () => {
    FILTER.onlyFav = !FILTER.onlyFav
    renderAll()
  })

  qs('#btn-reset')?.addEventListener('click', () => {
    FILTER = { q: '', time: 'any', diet: 'any', onlyFav: false }
    if (qs('#search')) qs('#search').value = ''
    if (qs('#filter-time')) qs('#filter-time').value = 'any'
    if (qs('#filter-diet')) qs('#filter-diet').value = 'any'
    renderAll()
  })
}

/* -------------------- render -------------------- */

function renderAll() {
  const grid = qs('#recipes-grid')
  if (!grid) return

  const favs = loadFavs()
  const items = RECIPES.filter(r => filterRecipe(r, favs))
  grid.innerHTML = items.map(r => cardRecipe(r, favs)).join('')

  // azioni card
  qsa('[data-action="fav"]').forEach(btn => {
    btn.addEventListener('click', () => {
      toggleFav(btn.dataset.id)
      renderAll()
    })
  })
  qsa('[data-action="open"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const r = RECIPES.find(x => x.id === id)
      if (r?.url) window.open(r.url, '_blank', 'noopener')
    })
  })
  qsa('[data-action="video"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id
      const r = RECIPES.find(x => x.id === id)
      if (r?.video) openYouTubeModal(r.video)
    })
  })
}

function filterRecipe(r, favs) {
  if (FILTER.onlyFav && !favs.has(r.id)) return false

  if (FILTER.q) {
    const hay = [
      r.title,
      ...(r.tags || []),
      ...(r.ingredients || []).map(i => i.ref || '')
    ].join(' ').toLowerCase()
    if (!hay.includes(FILTER.q)) return false
  }

  if (FILTER.time !== 'any') {
    const max = Number(FILTER.time)
    if (Number.isFinite(max) && Number(r.time) > max) return false
  }

  if (FILTER.diet !== 'any') {
    if ((r.diet || '').toLowerCase() !== FILTER.diet) return false
  }

  return true
}

function cardRecipe(r, favs) {
  const tagHtml = (r.tags || []).map(t => `<span class="chip">${esc(t)}</span>`).join(' ')
  const ingPreview = previewIngredients(r.ingredients || [])
  const fav = favs.has(r.id)
  const hasVideo = Boolean(r.video)

  return `
  <div class="card">
    <div class="card-media">
      <img src="${esc(r.image || 'assets/icons/icon-512.png')}" alt="${esc(r.title)}" loading="lazy">
      ${hasVideo ? `<button class="btn small video" data-action="video" data-id="${esc(r.id)}">Guarda video</button>` : ''}
    </div>
    <div class="card-body">
      <h3>${esc(r.title)}</h3>
      <p class="meta">${r.time ? `${r.time} min` : ''} ${r.servings ? `· ${r.servings} porzioni` : ''}</p>
      <p class="muted">${esc(ingPreview)}</p>
      <div class="tags">${tagHtml}</div>
      <div class="actions">
        <button class="btn primary" data-action="open" data-id="${esc(r.id)}">Apri ricetta</button>
        <button class="btn" data-action="fav" data-id="${esc(r.id)}">${fav ? 'Preferito ✓' : 'Aggiungi ai preferiti'}</button>
      </div>
    </div>
  </div>`
}

function previewIngredients(arr) {
  const names = arr.map(i => i.ref || '').filter(Boolean).slice(0, 6)
  return names.join(', ')
}

/* -------------------- preferiti -------------------- */

function loadFavs() {
  try {
    const raw = localStorage.getItem(LS_FAVS_KEY)
    return new Set(JSON.parse(raw || '[]'))
  } catch {
    return new Set()
  }
}

function saveFavs(set) {
  try {
    localStorage.setItem(LS_FAVS_KEY, JSON.stringify(Array.from(set)))
  } catch {}
}

function toggleFav(id) {
  const s = loadFavs()
  if (s.has(id)) s.delete(id) else s.add(id)
  saveFavs(s)
}

/* -------------------- video -------------------- */

function openYouTubeModal(videoId) {
  const src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`
  let modal = qs('#yt-modal')
  if (!modal) {
    modal = document.createElement('div')
    modal.id = 'yt-modal'
    modal.className = 'modal'
    modal.innerHTML = `
      <div class="modal-backdrop" data-close></div>
      <div class="modal-body">
        <button class="btn close" data-close>&times;</button>
        <div class="ratio">
          <iframe id="yt-frame" width="560" height="315" frameborder="0" allow="autoplay; encrypted-media" allowfullscreen></iframe>
        </div>
      </div>`
    document.body.appendChild(modal)
    modal.addEventListener('click', e => {
      if (e.target.matches('[data-close]')) closeYouTubeModal()
    })
  }
  const frame = qs('#yt-frame')
  frame.src = src
  modal.classList.add('open')
}

function closeYouTubeModal() {
  const modal = qs('#yt-modal')
  if (!modal) return
  const frame = qs('#yt-frame')
  if (frame) frame.src = ''
  modal.classList.remove('open')
}

/* -------------------- utils -------------------- */

function qs(s) { return document.querySelector(s) }
function qsa(s) { return Array.from(document.querySelectorAll(s)) }
function esc(s) { return String(s || '').replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }
