/* Ricette & Lista Spesa – app.js stabile */
(() => {
  'use strict';

  // ---------- Helpers ----------
  const $ = (s, r = document) => r.querySelector(s);

  const LS_KEYS = {
    FAVS: 'rls:favorites',
    STATE: 'rls:lastState'
  };

  const readJSON = (k, fb) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; }
  };
  const writeJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const favs = new Set(readJSON(LS_KEYS.FAVS, []));
  const state = Object.assign({ q:'', diet:'', time:'', onlyFavs:false }, readJSON(LS_KEYS.STATE, {}));
  const saveState = () => writeJSON(LS_KEYS.STATE, state);

  const fmtIngredients = (ing = []) => ing.map(it => {
    if (typeof it === 'string') return it;
    if (!it || typeof it !== 'object') return '';
    const name = it.ref ?? it.name ?? '';
    const qty  = (it.qty ?? '').toString().trim();
    const unit = (it.unit ?? '').toString().trim();
    const quant = [qty, unit].filter(Boolean).join(' ');
    return quant ? `${name} (${quant})` : name;
  }).filter(Boolean).join(', ');

  const getYouTubeId = (v) => {
    if (!v) return '';
    if (/^[\w-]{11}$/.test(v)) return v;
    const m = /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/i.exec(v);
    return m ? m[1] : '';
  };

  async function safeFetchJSON(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error();
      return await r.json();
    } catch {
      return null;
    }
  }

  async function loadAllRecipes() {
    const base  = await safeFetchJSON('assets/json/recipes-it.json') || [];
    const extra = await safeFetchJSON('import/recipes.json') || [];
    const merged = [...base, ...extra].map(r => ({
      id: r.id || crypto.randomUUID(),
      title: r.title || 'Ricetta',
      time: Number(r.time) || 0,
      servings: r.servings || '',
      tags: Array.isArray(r.tags) ? r.tags : [],
      image: r.image || 'assets/icons/icon-512.png',
      ingredients: Array.isArray(r.ingredients) ? r.ingredients : [],
      steps: Array.isArray(r.steps) ? r.steps : [],
      url: r.url || '',
      video: r.video || ''
    }));
    // de-dup per id
    const byId = new Map();
    for (const r of merged) byId.set(r.id, Object.assign(byId.get(r.id) || {}, r));
    return [...byId.values()];
  }

  function recipeCard(r, isFav) {
    const yt = getYouTubeId(r.video);
    return `
      <article class="card" data-id="${r.id}">
        <div class="card__media">
          <img src="${r.image}" alt="${r.title}" loading="lazy">
        </div>
        <div class="card__body">
          <header class="card__head">
            <h3 class="card__title">${r.title}</h3>
            <button class="btn btn-fav ${isFav ? 'is-fav' : ''}" data-action="fav" aria-pressed="${isFav}">❤</button>
          </header>
          <p class="mute">${r.time ? `${r.time} min` : ''}</p>
          <p class="small">${fmtIngredients(r.ingredients)}</p>
          <div class="tags">${r.tags.map(t => `<span class="tag">${t}</span>`).join('')}</div>
          <div class="card__actions">
            ${r.url ? `<a class="btn" target="_blank" rel="noopener" href="${r.url}">Apri ricetta</a>` : ''}
            ${yt ? `<a class="btn" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${yt}">Guarda video</a>` : ''}
          </div>
        </div>
      </article>`;
  }

  function applyFilters(all) {
    let out = all;
    if (state.q) {
      const q = state.q.toLowerCase();
      out = out.filter(r =>
        r.title.toLowerCase().includes(q) ||
        fmtIngredients(r.ingredients).toLowerCase().includes(q) ||
        r.tags.join(' ').toLowerCase().includes(q)
      );
    }
    if (state.diet) out = out.filter(r => r.tags.includes(state.diet));
    if (state.time) out = out.filter(r => (Number(r.time) || 0) <= Number(state.time));
    if (state.onlyFavs) out = out.filter(r => favs.has(r.id));
    return out;
  }

  function render(list, mount) {
    mount.innerHTML = list.map(r => recipeCard(r, favs.has(r.id))).join('') || `<p class="mute">Nessun risultato.</p>`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const mount   = $('#recipes');
    const qInput  = $('#search');
    const dietSel = $('#diet');
    const timeSel = $('#time');
    const onlyFav = $('#onlyFav');

    if (qInput)  qInput.value = state.q || '';
    if (dietSel) dietSel.value = state.diet || '';
    if (timeSel) timeSel.value = state.time || '';
    if (onlyFav) onlyFav.classList.toggle('active', !!state.onlyFavs);

    const ALL = await loadAllRecipes();
    render(applyFilters(ALL), mount);

    qInput?.addEventListener('input', () => {
      state.q = qInput.value.trim();
      saveState();
      render(applyFilters(ALL), mount);
    });
    dietSel?.addEventListener('change', () => {
      state.diet = dietSel.value || '';
      saveState();
      render(applyFilters(ALL), mount);
    });
    timeSel?.addEventListener('change', () => {
      state.time = timeSel.value || '';
      saveState();
      render(applyFilters(ALL), mount);
    });
    onlyFav?.addEventListener('click', () => {
      state.onlyFavs = !state.onlyFavs;
      onlyFav.classList.toggle('active', state.onlyFavs);
      saveState();
      render(applyFilters(ALL), mount);
    });

    // Delegation: preferiti
    mount?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action="fav"]');
      if (!btn) return;
      const card = btn.closest('[data-id]');
      const id = card?.dataset.id;
      if (!id) return;

      const nowFav = !favs.has(id);
      if (nowFav) favs.add(id); else favs.delete(id);
      writeJSON(LS_KEYS.FAVS, [...favs]);

      btn.classList.toggle('is-fav', nowFav);
      btn.setAttribute('aria-pressed', String(nowFav));

      if (state.onlyFavs) render(applyFilters(ALL), mount);
    });

    // opzionale: bottone "Mostra altri" se lo usi per paginazione semplice
    $('#more')?.addEventListener('click', () => render(applyFilters(ALL), mount));
  });
})();
