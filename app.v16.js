/* app.v16.js – versione completa con pulsante video e apertura in nuova scheda */

/* Utils */
const $ = (sel) => document.querySelector(sel)
const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev'
const $ver = $('#app-version')
if ($ver) $ver.textContent = `v${ver}`

/* Dataset */
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`

async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status} nel fetch del dataset`)
  return res.json()
}

/* Compatibilità con codice esistente */
window.loadRecipes = fetchRecipes

/* YouTube ID helper */
function getYouTubeId(recipe){
  if (!recipe) return ''
  if (recipe.youtubeId) return String(recipe.youtubeId).trim()
  if (recipe.ytid) return String(recipe.ytid).trim()
  if (recipe.videoId) return String(recipe.videoId).trim()
  if (recipe.video) {
    const m = String(recipe.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/)
    if (m) return m[1]
  }
  return ''
}

/* Render */
function renderRecipes(list) {
  const $wrap = $('#recipes')
  if (!$wrap) return

  if (!Array.isArray(list) || !list.length) {
    $wrap.innerHTML = `<p>Nessuna ricetta trovata.</p>`
    return
  }

  const cards = list.map((r) => {
    const img = r.image || 'assets/icons/icon-512.png'
    const tags = Array.isArray(r.tags) ? r.tags.join(' · ') : ''
    const yid = getYouTubeId(r)
    const videoBtn = yid
      ? `<button class="btn-video" data-youtube-id="${yid}">Guarda video</button>`
      : `<button class="btn-video" disabled title="Video non disponibile">Guarda video</button>`

    return `
      <article class="recipe-card">
        <img src="${img}" alt="${r.title || ''}" loading="lazy" />
        <div class="body">
          <h3>${r.title || 'Senza titolo'}</h3>
          <p class="meta">
            ${r.time ? `${r.time} min` : ''}${r.servings ? ` · ${r.servings} porz.` : ''}${tags ? ` · ${tags}` : ''}
          </p>
          <p>
            ${r.url ? `<a href="${r.url}" target="_blank" rel="noopener">Fonte</a>` : ''}
            ${videoBtn}
          </p>
        </div>
      </article>
    `
  })

  $wrap.innerHTML = cards.join('')
}

/* Ricerca */
function setupSearch(recipes) {
  const $search = $('#search')
  if (!$search) return
  $search.addEventListener('input', () => {
    const q = $search.value.trim().toLowerCase()
    const filtered = !q
      ? recipes
      : recipes.filter((r) => {
          const hay = [
            r.title,
            ...(r.tags || []),
            ...(r.ingredients || []).map((i) => i.ref)
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return hay.includes(q)
        })
    renderRecipes(filtered)
  })
}

/* Aggiorna dati */
function setupRefresh() {
  const $btn = $('#refresh')
  if (!$btn) return
  $btn.addEventListener('click', async () => {
    $btn.disabled = true
    $btn.textContent = 'Aggiorno…'
    try {
      const data = await fetchRecipes()
      renderRecipes(data)
    } catch (e) {
      alert(`Errore aggiornamento: ${e.message}`)
    } finally {
      $btn.disabled = false
      $btn.textContent = 'Aggiorna dati'
    }
  })
}

/* Boot */
let RECIPES = []
;(async function init() {
  try {
    RECIPES = await fetchRecipes()
    renderRecipes(RECIPES)
    setupSearch(RECIPES)
    setupRefresh()
  } catch (e) {
    console.error(e)
    const $wrap = $('#recipes')
    if ($wrap) $wrap.innerHTML = `<p class="error">Errore nel caricamento dati: ${e.message}</p>`
  }
})()

/* Service Worker, solo su GitHub Pages */
if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')) {
  window.addEventListener('load', async () => {
    try {
      const swUrl = `service-worker.js?v=${encodeURIComponent(ver)}`
      const reg = await navigator.serviceWorker.register(swUrl)
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        if (!nw) return
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] Nuova versione installata, ricarico')
            setTimeout(() => location.reload(), 500)
          }
        })
      })
      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev && ev.data === 'reload') location.reload()
      })
    } catch (e) {
      console.warn('[SW] Registrazione fallita:', e)
    }
  })
}

/* Video handler, nuova scheda sempre */
;(function(){
  if (window.__videoInit) return
  window.__videoInit = true

  function stopAnyYt(){
    try { var f = document.getElementById('yt-frame'); if (f) f.src = '' } catch(_) {}
  }

  document.addEventListener('click', function(e){
    var btn = e.target.closest('.btn-video')
    if (!btn) return
    e.preventDefault()
    var id = btn.dataset.youtubeId || ''
    if (!id) return
    stopAnyYt()
    window.open('https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0', '_blank', 'noopener')
  })
})()
