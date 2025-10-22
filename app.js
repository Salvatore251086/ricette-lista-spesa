/* =========================================================
   Ricette & Lista Spesa — app.js
   Robusto: tollera l'assenza di import/recipes.json,
   gestisce preferiti, filtri, paginazione, tab, cookiebar.
   ========================================================= */

const SELECTORS = {
  // tab
  tabRicette: '#tabRicette',
  tabGeneratore: '#tabGeneratore',
  tabLista: '#tabLista',
  ricetteSec: '#ricetteSec',
  genSec: '#genSec',
  listaSec: '#listaSec',

  // filtri/topbar
  q: '#q',
  filterTime: '#filterTime',
  filterDiet: '#filterDiet',
  btnReset: '#btnReset',
  btnFav: '#btnFav',

  // griglia ricette
  recipesGrid: '#recipesGrid',
  empty: '#empty',
  btnLoadMore: '#btnLoadMore',

  // cookiebar
  cookieBar: '#cookieBar',
  cookieAccept: '#cookieAccept',
  cookieDecline: '#cookieDecline',

  // footer year
  year: '#year'
};

const BASE_URL = 'assets/json/recipes-it.json';
const IMPORT_URL = 'import/recipes.json'; // opzionale, potrebbe non esistere

const PAGE_SIZE = 9;

const state = {
  allRecipes: [],
  filtered: [],
  page: 0,
  q: '',
  time: '',
  diet: '',
  onlyFav: false,
  favs: new Set()
};

/* --------------------- Utils DOM --------------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function htmlToElement(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/* --------------------- Storage preferiti --------------------- */
const FAV_KEY = 'rx_favs_v1';

function loadFavs() {
  try {
    const raw = localStorage.getItem(FAV_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(arr);
  } catch {
    return new Set();
  }
}

function saveFavs() {
  try {
    localStorage.setItem(FAV_KEY, JSON.stringify([...state.favs]));
  } catch {}
}

function isFav(id) {
  return state.favs.has(id);
}

function toggleFav(id) {
  if (state.favs.has(id)) state.favs.delete(id);
  else state.favs.add(id);
  saveFavs();
}

/* --------------------- Caricamento dati --------------------- */
async function loadJSON(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } catch {
    return null;
  }
}

async function loadDatasets() {
  const base = await loadJSON(BASE_URL);
  if (!Array.isArray(base)) throw new Error('Dataset base mancante/corrotto');

  const extra = await loadJSON(IMPORT_URL);
  const imported = Array.isArray(extra) ? extra : [];

  // De-duplica per id con priorità all’import
  const map = new Map();
  for (const r of imported) map.set(r.id, r);
  for (const r of base) if (!map.has(r.id)) map.set(r.id, r);

  return Array.from(map.values());
}

