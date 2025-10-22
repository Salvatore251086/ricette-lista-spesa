/* =========================
   Ricette & Lista Spesa – app.js
   ========================= */

/* ---------- Costanti DOM ---------- */
const SEL = {
  recipesWrap: '#recipes',            // container delle card (metti l'id del tuo container)
  searchInput: '#search',             // input ricerca testo (se diverso, aggiorna qui)
  timeSelect: '#filterTime',          // select Tempo (opzionale)
  dietSelect: '#filterDiet',          // select Dieta (opzionale)
  btnShowMore: '#btnShowMore',        // bottone "Mostra altri" (opzionale)
  btnOnlyFav: '#btnFav'               // bottone "Solo preferiti" (id richiesto)
};

/* ---------- Storage Keys ---------- */
const LS_FAV_IDS = 'favIds';
const LS_ONLY_FAV = 'onlyFav';

/* ---------- Stato applicazione ---------- */
const state = {
  all: [],            // tutte le ricette (base + import)
  view: [],           // viste dopo filtri
  page: 1,            // paginazione semplice (se usi "Mostra altri")
  pageSize: 12,
  query: '',
  diet: 'any',
  time: 'any',
  favIds: new Set(JSON.parse(localStorage.getItem(LS_FAV_IDS) || '[]')),
  onlyFav: localStorage.getItem(LS_ONLY_FAV) === '1'
};

/* ---------- Util ---------- */
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return [...document.querySelectorAll(sel)]; }

async function loadJSONSafe(url) {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json().catch(() => []);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function saveFav() {
  localStorage.setItem(LS_FAV_IDS, JSON.stringify([...state.favIds]));
}

function setOnlyFav(on) {
  state.onlyFav = !!on;
  localStorage.setItem(LS_ONLY_FAV, state.onlyFav ? '1' : '0');
  const b = $(SEL.btnOnlyFav);
  if (b) b.setAttribute('aria-pressed', state.onlyFav ? 'true' : 'false');
}

function normalizeVideo(v) {
  if (!v) return '';
  // Se è già un ID (lunghezza tipica <= 15), restituisci così.
  if (/^[a-zA-Z0-9_-]{6,15}$/.test(v)) return v;
  // Se è una URL di YouTube, estrai v=...
  try {
    const u = new URL(v);
    if (u.host.includes('youtube') || u.host.includes('youtu.be')) {
      const id = u.searchParams.get('v') || u.pathname.split('/').pop();
      return id || '';
    }
  } catch {/* ignore */}
  return '';
}

/* ---------- Filtri ---------- */
function applyFilters() {
  const q = state.query.trim().toLowerCase();
  let out = state.all;

  if (q) {
    out = out.filter(r => {
      const hay = [
        r.title,
        ...(Array.isArray(r.tags) ? r.tags : []),
        ...(Array.isArray(r.ingredients) ? r.ingredients.map(i => i.ref || i) : [])
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  if (state.diet !== 'any') {
    out = out.filter(r => (r.diet || 'any') === state.diet);
  }

  if (state.time !== 'any') {
    // time è il valore massimo scelto (es. 20, 30, 45...)
    const max = Number(state.time);
    if (!Number.isNaN(max)) out = out.filter(r => Number(r.time || 999) <= max);
  }

  if (state.onlyFav) {
    out = out.filter(r => state.favIds.has(r.id));
  }

  state.view = out;
}

/* ---------- Rendering ---------- */
function cardHTML(r) {
  const favOn = state.favIds.has(r.id);
  const ytId = normalizeVideo(r.video);
  const tags = Array.isArray(r.tags) ? r.tags : [];
  const time = r.time ? `${r.time} min` : '';
  const image = r.image || 'assets/icons/icon-512.png';

  return `
    <article class="recipe-card" data-id="${r.id}">
      <header class="card-header">
        <button class="fav-toggle" aria-pressed="${favOn ? 'true' : 'false'}" title="Aggiungi ai preferiti">★</button>
        <h3 class="title">${r.title}</h3>
      </header>
      <figure class="cover">
        <img src="${image}" alt="${r.title}">
      </figure>
      <div class="meta">
        <span class="time">${time}</span>
        ${tags.length ? `<div class="tags">${tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>` : ''}
      </div>
      <footer class="card-actions">
        ${r.url ? `<a class="btn" href="${r.url}" target="_blank" rel="noopener">Apri ricetta</a>` : ''}
        ${ytId ? `<a class="btn" href="https://www.youtube.com/watch?v=${ytId}" target="_blank" rel="noopener">Guarda video</a>` : ''}
      </footer>
    </article>
  `;
}

function render() {
  const grid = $(SEL.recipesWrap);
  if (!grid) return;

  // paginazione semplice
  const start = 0;
  const end = state.page * state.pageSize;
  const slice = state.view.slice(start, end);

  grid.innerHTML = slice.map(cardHTML).join('');

  // wiring stelline
  $all('.fav-toggle').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const card = e.currentTarget.closest('.recipe-card');
      if (!card) return;
      const id = card.getAttribute('data-id');
      if (!id) return;

      if (state.favIds.has(id)) state.favIds.delete(id);
      else state.favIds.add(id);

      saveFav();
      // Se stiamo filtrando solo preferiti, ricalcoliamo view
      applyFilters();
      render();
    });
  });

  // “Mostra altri” (se presente)
  const moreBtn = $(SEL.btnShowMore);
  if (moreBtn) {
    if (state.view.length > slice.length) {
      moreBtn.style.display = '';
      moreBtn.onclick = () => {
        state.page += 1;
        render();
      };
    } else {
      moreBtn.style.display = 'none';
    }
  }
}

/* ---------- Event wiring UI ---------- */
function initControls() {
  // toggle "Solo preferiti"
  const favBtn = $(SEL.btnOnlyFav);
  if (favBtn) {
    favBtn.setAttribute('aria-pressed', state.onlyFav ? 'true' : 'false');
    favBtn.addEventListener('click', () => {
      const nowOn = favBtn.getAttribute('aria-pressed') !== 'true';
      setOnlyFav(nowOn);
      applyFilters();
      state.page = 1;
      render();
    });
  }

  // ricerca
  const search = $(SEL.searchInput);
  if (search) {
    search.addEventListener('input', () => {
      state.query = search.value || '';
      applyFilters();
      state.page = 1;
      render();
    });
  }

  // select tempo
  const timeSel = $(SEL.timeSelect);
  if (timeSel) {
    timeSel.addEventListener('change', () => {
      state.time = timeSel.value || 'any';
      applyFilters();
      state.page = 1;
      render();
    });
  }

  // select dieta
  const dietSel = $(SEL.dietSelect);
  if (dietSel) {
    dietSel.addEventListener('change', () => {
      state.diet = dietSel.value || 'any';
      applyFilters();
      state.page = 1;
      render();
    });
  }
}

/* ---------- Boot ---------- */
(async function boot() {
  initControls();

  // Carica ricette base e quelle importate (se esistono)
  const [base, imported] = await Promise.all([
    loadJSONSafe('assets/json/recipes-it.json'),
    loadJSONSafe('import/recipes.json') // se 404 o invalido => []
  ]);

  // Sanitizza minimi campi
  const clean = (arr) => arr
    .filter(r => r && r.id && r.title)
    .map(r => ({
      ...r,
      video: normalizeVideo(r.video)
    }));

  state.all = clean([...base, ...imported]);
  state.page = 1;

  applyFilters();
  render();
})();
