/* app.v16.js – completo: ricerca, tag, ordinamento, preferiti persistenti, video modal */

/* Utils */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'vdev';
const $ver = $('#app-version'); if ($ver) $ver.textContent = ver;

/* Dataset */
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`;
let RECIPES = [];

/* State */
const state = {
  query: '',
  tags: new Set(),
  onlyFavs: false,
  sort: 'relevance',
  favs: new Set()
};

/* Preferiti persistenti */
const FAVS_KEY = 'rls:favs:v1';
function loadFavs() {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch { return new Set(); }
}
function saveFavs(set) {
  try { localStorage.setItem(FAVS_KEY, JSON.stringify(Array.from(set))); } catch {}
}
state.favs = loadFavs();

/* URL helpers */
function readStateFromURL() {
  const p = new URLSearchParams(location.search);
  const q = (p.get('q') || '').trim();
  const tags = (p.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean);
  const favs = p.get('favs') === '1';
  const sort = p.get('sort') || 'relevance';
  state.query = q;
  state.tags = new Set(tags);
  state.onlyFavs = !!favs;
  state.sort = sort;
}
function writeStateToURL() {
  const p = new URLSearchParams(location.search);

  const q = state.query.trim();
  if (q) { p.set('q', q); } else { p.delete('q'); }

  const tags = Array.from(state.tags);
  if (tags.length) { p.set('tags', tags.join(',')); } else { p.delete('tags'); }

  if (state.onlyFavs) { p.set('favs', '1'); } else { p.delete('favs'); }

  if (state.sort && state.sort !== 'relevance') { p.set('sort', state.sort); } else { p.delete('sort'); }

  history.replaceState(null, '', `${location.pathname}?${p.toString()}${location.hash}`);
}

/* Fetch */
async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* YouTube ID */
function getYouTubeId(recipe) {
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
  const wrap = $('#recipes');
  if (!wrap) return;
  if (!Array.isArray(list) || !list.length) {
    wrap.innerHTML = '<p>Nessuna ricetta trovata.</p>';
    return;
  }

  const html = list.map(r => {
    const img = r.image || 'assets/icons/icon-512.png';
    const tagsTxt = Array.isArray(r.tags) ? r.tags.join(' · ') : '';
    const yid = getYouTubeId(r);
    const isFav = state.favs.has(r.id);

    const favBtn = `
      <button class="btn-fav" data-id="${r.id}" aria-pressed="${isFav ? 'true' : 'false'}" title="${isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}">${isFav ? '★' : '☆'}</button>
    `;
    const recipeBtn = r.url
      ? `<a class="btn-recipe" href="${r.url}" target="_blank" rel="noopener" aria-label="Apri ricetta: ${r.title || ''}">Ricetta</a>`
      : '';
    const videoBtn = yid
      ? `<button class="btn-video" data-youtube-id="${yid}">Guarda video</button>`
      : `<button class="btn-video" disabled title="Video non disponibile">Guarda video</button>`;

    return `
      <article class="recipe-card">
        <img src="${img}" alt="${r.title || ''}" loading="lazy">
        <div class="body">
          <h3>${r.title || 'Senza titolo'}</h3>
          <p class="meta">
            ${r.time ? `${r.time} min` : ''}${r.servings ? ` · ${r.servings} porz.` : ''}${tagsTxt ? ` · ${tagsTxt}` : ''}
          </p>
          <p class="actions">
            ${favBtn}
            ${recipeBtn}
            ${videoBtn}
          </p>
        </div>
      </article>
    `;
  }).join('');

  wrap.innerHTML = html;

  // sincronizza stelle
  $$('.btn-fav').forEach(b => {
    const on = state.favs.has(b.dataset.id);
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
    b.textContent = on ? '★' : '☆';
  });

  // (ri)aggancia pulsanti video
  if (window.bindVideoButtons) window.bindVideoButtons();
}

/* Filtra + ordina + render */
function applyFiltersAndRender() {
  let list = RECIPES.slice();

  // testo
  const q = state.query.trim().toLowerCase();
  if (q) {
    list = list.filter(r => {
      const hay = [
        r.title,
        ...(r.tags || []),
        ...(r.ingredients || []).map(i => i.ref)
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  // tag OR (puoi cambiare a AND se preferisci)
  if (state.tags.size) {
    const needed = Array.from(state.tags);
    list = list.filter(r => {
      const t = new Set(r.tags || []);
      return needed.some(tag => t.has(tag));
    });
  }

  // solo preferiti
  if (state.onlyFavs) list = list.filter(r => state.favs.has(r.id));

  // ordinamento
  switch (state.sort) {
    case 'time-asc':
      list.sort((a, b) => (a.time || 0) - (b.time || 0));
      break;
    case 'time-desc':
      list.sort((a, b) => (b.time || 0) - (a.time || 0));
      break;
    case 'title-asc':
      list.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
      break;
    case 'title-desc':
      list.sort((a, b) => String(b.title || '').localeCompare(String(a.title || '')));
      break;
    default:
      // relevance: lascia l’ordine originale
      break;
  }

  renderRecipes(list);

  const $count = $('#results-count');
  if ($count) $count.textContent = String(list.length);

  writeStateToURL();
}

/* Video modal */
(() => {
  if (window.__videoInit) return;
  window.__videoInit = true;

  const modal = $('#video-modal');
  const frame = $('#yt-frame');
  const ORIGIN = location.origin;
  let timer = null;

  function openInNewTab(id) {
    window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
  }
  function closeModal() {
    if (!modal || !frame) return;
    if (timer) { clearTimeout(timer); timer = null; }
    frame.src = 'about:blank';
    modal.classList.remove('show');
    modal.style.display = 'none';
    document.body.style.overflow = '';
  }
  function openModal(id) {
    if (!modal || !frame) { openInNewTab(id); return; }
    try { frame.onload = null; frame.onerror = null; } catch {}
    if (timer) { clearTimeout(timer); timer = null; }

    frame.src = 'about:blank';
    modal.classList.add('show');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    const url = 'https://www.youtube-nocookie.com/embed/' + id
      + '?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=' + encodeURIComponent(ORIGIN);

    let loaded = false;
    frame.onload = () => { loaded = true; };
    frame.onerror = () => { if (!loaded) { closeModal(); openInNewTab(id); } };
    timer = setTimeout(() => { if (!loaded) { closeModal(); openInNewTab(id); } }, 2000);

    frame.src = url;
  }

  // delega click bottoni video
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-video');
    if (btn) {
      e.preventDefault();
      const id = btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';
      if (id) openModal(id);
      return;
    }
    if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')) {
      e.preventDefault();
      closeModal();
    }
  }, true);

  function bindVideoButtons() {
    $$('.btn-video').forEach(btn => {
      if (btn.__boundVideo) return;
      btn.__boundVideo = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';
        if (id) openModal(id);
      }, { passive: false });
    });
  }
  window.bindVideoButtons = bindVideoButtons;

  if (document.readyState !== 'loading') bindVideoButtons();
  else document.addEventListener('DOMContentLoaded', bindVideoButtons);

  const host = $('#recipes');
  if (host) {
    const mo = new MutationObserver(bindVideoButtons);
    mo.observe(host, { childList: true, subtree: true });
  }
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
})();

/* Event listeners UI */
function hookUI() {
  const $search = $('#search');
  if ($search) {
    $search.value = state.query;
    $search.addEventListener('input', () => {
      state.query = $search.value || '';
      applyFiltersAndRender();
    });
  }

  const $only = $('#only-favs');
  if ($only) {
    $only.checked = !!state.onlyFavs;
    $only.addEventListener('change', () => {
      state.onlyFavs = !!$only.checked;
      applyFiltersAndRender();
    });
  }

  const $sort = $('#sort');
  if ($sort) {
    $sort.value = state.sort;
    $sort.addEventListener('change', () => {
      state.sort = $sort.value || 'relevance';
      applyFiltersAndRender();
    });
  }

  const $refresh = $('#refresh');
  if ($refresh) {
    $refresh.addEventListener('click', async () => {
      $refresh.disabled = true; $refresh.textContent = 'Aggiorno…';
      try {
        RECIPES = await fetchRecipes();
        applyFiltersAndRender();
      } catch (e) {
        alert('Errore aggiornamento: ' + e.message);
      } finally {
        $refresh.disabled = false; $refresh.textContent = 'Aggiorna dati';
      }
    });
  }

  // tag chips generiche: elementi con data-tag
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-tag]');
    if (!chip) return;
    const tag = String(chip.getAttribute('data-tag') || '').trim();
    if (!tag) return;

    if (state.tags.has(tag)) state.tags.delete(tag);
    else state.tags.add(tag);

    // opzionale: toggle classe attiva
    chip.classList.toggle('active', state.tags.has(tag));

    applyFiltersAndRender();
  }, true);

  // toggle preferiti
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-fav');
    if (!btn) return;
    const id = btn.dataset.id;
    if (!id) return;

    if (state.favs.has(id)) state.favs.delete(id);
    else state.favs.add(id);
    saveFavs(state.favs);

    applyFiltersAndRender();
  }, true);
}

/* Boot */
(async function init() {
  try {
    readStateFromURL();

    // precompila UI con lo stato letto
    hookUI();

    RECIPES = await fetchRecipes();
    applyFiltersAndRender();
  } catch (e) {
    console.error(e);
    const wrap = $('#recipes'); if (wrap) wrap.innerHTML = `<p class="error">Errore: ${e.message}</p>`;
  }
})();

/* Service Worker solo su GitHub Pages */
if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')) {
  window.addEventListener('load', async () => {
    try {
      const swUrl = `service-worker.js?v=${encodeURIComponent(ver)}`;
      const reg = await navigator.serviceWorker.register(swUrl);
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing; if (!nw) return;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            setTimeout(() => location.reload(), 500);
          }
        });
      });
      navigator.serviceWorker.addEventListener('message', ev => {
        if (ev && ev.data === 'reload') location.reload();
      });
    } catch (e) {
      console.warn('[SW] fail', e);
    }
  });
}
