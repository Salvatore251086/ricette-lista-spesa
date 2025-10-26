/* app.v16.js — lista ricette con ricerca, ordinamento, preferiti persistenti e pulsanti Ricetta/Video */

/* ------------------------ Utils e versione ------------------------ */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'vdev';
const $ver = $('#app-version');
if ($ver) $ver.textContent = ver;

/* ------------------------ Dataset ------------------------ */
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`;

async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} nel fetch del dataset`);
  return res.json();
}
window.loadRecipes = fetchRecipes;

/* ------------------------ Preferiti persistenti ------------------------ */
const FAVS_KEY = 'rls:favs:v1';

function loadFavs() {
  try {
    const raw = localStorage.getItem(FAVS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveFavs(favsSet) {
  try {
    localStorage.setItem(FAVS_KEY, JSON.stringify(Array.from(favsSet)));
  } catch {}
}

/* ------------------------ Stato UI ------------------------ */
const state = {
  query: '',
  tags: new Set(),
  onlyFavs: false,
  sort: 'relevance', // relevance | time-asc | time-desc | title-asc | title-desc
  favs: loadFavs()
};

/* ------------------------ Helpers URL ------------------------ */
function readStateFromURL() {
  const p = new URLSearchParams(location.search);

  const q = (p.get('q') || '').trim();
  if (q) state.query = q;

  const tags = (p.get('tags') || '').trim();
  if (tags) {
    state.tags = new Set(tags.split(',').map(s => s.trim()).filter(Boolean));
  }

  const favs = p.get('favs');
  state.onlyFavs = favs === '1';

  const sort = (p.get('sort') || '').trim();
  if (sort && ['relevance','time-asc','time-desc','title-asc','title-desc'].includes(sort)) {
    state.sort = sort;
  }
}

function writeStateToURL() {
  const p = new URLSearchParams(location.search);

  const q = state.query.trim();
  if (q) {
    p.set('q', q);
  } else {
    p.delete('q');
  }

  const tags = Array.from(state.tags);
  if (tags.length) {
    p.set('tags', tags.join(','));
  } else {
    p.delete('tags');
  }

  if (state.onlyFavs) {
    p.set('favs', '1');
  } else {
    p.delete('favs');
  }

  if (state.sort && state.sort !== 'relevance') {
    p.set('sort', state.sort);
  } else {
    p.delete('sort');
  }

  history.replaceState(null, '', `${location.pathname}?${p.toString()}${location.hash}`);
}

/* ------------------------ YouTube helper ------------------------ */
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

/* ------------------------ Render ------------------------ */
function cardHTML(r) {
  const img = r.image || 'assets/icons/icon-512.png';
  const tags = Array.isArray(r.tags) ? r.tags.join(' · ') : '';
  const yid = getYouTubeId(r);

  const isFav = state.favs.has(r.id);
  const favBtn = `
    <button class="btn-fav" data-id="${r.id}" aria-pressed="${isFav ? 'true' : 'false'}" title="${isFav ? 'Rimuovi dai preferiti' : 'Aggiungi ai preferiti'}">
      ${isFav ? '★' : '☆'}
    </button>
  `;

  const recipeBtn = r.url
    ? `<a class="btn-recipe" href="${r.url}" target="_blank" rel="noopener" aria-label="Apri ricetta: ${r.title || ''}">Ricetta</a>`
    : `<a class="btn-recipe disabled" aria-disabled="true" title="Ricetta non disponibile">Ricetta</a>`;

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
        <p class="actions">
          ${favBtn}
          ${recipeBtn}
          ${videoBtn}
        </p>
      </div>
    </article>
  `;
}

function renderRecipes(list) {
  const $wrap = $('#recipes');
  if (!$wrap) return;

  if (!Array.isArray(list) || !list.length) {
    $wrap.innerHTML = `<p>Nessuna ricetta trovata.</p>`;
  } else {
    $wrap.innerHTML = list.map(cardHTML).join('');
  }

  // sincronizza stelle
  $$('.btn-fav').forEach(b => {
    const isOn = state.favs.has(b.dataset.id);
    b.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    b.textContent = isOn ? '★' : '☆';
  });

  // video buttons, se esiste un binder esterno
  if (window.bindVideoButtons) window.bindVideoButtons();

  // aggiorna conteggio risultati
  const $count = $('#results-count');
  if ($count) $count.textContent = String(list.length);
}

/* ------------------------ Filtri + ordinamento ------------------------ */
function applyFiltersAndRender() {
  let list = RECIPES.slice();

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

  if (state.tags.size) {
    const need = state.tags;
    list = list.filter(r => {
      const t = new Set(r.tags || []);
      for (const tag of need) if (!t.has(tag)) return false;
      return true;
    });
  }

  if (state.onlyFavs) {
    list = list.filter(r => state.favs.has(r.id));
  }

  switch (state.sort) {
    case 'time-asc':
      list.sort((a,b) => (a.time||0) - (b.time||0));
      break;
    case 'time-desc':
      list.sort((a,b) => (b.time||0) - (a.time||0));
      break;
    case 'title-asc':
      list.sort((a,b) => String(a.title||'').localeCompare(String(b.title||'')));
      break;
    case 'title-desc':
      list.sort((a,b) => String(b.title||'').localeCompare(String(a.title||'')));
      break;
    default:
      // relevance: lascia l’ordine originale
      break;
  }

  renderRecipes(list);
  writeStateToURL();
}

/* ------------------------ Event wiring ------------------------ */
function wireSearch() {
  const $search = $('#search');
  if (!$search) return;
  $search.value = state.query;
  $search.addEventListener('input', () => {
    state.query = $search.value || '';
    applyFiltersAndRender();
  });
}

function wireOnlyFavs() {
  const $chk = $('#only-favs');
  if (!$chk) return;
  $chk.checked = !!state.onlyFavs;
  $chk.addEventListener('change', () => {
    state.onlyFavs = !!$chk.checked;
    applyFiltersAndRender();
  });
}

function wireSort() {
  const $sel = $('#sort');
  if (!$sel) return;
  $sel.value
