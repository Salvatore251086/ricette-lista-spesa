/* app.v16.js – pulsante video con modale, fallback nuova scheda */

/* Utils */
const $ = (sel) => document.querySelector(sel);
const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const $ver = $('#app-version');
if ($ver) $ver.textContent = `v${ver}`;

/* Dataset */
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`;
async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} nel fetch del dataset`);
  return res.json();
}
window.loadRecipes = fetchRecipes;

/* YouTube ID helper */
function getYouTubeId(recipe){
  if (!recipe) return '';
  if (recipe.youtubeId) return String(recipe.youtubeId).trim();
  if (recipe.ytid) return String(recipe.ytid).trim();
  if (recipe.videoId) return String(recipe.videoId).trim();
  if (recipe.video) {
    const m = String(recipe.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return '';
}

/* Render */
function renderRecipes(list) {
  const $wrap = $('#recipes');
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
            ...(r.ingredients || []).map((i) => i.ref),
          ].filter(Boolean).join(' ').toLowerCase()
          return hay.includes(q)
        })
    renderRecipes(filtered)
    if (window.bindVideoButtons) window.bindVideoButtons()
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
      if (window.bindVideoButtons) window.bindVideoButtons()
    } catch (e) {
      alert(`Errore aggiornamento: ${e.message}`)
    } finally {
      $btn.disabled = false
      $btn.textContent = 'Aggiorna dati'
    }
  })
}

/* Boot */
let RECIPES = [];
;(async function init() {
  try {
    RECIPES = await fetchRecipes()
    renderRecipes(RECIPES)
    if (window.bindVideoButtons) window.bindVideoButtons()

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
      const swUrl = `service-worker.js?v=${encodeURIComponent(ver)}`;
      const reg = await navigator.serviceWorker.register(swUrl);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] Nuova versione installata, ricarico');
            setTimeout(() => location.reload(), 500);
          }
        });
      });
      navigator.serviceWorker.addEventListener('message', ev => {
        if (ev && ev.data === 'reload') location.reload();
      });
    } catch (e) {
      console.warn('[SW] Registrazione fallita:', e);
    }
  });
}

/* Video handler robusto con origin + fallback e binding diretto */
;(() => {
  if (window.__videoInit) return;
  window.__videoInit = true;

  const modal = document.getElementById('video-modal');
  const frame  = document.getElementById('yt-frame');
  const ORIGIN = location.origin;
  let timer = null;

  function openInNewTab(id){
    window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
  }

  function openModal(id){
    if (!modal || !frame) { openInNewTab(id); return; }

    try { frame.onload = null; frame.onerror = null; } catch(_) {}
    if (timer) { clearTimeout(timer); timer = null; }

    frame.src = 'about:blank';
    modal.classList.add('show');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const url = 'https://www.youtube-nocookie.com/embed/' + id
      + '?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=' + encodeURIComponent(ORIGIN);

    let loaded = false;
    frame.onload  = () => { loaded = true; };
    frame.onerror = () => { if (!loaded) { closeModal(); openInNewTab(id); } };

    timer = setTimeout(() => {
      if (!loaded) { closeModal(); openInNewTab(id); }
    }, 2000);

    frame.src = url;
  }

  function closeModal(){
    if (!modal || !frame) return;
    if (timer) { clearTimeout(timer); timer = null; }
    frame.src = 'about:blank';
    modal.classList.remove('show');
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  // Delegato, in capture
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button.btn-video, a.btn-video, .btn-video');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';
      if (id) openModal(id);
      return;
    }
    if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')) {
      e.preventDefault();
      closeModal();
    }
  }, true);

  // Binding diretto ai bottoni dopo ogni render
  function bindVideoButtons(){
    document.querySelectorAll('.btn-video').forEach(btn => {
      if (btn.__boundVideo) return;
      btn.__boundVideo = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';
        if (id) openModal(id);
      }, { passive: false });
    });
  }
  window.bindVideoButtons = bindVideoButtons;      // per richiamo esterno
  window.openVideoById   = (id) => openModal(id);  // per test rapido

  // Primo binding, poi ogni mutazione
  if (document.readyState !== 'loading') bindVideoButtons();
  else document.addEventListener('DOMContentLoaded', bindVideoButtons);

  // Osserva cambi nel container delle ricette
  const host = document.getElementById('recipes');
  if (host) {
    const mo = new MutationObserver(bindVideoButtons);
    mo.observe(host, { childList: true, subtree: true });
  }

  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
})();
