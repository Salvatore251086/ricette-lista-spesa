/* app.v16.js — versione stabile con modale video robusta e fallback */

// ───────────── Utils & Versione
const $ = (sel) => document.querySelector(sel);
const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const $ver = $('#app-version');
if ($ver) $ver.textContent = `v${ver}`;

// ───────────── Dataset (cache-busting con versione)
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`;

async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} nel fetch del dataset`);
  return res.json();
}
window.loadRecipes = fetchRecipes; // utile ad altri moduli

// ───────────── Estrazione YouTube ID
function getYouTubeId(recipe) {
  if (!recipe) return '';
  if (recipe.youtubeId) return String(recipe.youtubeId).trim();
  if (recipe.ytid)      return String(recipe.ytid).trim();
  if (recipe.videoId)   return String(recipe.videoId).trim();
  if (recipe.video) {
    const m = String(recipe.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return '';
}

// ───────────── Render
function renderRecipes(list) {
  const wrap = $('#recipes');
  if (!wrap) return;

  if (!Array.isArray(list) || !list.length) {
    wrap.innerHTML = `<p style="padding:10px 0;color:#667">Nessuna ricetta trovata.</p>`;
    return;
  }

  const cards = list.map((r) => {
    const img  = r.image || 'assets/icons/icon-512.png';
    const yid  = getYouTubeId(r);
    const tags = Array.isArray(r.tags) ? r.tags : [];

    const btnVideo = yid
      ? `<button class="btn btn-primary btn-video" data-youtube-id="${yid}">Guarda video</button>`
      : `<button class="btn btn-primary btn-video" disabled title="Video non disponibile">Guarda video</button>`;

    const btnRecipe = r.url
      ? `<a class="btn btn-ok" href="${r.url}" target="_blank" rel="noopener" aria-label="Apri ricetta: ${r.title||''}">Ricetta</a>`
      : '';

    return `
      <article class="recipe-card">
        <img class="thumb" src="${img}" alt="${r.title || ''}" loading="lazy" />
        <div class="body">
          <h3>${r.title || 'Senza titolo'}</h3>
          <p class="meta">
            ${r.time ? `${r.time} min` : ''}${r.servings ? ` · ${r.servings} porz.` : ''}${tags.length ? ` · ${tags.join(' · ')}` : ''}
          </p>
          ${tags.length ? `<div class="row">${tags.map(t=>`<span class="chip">${t}</span>`).join('')}</div>` : ''}
          <div class="row" style="margin-top:10px">
            ${btnRecipe}
            ${btnVideo}
          </div>
        </div>
      </article>
    `;
  });

  wrap.innerHTML = cards.join('');
}

// ───────────── Ricerca
function setupSearch(recipes) {
  const input = $('#search');
  if (!input) return;

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const filtered = !q ? recipes : recipes.filter((r) => {
      const hay = [
        r.title,
        ...(Array.isArray(r.tags) ? r.tags : []),
        ...(Array.isArray(r.ingredients) ? r.ingredients.map(i => i.ref) : []),
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
    renderRecipes(filtered);
    // non serve rebinding: il controller video usa event delegation
  });
}

// ───────────── Aggiorna dati
function setupRefresh() {
  const btn = $('#refresh');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    btn.textContent = 'Aggiorno…';
    try {
      const data = await fetchRecipes();
      renderRecipes(data);
    } catch (e) {
      alert(`Errore aggiornamento: ${e.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Aggiorna dati';
    }
  });
}

// ───────────── Boot
let RECIPES = [];
(async function init() {
  try {
    RECIPES = await fetchRecipes();
    renderRecipes(RECIPES);
    setupSearch(RECIPES);
    setupRefresh();
  } catch (e) {
    console.error(e);
    const wrap = $('#recipes');
    if (wrap) wrap.innerHTML = `<p class="error">Errore nel caricamento dati: ${e.message}</p>`;
  }
})();

// ───────────── Service Worker (facoltativo su GitHub Pages)
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

/* ───────────── Modale video robusta + fallback nuova scheda ───────────── */
(function () {
  if (window.__videoInit) return;
  window.__videoInit = true;

  const modal   = document.getElementById('video-modal');
  const frame   = document.getElementById('yt-frame');
  const closeBt = document.getElementById('video-close');
  const ORIGIN  = location.origin;
  let timeoutId = null;

  function openInNewTab(id){
    window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
  }

  function openModal(id){
    if (!modal || !frame) { openInNewTab(id); return; }

    try { frame.onload = null; frame.onerror = null; } catch(_) {}
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }

    modal.classList.add('show');
    document.documentElement.style.overflow = 'hidden';

    const url =
      'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) +
      '?autoplay=1&rel=0&modestbranding=1&playsinline=1' +
      '&enablejsapi=1' +
      '&origin=' + encodeURIComponent(ORIGIN);

    let loaded = false;
    frame.onload  = () => { loaded = true; };
    frame.onerror = () => { if (!loaded) { closeModal(); openInNewTab(id); } };

    timeoutId = setTimeout(() => {
      if (!loaded) { closeModal(); openInNewTab(id); }
    }, 2500);

    frame.src = url;
  }

  function closeModal(){
    if (!modal || !frame) return;
    if (timeoutId) { clearTimeout(timeoutId); timeoutId = null; }
    frame.src = 'about:blank';
    modal.classList.remove('show');
    document.documentElement.style.overflow = '';
  }

  // Delegato: click su tutti i .btn-video (non serve rebinding dopo render)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-video');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';
    if (id) openModal(id); else alert('Video non disponibile');
  }, true);

  // Chiudi con X, con click sul backdrop, o con ESC
  closeBt?.addEventListener('click', (e) => { e.preventDefault(); closeModal(); });
  modal?.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

  // Utility per test da console (facoltative)
  window.openVideoById   = (id) => openModal(String(id||'').trim());
  window.closeVideoModal = closeModal;
})();
