// app.v16.js – versione completa con video button integrato

// =====================
// Utilities base
// =====================
const $ = (sel) => document.querySelector(sel)

// Versione app, da <script> o fallback
const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev'
const $ver = $('#app-version')
if ($ver) $ver.textContent = `v${ver}`

// =====================
// Dataset ricette
// =====================
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`

async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status} nel fetch del dataset`)
  return res.json()
}

// Mantieni compatibilità con codice esistente
window.loadRecipes = fetchRecipes

// Trova un ID YouTube a partire da vari campi
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

// =====================
// Rendering lista ricette
// =====================
function renderRecipes(list) {
  const $wrap = document.querySelector('#recipes');
  if (!$wrap) return;

  if (!Array.isArray(list) || !list.length) {
    $wrap.innerHTML = `<p>Nessuna ricetta trovata.</p>`;
    return;
  }

  const cards = list.map((r) => {
    const img = r.image || 'assets/icons/icon-512.png';
    const tags = Array.isArray(r.tags) ? r.tags.join(' · ') : '';
    const yid = getYouTubeId(r);
    const videoBtn = yid
      ? `<button class="btn-video" data-youtube-id="${yid}">Guarda video</button>`
      : `<button class="btn-video" disabled title="Video non disponibile">Guarda video</button>`;

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
    `;
  });

  $wrap.innerHTML = cards.join('');
}

// =====================
// Ricerca client side
// =====================
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
            ...(r.ingredients || []).map((i) => i.ref),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase()
          return hay.includes(q)
        })
    renderRecipes(filtered)
  })
}

// =====================
// Bottone Aggiorna
// =====================
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

// =====================
// Boot app
// =====================
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

// =====================
// Service Worker
// =====================
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      const swUrl = `service-worker.js?v=${encodeURIComponent(ver)}`
      const reg = await navigator.serviceWorker.register(swUrl)
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing
        if (!newWorker) return
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
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

// =====================
// Video, handler globale
// =====================
;(function(){
  if (window.__videoInit) return
  window.__videoInit = true

  // Click su qualsiasi .btn-video
  document.addEventListener('click', function(e){
    const btn = e.target.closest('.btn-video')
    if (!btn) return
    e.preventDefault()
    const id = btn.dataset.youtubeId || ''
    if (!id) return

    // Se hai il modal in index.html, lo usa. Altrimenti apre in nuova scheda
    const modal = document.getElementById('video-modal')
    const frame = document.getElementById('yt-frame')
    if (modal && frame) {
      frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0'
      modal.classList.remove('hidden')
      modal.classList.add('flex')
      return
    }
    window.open('https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0', '_blank', 'noopener')
  })

  // Chiusura modal se presente
  document.addEventListener('click', function(e){
    if (e.target && (e.target.id === 'video-close' || e.target.id === 'video-modal')) {
      const modal = document.getElementById('video-modal')
      const frame = document.getElementById('yt-frame')
      if (modal && frame) {
        frame.src = ''
        modal.classList.add('hidden')
        modal.classList.remove('flex')
      }
    }
  })
})()
(function(){
  if (window.__videoInit) return;
  window.__videoInit = true;

  document.addEventListener('click', function(e){
    const btn = e.target.closest('.btn-video');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.youtubeId || '';
    if (!id) return; // bottone disabilitato

    const modal = document.getElementById('video-modal');
    const frame = document.getElementById('yt-frame');
    if (modal && frame) {
      frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
      modal.classList.remove('hidden');
      modal.classList.add('flex');
      return;
    }
    window.open('https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0', '_blank', 'noopener');
  });

  document.addEventListener('click', function(e){
    if (e.target && (e.target.id === 'video-close' || e.target.id === 'video-modal')) {
      const modal = document.getElementById('video-modal');
      const frame = document.getElementById('yt-frame');
      if (modal && frame) {
        frame.src = '';
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    }
  });
})();
