// app v16 — robusto, nessun tag <script>, nessun fetch bloccante

const $ = (id) => document.getElementById(id);
const on = (el, ev, fn, opts) => el && el.addEventListener(ev, fn, opts);
const log = (...a) => console.info('[app]', ...a);

document.addEventListener('DOMContentLoaded', bootstrap);

async function bootstrap () {
  const el = {
    q: $('q'),
    filterTime: $('filterTime'),
    filterDiet: $('filterDiet'),
    btnReset: $('btnReset'),
    btnFav: $('btnFav'),
    recipesGrid: $('recipesGrid'),
    quickTags: $('quickTags'),
    empty: $('empty'),
    btnLoadMore: $('btnLoadMore'),
    tabRicette: $('tabRicette'),
    tabGeneratore: $('tabGeneratore'),
    tabLista: $('tabLista'),
    cookieBar: $('cookieBar'),
    cookieAccept: $('cookieAccept'),
    cookieDecline: $('cookieDecline'),
  };

  const state = {
    all: [],
    filtered: [],
    page: 0,
    pageSize: 12,
    onlyFav: false,
    fav: loadFav(),
    query: '',
    diet: '',
    maxTime: '',
  };

  // Fonti dati
  const BASE_URL = `assets/json/recipes-it.json?v=${Date.now()}`;
  const IMPORT_URL = `import/recipes.json?v=${Date.now()}`; // opzionale

  const base = await safeJson(BASE_URL);
  const extra = await safeJson(IMPORT_URL);
  state.all = mergeById(base, extra);

  bindFilters(el, state);
  renderTags(el, state);
  applyFilters(state, el);
  renderPage(state, el);

  bindTabs(el);
  bindCookieBar(el);
}

async function safeJson(url) {
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return [];
    return await r.json();
  } catch { return []; }
}

function loadFav() {
  try { return new Set(JSON.parse(localStorage.getItem('fav_ids') || '[]')); }
  catch { return new Set(); }
}
function saveFav(set) { localStorage.setItem('fav_ids', JSON.stringify([...set])); }

function mergeById(base = [], extra = []) {
  const map = new Map(base.map(r => [r.id, r]));
  for (const r of extra || []) map.set(r.id, { ...map.get(r.id), ...r });
  return [...map.values()];
}

function bindFilters(el, state) {
  on(el.q, 'input', () => { state.query = (el.q.value || '').trim().toLowerCase(); resetAndRender(state, el); });
  on(el.filterTime, 'change', () => { state.maxTime = el.filterTime.value || ''; resetAndRender(state, el); });
  on(el.filterDiet, 'change', () => { state.diet = el.filterDiet.value || ''; resetAndRender(state, el); });
  on(el.btnReset, 'click', () => {
    if (el.q) el.q.value = '';
    if (el.filterTime) el.filterTime.value = '';
    if (el.filterDiet) el.filterDiet.value = '';
    state.query = ''; state.maxTime = ''; state.diet = ''; state.onlyFav = false;
    el.btnFav?.setAttribute('aria-pressed', 'false');
    resetAndRender(state, el);
  });
  on(el.btnFav, 'click', () => {
    state.onlyFav = !state.onlyFav;
    el.btnFav?.setAttribute('aria-pressed', String(state.onlyFav));
    resetAndRender(state, el);
  });
  on(el.btnLoadMore, 'click', () => { state.page++; renderPage(state, el); });
}

function bindTabs(el) {
  const show = (sec) => {
    document.getElementById('ricetteSec')?.classList.toggle('hidden', sec !== 'ricette');
    document.getElementById('genSec')?.classList.toggle('hidden', sec !== 'gen');
    document.getElementById('listaSec')?.classList.toggle('hidden', sec !== 'lista');
    el.tabRicette?.setAttribute('aria-pressed', String(sec === 'ricette'));
    el.tabGeneratore?.setAttribute('aria-pressed', String(sec === 'gen'));
    el.tabLista?.setAttribute('aria-pressed', String(sec === 'lista'));
  };
  on(el.tabRicette, 'click', () => show('ricette'));
  on(el.tabGeneratore, 'click', () => show('gen'));
  on(el.tabLista, 'click', () => show('lista'));
  show('ricette');
}

function bindCookieBar(el) {
  const k = 'cookie_ok';
  const ok = localStorage.getItem(k) === '1';
  if (!el.cookieBar) return;
  el.cookieBar.style.display = ok ? 'none' : '';
  const ack = () => { localStorage.setItem(k,'1'); el.cookieBar.style.display='none'; };
  on(el.cookieAccept, 'click', ack);
  on(el.cookieDecline, 'click', ack);
}

