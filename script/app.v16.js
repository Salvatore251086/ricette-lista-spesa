/* app.v16.js — versione pulita e stabile (chip + search + suggerimenti + video modale) */

/* ============ Utils & Stato ============ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const DATA_URL    = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`;

const STATE = {
  recipes     : [],     // dataset completo
  filtered    : [],     // lista filtrata corrente
  selectedTags: new Set(), // es. {"veloce","primo"}
  onlyFav     : false,
  search      : '',
  sort        : 'relevance'
};

const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim();

/* ============ Data ============ */
async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ============ YouTube ID helper ============ */
function getYouTubeId(r) {
  if (!r) return '';
  if (r.youtubeId) return String(r.youtubeId).trim();
  if (r.ytid)      return String(r.ytid).trim();
  if (r.videoId)   return String(r.videoId).trim();
  if (r.video) {
    const m = String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return '';
}

/* ============ Render ricette ============ */
function renderRecipes(list) {
  const host = $('#recipes');
  if (!host) return;

  if (!Array.isArray(list) || !list.length) {
    host.innerHTML = `<p class="muted">Nessuna ricetta trovata.</p>`;
    return;
  }

  host.innerHTML = list.map(r => {
    const img  = r.image || 'assets/icons/icon-512.png';
    const tags = Array.isArray(r.tags) ? r.tags : [];
    const tagsHtml = tags.map(t => `<span class="tag">${t}</span>`).join(' ');
    const yid  = getYouTubeId(r);

    const btnVideo = yid
      ? `<button class="btn btn-video" data-youtube-id="${yid}" aria-label="Guarda video ${r.title}">Guarda video</button>`
      : `<button class="btn btn-video" disabled title="Video non disponibile">Guarda video</button>`;

    const btnRicetta = r.url
      ? `<a class="btn btn-ghost" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>`
      : '';

    return `
      <article class="recipe-card">
        <img class="thumb" src="${img}" alt="${r.title || ''}" loading="lazy">
        <div class="body">
          <h3>${r.title || 'Senza titolo'}</h3>
          <p class="meta">
            ${r.time ? `${r.time} min` : ''}${r.servings ? ` · ${r.servings} porz.` : ''}
          </p>
          <p class="tags">${tagsHtml}</p>
          <div class="actions">
            ${btnRicetta}
            ${btnVideo}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

/* ============ Filtri ============ */
function applyFilters() {
  const base = STATE.recipes;
  const needs = [...STATE.selectedTags].filter(t => t !== 'tutti').map(norm);
  const q = norm(STATE.search);

  let out = base;

  if (needs.length) {
    out = out.filter(r => {
      const bag = new Set((r.tags || []).map(norm));
      for (const t of needs) if (!bag.has(t)) return false;
      return true;
    });
  }

  if (STATE.onlyFav) {
    out = out.filter(r => r.favorite); // adatta alla tua logica se usi i preferiti
  }

  if (q) {
    out = out.filter(r => {
      const hay = [
        r.title,
        ...(r.tags || []),
        ...(r.ingredients || []).map(i => i.ref || i.name || i.ingredient)
      ].filter(Boolean).map(norm).join(' ');
      return hay.includes(q);
    });
  }

  STATE.filtered = out;
  renderRecipes(out);
}

/* ============ Chip (toolbar) ============ */
/** idrata i chip nella barra in alto (#chipbar o .filters):
 *  assegna data-tag dal testo se manca, normalizzato */
function hydrateChips() {
  const bar = $('#chipbar') || $('.filters') || $('header');
  if (!bar) return;

  const known = new Set();
  STATE.recipes.forEach(r => (r.tags || []).forEach(t => known.add(norm(t))));

  const candidates = $$('[data-tag], .chip, .badge, .pill, button', bar);
  candidates.forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    // ignora ciò che non sembra un chip
    const txt = norm(el.dataset.tag || el.textContent);
    if (!txt) return;
    // accetta sempre “tutti”
    if (['tutti', 'tutto', 'all'].includes(txt) || known.has(txt)) {
      el.dataset.tag = txt;
      el.classList.add('chip');
    }
  });

  // evidenzia “tutti” la prima volta
  if (!bar.querySelector('.chip.active')) {
    const all = bar.querySelector('.chip[data-tag="tutti"], .chip[data-tag="tutto"], .chip[data-tag="all"]');
    if (all) all.classList.add('active');
  }
}

/** handler unico in bubbling per click sui chip (solo nella toolbar) */
function setupChipHandler() {
  document.addEventListener('click', (e) => {
    const bar = $('#chipbar') || $('.filters') || $('header');
    if (!bar) return;

    const chip = e.target.closest('.chip,[data-tag]');
    if (!chip || !bar.contains(chip)) return;            // limita alla toolbar
    if (chip.closest('article.recipe-card')) return;     // non i tag dentro le card

    const tag = norm(chip.dataset.tag || chip.textContent);
    if (!tag) return;

    if (['tutti', 'tutto', 'all'].includes(tag)) {
      STATE.selectedTags.clear();
      $$('.chip.active,[data-tag].active', bar).forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
    } else {
      // togli lo stato da “tutti”
      $$('.chip[data-tag="tutti"].active, .chip[data-tag="tutto"].active, .chip[data-tag="all"].active', bar)
        .forEach(c => c.classList.remove('active'));
      chip.classList.toggle('active');
      if (chip.classList.contains('active')) STATE.selectedTags.add(tag);
      else STATE.selectedTags.delete(tag);
    }

    applyFilters();
  }, { capture: false });
}

/* ============ Search & Solo preferiti ============ */
function setupSearch() {
  const inp = $('#search') || $('input[type="search"]') || $('input[placeholder*="ingredienti"]');
  if (!inp) return;
  inp.addEventListener('input', () => {
    STATE.search = inp.value || '';
    applyFilters();
  });
}

function setupOnlyFav() {
  const sw = $('#only-fav') || $('input[type="checkbox"][name*="pref"]');
  if (!sw) return;
  sw.addEventListener('change', () => {
    STATE.onlyFav = !!sw.checked;
    applyFilters();
  });
}

/* ============ “Suggerisci ricette” ============ */
function normalizeWords(str) {
  return norm(str).split(/[^a-z0-9]+/).filter(Boolean);
}

function suggestRecipes(text, N = 6) {
  const words = new Set(normalizeWords(text));
  if (!words.size) return [];

  const scored = STATE.recipes.map(r => {
    const refs = new Set((r.ingredients || []).map(i => norm(i.ref || i.name || i.ingredient)));
    let score = 0;
    words.forEach(w => { if (refs.has(w)) score += 1; });
    return { r, score };
  });

  scored.sort((a, b) => b.score - a.score || norm(a.r.title).localeCompare(norm(b.r.title)));
  return scored.filter(x => x.score > 0).slice(0, N).map(x => x.r);
}

function setupSuggest() {
  const ta  = $('#ai-ingredients') || $('#ingredients-input') || $('#ingredients') || $('textarea');
  const btn = $('#btn-suggest')    || $$('button').find(b => /suggerisc/i.test(b.textContent));
  if (!ta || !btn) return;

  const run = () => {
    const txt = ta.value || '';
    const hits = suggestRecipes(txt, 6);
    if (!hits.length) {
      alert('Nessuna ricetta trovata con questi ingredienti. Prova parole semplici (es. "pasta, aglio, olio").');
      return;
    }
    renderRecipes(hits);
    $('#recipes')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  btn.addEventListener('click', run);
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
  });
}

/* ============ Modale Video (robusto) ============ */
function openVideoById(id) {
  const modal = $('#video-modal');
  const frame = $('#yt-frame');

  // fallback nuova scheda se manca la modale
  if (!modal || !frame) {
    window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
    return;
  }

  frame.src = 'about:blank';
  modal.classList.add('show');
  modal.style.display = 'flex';
  document.body.classList.add('no-scroll');

  // origin aiuta a ridurre l’errore 153; timeout → fallback nuova scheda
  const url = 'https://www.youtube-nocookie.com/embed/' + id +
    '?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=' + encodeURIComponent(location.origin);

  let loaded = false;
  const to = setTimeout(() => {
    if (!loaded) {
      closeVideo();
      window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
    }
  }, 2000);

  frame.onload  = () => { loaded = true; clearTimeout(to); };
  frame.onerror = () => { clearTimeout(to); closeVideo(); window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener'); };
  frame.src = url;
}

function closeVideo() {
  const modal = $('#video-modal');
  const frame = $('#yt-frame');
  if (frame) frame.src = 'about:blank';
  if (modal) {
    modal.classList.remove('show');
    modal.style.display = 'none';
  }
  document.body.classList.remove('no-scroll');
}

// binding unico per bottoni video (bubbling)
function setupVideoHandler() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn-video');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.youtubeId || '';
    if (id) openVideoById(id);
  }, { capture: false });

  // chiusura modale
  document.addEventListener('click', (e) => {
    if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')) {
      e.preventDefault();
      closeVideo();
    }
  }, { capture: false });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeVideo(); });
}

// esponi per test in console
window.openVideoById = openVideoById;

/* ============ Boot ============ */
(async function init() {
  try {
    const verEl = $('#app-version');
    if (verEl) verEl.textContent = `v${APP_VERSION}`;

    STATE.recipes  = await fetchRecipes();
    STATE.filtered = STATE.recipes.slice();

    // UI wiring
    setupChipHandler();
    hydrateChips();          // dopo avere i dati, i chip sono noti
    setupSearch();
    setupOnlyFav();
    setupSuggest();
    setupVideoHandler();

    // primo render
    applyFilters();
  } catch (err) {
    const host = $('#recipes');
    if (host) host.innerHTML = `<p class="error">Errore nel caricamento dati: ${err.message}</p>`;
  }
})();
