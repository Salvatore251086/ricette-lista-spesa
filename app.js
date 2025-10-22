<script>
/* Ricette & Lista Spesa – app.js (versione compatta, senza dipendenze) */
(() => {
  'use strict';

  // --------------------- Utilità ---------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const LS_KEYS = {
    FAVS: 'rls:favorites',
    LIST: 'rls:shopping',
    STATE: 'rls:lastState'
  };

  const readJSON = (k, fallback) => {
    try { return JSON.parse(localStorage.getItem(k)) ?? fallback; }
    catch { return fallback; }
  };
  const writeJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  // Favoriti come Set per lookup O(1)
  const favs = new Set(readJSON(LS_KEYS.FAVS, []));

  // Stato UI (per share link)
  const state = Object.assign({ q:'', diet:'', time:'', onlyFavs:false }, readJSON(LS_KEYS.STATE, {}));
  const saveState = () => writeJSON(LS_KEYS.STATE, state);

  // Normalizza array ingredienti in stringa breve
  const fmtIngredients = (ingArr = []) => {
    // supporta sia {ref, qty, unit} sia stringhe
    const names = ingArr.map(it => {
      if (typeof it === 'string') return it;
      if (!it || typeof it !== 'object') return '';
      // mostra "nome (qty unit)" se disponibile
      const name = it.ref ?? it.name ?? '';
      const qty  = (it.qty ?? '').toString().trim();
      const unit = (it.unit ?? '').toString().trim();
      const quant = [qty, unit].filter(Boolean).join(' ');
      return quant ? `${name} (${quant})` : name;
    }).filter(Boolean);
    return names.join(', ');
  };

  // Esporta ID YouTube da URL, oppure tratta stringa già ID
  const getYouTubeId = (v) => {
    if (!v) return '';
    // già un id?
    if (/^[\w-]{11}$/.test(v)) return v;
    // url classici
    const m =
      /(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]{11})/i.exec(v) ||
      /youtube\.com\/embed\/([\w-]{11})/i.exec(v);
    return m ? m[1] : '';
  };

  // --------------------- Dati ---------------------
  async function safeFetchJSON(url) {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) throw new Error(`${url} ${r.status}`);
      return await r.json();
    } catch {
      return null;
    }
  }

  async function loadAllRecipes() {
    // Base
    const base = await safeFetchJSON('assets/json/recipes-it.json') || [];
    // Import opzionale (se non esiste → null)
    const extra = await safeFetchJSON('import/recipes.json') || [];
    const merged = [...base, ...extra].map(r => ({
      id: r.id || crypto.randomUUID(),
      title: r.title || 'Ricetta',
      time: Number(r.time) || 0,
      servings: r.servings || '',
      tags: r.tags || [],
      image: r.image || 'assets/icons/icon-512.png',
      ingredients: r.ingredients || [],
      steps: r.steps || [],
      url: r.url || '',
      video: r.video || ''
    }));
    // de-dup per id
    const byId = new Map();
    for (const r of merged) byId.set(r.id, Object.assign(byId.get(r.id) || {}, r));
    return [...byId.values()];
  }

  // --------------------- Rendering ---------------------
  function recipeCard(r) {
    const isFav = favs.has(r.id);
    const ytId = getYouTubeId(r.video);
    return `
      <article class="card" data-id="${r.id}">
        <div class="card__media">
          <img src="${r.image}" alt="${r.title}" loading="lazy">
        </div>
        <div class="card__body">
          <header class="card__head">
            <h3 class="card__title">${r.title}</h3>
            <button class="btn btn-fav ${isFav ? 'is-fav':''}" data-action="fav" aria-pressed="${isFav}" title="Aggiungi ai preferiti">
              ❤
            </button>
          </header>
          <p class="mute">${r.time ? `${r.time} min` : ''}</p>
          <p class="small">${fmtIngredients(r.ingredients)}</p>
          <div class="tags">
            ${r.tags.map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
          <div class="card__actions">
            ${r.url ? `<a class="btn" target="_blank" rel="noopener" href="${r.url}">Apri ricetta</a>`:''}
            ${ytId ? `<a class="btn" target="_blank" rel="noopener" href="https://www.youtube.com/watch?v=${ytId}">Guarda video</a>`:''}
          </div>
        </div>
      </article>
    `;
  }

  function render(recipes, { mount }) {
    mount.innerHTML = recipes.map(recipeCard).join('') || `<p class="mute">Nessun risultato.</p>`;
  }

  // --------------------- Filtri ---------------------
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
    if (state.diet) {
      out = out.filter(r => r.tags.includes(state.diet));
    }
    if (state.time) {
      const max = Number(state.time);
      out = out.filter(r => (Number(r.time) || 0) <= max);
    }
    if (state.onlyFavs) {
      out = out.filter(r => favs.has(r.id));
    }
    return out;
  }

  // --------------------- Bootstrap ---------------------
  document.addEventListener('DOMContentLoaded', async () => {
    const mount = $('#recipes');
    const qInput = $('#search');
    const dietSel = $('#diet');
    const timeSel = $('#time');
    const onlyFavBtn = $('#onlyFav');

    // ripristina UI
    if (qInput) qInput.value = state.q || '';
    if (dietSel && state.diet) dietSel.value = state.diet;
    if (timeSel && state.time) timeSel.value = state.time;
    if (onlyFavBtn) onlyFavBtn.classList.toggle('active', !!state.onlyFavs);

    const ALL = await loadAllRecipes();
    render(applyFilters(ALL), { mount });

    // Eventi ricerca/filtri
    qInput?.addEventListener('input', () => {
      state.q = qInput.value.trim();
      saveState();
      render(applyFilters(ALL), { mount });
    });
    dietSel?.addEventListener('change', () => {
      state.diet = dietSel.value || '';
      saveState();
      render(applyFilters(ALL), { mount });
    });
    timeSel?.addEventListener('change', () => {
      state.time = timeSel.value || '';
      saveState();
      render(applyFilters(ALL), { mount });
    });
    onlyFavBtn?.addEventListener('click', () => {
      state.onlyFavs = !state.onlyFavs;
      onlyFavBtn.classList.toggle('active', state.onlyFavs);
      saveState();
      render(applyFilters(ALL), { mount });
    });

    // Delegation: preferiti
    mount?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-action="fav"]');
      if (!btn) return;
      const card = btn.closest('[data-id]');
      const id = card?.dataset.id;
      if (!id) return;

      const isFav = favs.has(id);
      if (isFav) favs.delete(id); else favs.add(id);
      writeJSON(LS_KEYS.FAVS, [...favs]);

      btn.classList.toggle('is-fav', !isFav);
      btn.setAttribute('aria-pressed', String(!isFav));

      // se attivo filtro “solo preferiti”, aggiorna lista
      if (state.onlyFavs) render(applyFilters(ALL), { mount });
    });

    // Pulsante “Mostra altri” (se lo usi per paginazione semplice)
    $('#more')?.addEventListener('click', () => {
      // qui eventualmente puoi implementare lazy/pagination
      render(applyFilters(ALL), { mount });
    });
  });
})();
</script>