/* --------------------- Rendering --------------------- */
function formatTags(recipe) {
  const tags = recipe.tags || [];
  return tags.map(t => `<span class="chip" aria-label="tag">${escapeHtml(t)}</span>`).join(' ');
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function recipeCard(r) {
  const fav = isFav(r.id);
  const time = r.time ? `${r.time} min` : '';
  const diet = r.diet || '';

  return htmlToElement(`
    <article class="card" data-id="${escapeHtml(r.id)}" style="display:flex;flex-direction:column;gap:8px">
      <img src="${escapeHtml(r.image || 'assets/icons/icon-512.png')}" 
           alt="${escapeHtml(r.title)}" 
           loading="lazy" style="width:100%;height:160px;object-fit:cover;border-radius:10px">
      <div style="display:flex;justify-content:space-between;align-items:start;gap:10px">
        <h3 style="margin:0;font-size:16px;line-height:1.2">${escapeHtml(r.title)}</h3>
        <button class="fav-btn chip" aria-pressed="${fav ? 'true' : 'false'}" title="Preferito">
          ${fav ? '★' : '☆'}
        </button>
      </div>
      <div class="muted" style="font-size:13px">${escapeHtml(time)} ${diet ? '· ' + escapeHtml(diet) : ''}</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${formatTags(r)}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:auto">
        ${r.url ? `<a class="btn" href="${escapeHtml(r.url)}" target="_blank" rel="noopener">Apri ricetta</a>` : ''}
        ${r.video ? `<a class="btn" href="${escapeHtml(r.video)}" target="_blank" rel="noopener">Guarda video</a>` : ''}
        <button class="btn addAll">Aggiungi ingredienti</button>
      </div>
    </article>
  `);
}

function renderPage() {
  const grid = $(SELECTORS.recipesGrid);
  const start = state.page * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const chunk = state.filtered.slice(start, end);

  if (state.page === 0) grid.innerHTML = '';
  chunk.forEach(r => grid.appendChild(recipeCard(r)));

  // empty state
  const hasAny = state.filtered.length > 0;
  $(SELECTORS.empty).classList.toggle('hidden', hasAny);

  // load more
  const more = end < state.filtered.length;
  $(SELECTORS.btnLoadMore).classList.toggle('hidden', !more);

  // bind card actions
  grid.querySelectorAll('.card').forEach(card => {
    const id = card.getAttribute('data-id');
    const favBtn = card.querySelector('.fav-btn');
    if (favBtn) {
      favBtn.addEventListener('click', () => {
        toggleFav(id);
        // aggiorna bottone + eventualmente filtro "solo preferiti"
        favBtn.setAttribute('aria-pressed', isFav(id) ? 'true' : 'false');
        favBtn.textContent = isFav(id) ? '★' : '☆';
        if (state.onlyFav) {
          applyFilters(); // ricrea elenco
        }
      });
    }
    const addAll = card.querySelector('.addAll');
    if (addAll) {
      addAll.addEventListener('click', () => {
        alert('Demo: qui aggiungeresti gli ingredienti alla lista spesa.');
      });
    }
  });
}

function applyFilters() {
  const { q, time, diet, onlyFav, allRecipes } = state;
  const qNorm = q.trim().toLowerCase();

  let res = allRecipes.filter(r => {
    // filtro testo su titolo + tags + ingredienti
    const hay = [
      r.title || '',
      ...(r.tags || []),
      ...((r.ingredients || []).map(i => (i.ref || i || '')))
    ].join(' ').toLowerCase();
    if (qNorm && !hay.includes(qNorm)) return false;

    if (time && r.time && Number(r.time) > Number(time)) return false;
    if (diet && (r.diet || '') !== diet) return false;
    if (onlyFav && !isFav(r.id)) return false;
    return true;
  });

  state.filtered = res;
  state.page = 0;
  renderPage();
}

/* --------------------- Event wiring --------------------- */
function bindFilters() {
  $(SELECTORS.q).addEventListener('input', (e) => {
    state.q = e.target.value || '';
    applyFilters();
  });

  $(SELECTORS.filterTime).addEventListener('change', (e) => {
    state.time = e.target.value || '';
    applyFilters();
  });

  $(SELECTORS.filterDiet).addEventListener('change', (e) => {
    state.diet = e.target.value || '';
    applyFilters();
  });

  $(SELECTORS.btnReset).addEventListener('click', () => {
    state.q = '';
    state.time = '';
    state.diet = '';
    $(SELECTORS.q).value = '';
    $(SELECTORS.filterTime).value = '';
    $(SELECTORS.filterDiet).value = '';
    applyFilters();
  });

  $(SELECTORS.btnFav).addEventListener('click', (e) => {
    state.onlyFav = !state.onlyFav;
    e.currentTarget.setAttribute('aria-pressed', state.onlyFav ? 'true' : 'false');
    e.currentTarget.classList.toggle('active', state.onlyFav);
    applyFilters();
  });

  $(SELECTORS.btnLoadMore).addEventListener('click', () => {
    state.page++;
    renderPage();
  });
}

function bindTabs() {
  const show = (ricette, gen, lista) => {
    $(SELECTORS.ricetteSec).classList.toggle('hidden', !ricette);
    $(SELECTORS.genSec).classList.toggle('hidden', !gen);
    $(SELECTORS.listaSec).classList.toggle('hidden', !lista);
    // aria pressed
    $(SELECTORS.tabRicette).setAttribute('aria-pressed', ricette ? 'true' : 'false');
    $(SELECTORS.tabGeneratore).setAttribute('aria-pressed', gen ? 'true' : 'false');
    $(SELECTORS.tabLista).setAttribute('aria-pressed', lista ? 'true' : 'false');
  };

  $(SELECTORS.tabRicette).addEventListener('click', () => show(true, false, false));
  $(SELECTORS.tabGeneratore).addEventListener('click', () => show(false, true, false));
  $(SELECTORS.tabLista).addEventListener('click', () => show(false, false, true));
}

function bindCookiebar() {
  const bar = $(SELECTORS.cookieBar);
  if (!bar) return;
  const KEY = 'rx_cookie_ok';
  if (localStorage.getItem(KEY)) {
    bar.style.display = 'none';
  } else {
    bar.style.display = '';
  }
  $('#cookieAccept')?.addEventListener('click', () => {
    localStorage.setItem(KEY, '1');
    bar.style.display = 'none';
  });
  $('#cookieDecline')?.addEventListener('click', () => {
    bar.style.display = 'none';
  });
}

/* --------------------- Init --------------------- */
function renderInitial() {
  // popoliamo UI iniziale
  applyFilters();
  // footer year
  const y = new Date().getFullYear();
  $(SELECTORS.year)?.replaceChildren(String(y));
}

async function bootstrap() {
  try {
    state.favs = loadFavs();
    bindFilters();
    bindTabs();
    bindCookiebar();

    const data = await loadDatasets();
    state.allRecipes = data;
    state.filtered = data;
    state.page = 0;
    renderInitial();
  } catch (e) {
    console.error('Errore bootstrap:', e);
    // fallback visuale
    $(SELECTORS.recipesGrid).innerHTML = '';
    $(SELECTORS.empty).classList.remove('hidden');
  }
}

document.addEventListener('DOMContentLoaded', bootstrap);