function resetAndRender(state, el) {
  state.page = 0;
  applyFilters(state, el);
  clearGrid(el);
  renderPage(state, el);
}

function applyFilters(state, el) {
  const q = state.query;
  const diet = state.diet;
  const maxT = parseInt(state.maxTime || '0', 10) || 0;
  const onlyFav = state.onlyFav;
  let arr = state.all.slice();

  if (q) {
    const words = q.split(/\s+/).filter(Boolean);
    arr = arr.filter(r =>
      words.every(w =>
        (r.title || '').toLowerCase().includes(w) ||
        (r.tags || []).join(' ').toLowerCase().includes(w) ||
        (r.ingredients || []).map(i => (i.ref || i).toString().toLowerCase()).join(' ').includes(w)
      )
    );
  }
  if (diet) arr = arr.filter(r => (r.diet || '').toLowerCase() === diet.toLowerCase());
  if (maxT) arr = arr.filter(r => (r.time|0) && r.time <= maxT);
  if (onlyFav) arr = arr.filter(r => state.fav.has(r.id));

  state.filtered = arr;
  el.empty?.classList.toggle('hidden', arr.length > 0);
  el.btnLoadMore?.classList.toggle('hidden', arr.length <= state.pageSize);
}

function clearGrid(el) { if (el.recipesGrid) el.recipesGrid.innerHTML = ''; }

function renderPage(state, el) {
  const start = state.page * state.pageSize;
  const slice = state.filtered.slice(start, start + state.pageSize);
  const frag = document.createDocumentFragment();
  for (const r of slice) frag.appendChild(card(r, state));
  el.recipesGrid?.appendChild(frag);
  const more = state.filtered.length > (start + state.pageSize);
  el.btnLoadMore?.classList.toggle('hidden', !more);
}

function card(r, state) {
  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.padding = '12px';

  const fav = document.createElement('button');
  fav.className = 'chip';
  fav.setAttribute('aria-pressed', String(state.fav.has(r.id)));
  fav.textContent = state.fav.has(r.id) ? '★ Preferito' : '☆ Preferito';
  fav.style.float = 'right';
  fav.onclick = () => {
    if (state.fav.has(r.id)) state.fav.delete(r.id); else state.fav.add(r.id);
    saveFav(state.fav);
    fav.setAttribute('aria-pressed', String(state.fav.has(r.id)));
    fav.textContent = state.fav.has(r.id) ? '★ Preferito' : '☆ Preferito';
  };

  const h3 = document.createElement('h3');
  h3.textContent = r.title || 'Ricetta';
  h3.style.margin = '0 0 6px';

  const meta = document.createElement('div');
  meta.className = 'muted';
  meta.textContent = [
    r.time ? `${r.time} min` : '',
    r.servings ? `${r.servings} porz.` : '',
    r.diet || ''
  ].filter(Boolean).join(' · ');

  const tags = document.createElement('div');
  tags.style.marginTop = '6px';
  (r.tags || []).slice(0, 6).forEach(t => {
    const b = document.createElement('span');
    b.className = 'chip';
    b.textContent = t;
    tags.appendChild(b);
  });

  const actions = document.createElement('div');
  actions.style.display = 'flex'; actions.style.gap = '8px'; actions.style.marginTop = '8px';
  if (r.url) {
    const a = document.createElement('a');
    a.href = r.url; a.className = 'btn'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Apri ricetta';
    actions.appendChild(a);
  }
  if (r.video) {
    const v = document.createElement('a');
    v.href = r.video.includes('http') ? r.video : `https://www.youtube.com/watch?v=${r.video}`;
    v.className = 'btn'; v.target = '_blank'; v.rel = 'noopener'; v.textContent = 'Guarda video';
    actions.appendChild(v);
  }

  wrap.appendChild(fav);
  wrap.appendChild(h3);
  wrap.appendChild(meta);
  wrap.appendChild(tags);
  wrap.appendChild(actions);
  return wrap;
}

function renderTags(el, state) {
  if (!el.quickTags) return;
  el.quickTags.innerHTML = '';
  const counts = new Map();
  for (const r of state.all) for (const t of (r.tags || [])) counts.set(t, (counts.get(t) || 0) + 1);
  const popular = [...counts.entries()].sort((a,b) => b[1]-a[1]).slice(0, 16).map(([t]) => t);
  for (const t of popular) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = t;
    b.onclick = () => { state.query = t.toLowerCase(); const q = $('q'); if (q) q.value = t; resetAndRender(state, el); };
    el.quickTags.appendChild(b);
  }
}
