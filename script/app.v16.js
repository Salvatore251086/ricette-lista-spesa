/* app.v16.js – versione stabile con modale video robusta */

/* ------------------------ Utils & Versione ------------------------ */
const $ = (sel) => document.querySelector(sel);

// Mostra versione corrente a schermo (se presente lo span #app-version)
const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'vdev';
const $ver = $('#app-version');
if ($ver) $ver.textContent = ver;

/* ------------------------ Dataset (fetch no-store) ------------------------ */
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`;

async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} nel fetch del dataset`);
  return res.json();
}

// Esporto per eventuale riuso esterno
window.loadRecipes = fetchRecipes;

/* ------------------------ Estrazione YouTube ID ------------------------ */
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

/* ------------------------ Render cards ricette ------------------------ */
function renderRecipes(list) {
  const $wrap = $('#recipes');
  if (!$wrap) return;

  if (!Array.isArray(list) || !list.length) {
    $wrap.innerHTML = `<p class="muted">Nessuna ricetta trovata.</p>`;
    return;
  }

  const html = list
    .map((r) => {
      const img = r.image || 'assets/icons/icon-512.png';
      const title = r.title || 'Senza titolo';
      const time = r.time ? `${r.time} min` : '';
      const porz = r.servings ? `${r.servings} porz.` : '';
      const tags = Array.isArray(r.tags) ? r.tags : [];
      const tagsHtml = tags
        .map((t) => `<span class="tag">${String(t)}</span>`)
        .join(' ');

      const yid = getYouTubeId(r);
      const videoBtn = yid
        ? `<button class="btn btn-primary btn-video" data-youtube-id="${yid}">Guarda video</button>`
        : `<button class="btn btn-primary btn-video" disabled title="Video non disponibile">Guarda video</button>`;

      const recipeBtn = r.url
        ? `<a class="btn btn-success btn-recipe" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>`
        : `<button class="btn btn-success" disabled title="Ricetta non disponibile">Ricetta</button>`;

      return `
        <article class="recipe-card">
          <div class="thumb">
            <img src="${img}" alt="${title}" loading="lazy">
          </div>
          <div class="body">
            <h3 class="card-title">${title}</h3>
            <p class="meta">
              ${[time, porz].filter(Boolean).join(' · ')}
            </p>
            <p class="tags">${tagsHtml}</p>
            <p class="actions">
              ${recipeBtn}
              ${videoBtn}
            </p>
          </div>
        </article>
      `;
    })
    .join('');

  $wrap.innerHTML = html;

  // collega i bottoni video ora che il DOM è aggiornato
  if (window.bindVideoButtons) window.bindVideoButtons();
}

/* ------------------------ Ricerca client-side ------------------------ */
function setupSearch(recipes) {
  const $search = $('#search');
  if (!$search) return;

  function apply() {
    const q = $search.value.trim().toLowerCase();
    const filtered = !q
      ? recipes
      : recipes.filter((r) => {
          const hay = [
            r.title,
            ...(r.tags || []),
            ...(r.ingredients || []).map((i) => i.ref),
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        });

    renderRecipes(filtered);
  }

  $search.addEventListener('input', apply);
}

/* ------------------------ Aggiorna dati (refetch) ------------------------ */
function setupRefresh() {
  const $btn = $('#refresh');
  if (!$btn) return;

  $btn.addEventListener('click', async () => {
    $btn.disabled = true;
    const old = $btn.textContent;
    $btn.textContent = 'Aggiorno…';
    try {
      const data = await fetchRecipes();
      renderRecipes(data);
    } catch (e) {
      alert(`Errore aggiornamento: ${e.message}`);
    } finally {
      $btn.disabled = false;
      $btn.textContent = old || 'Aggiorna dati';
    }
  });
}

/* ------------------------ Boot ------------------------ */
let RECIPES = [];

(async function init() {
  try {
    RECIPES = await fetchRecipes();
    renderRecipes(RECIPES);
    setupSearch(RECIPES);
    setupRefresh();
  } catch (e) {
    console.error(e);
    const $wrap = $('#recipes');
    if ($wrap) $wrap.innerHTML = `<p class="error">Errore nel caricamento dati: ${e.message}</p>`;
  }
})();

/* ------------------------ Service Worker (solo GitHub Pages) ------------------------ */
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
            setTimeout(() => location.reload(), 400);
          }
        });
      });

      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev && ev.data === 'reload') location.reload();
      });
    } catch (e) {
      console.warn('[SW] Registrazione SW fallita:', e);
    }
  });
}

/* ------------------------ Video handler (modale robusta) ------------------------ */
/*
  Comportamento:
  - Se la modale (#video-modal) e l'iframe (#yt-frame) esistono:
      → apro SEMPRE la modale e carico l'embed (no timeout aggressivi).
  - Se mancano gli elementi:
      → fallback immediato in nuova scheda (YouTube watch).
*/
(() => {
  if (window.__videoInit) return;
  window.__videoInit = true;

  const modal = document.getElementById('video-modal');
  const frame = document.getElementById('yt-frame');
  const closeBtn = document.getElementById('video-close');
  const ORIGIN = location.origin;

  function openInNewTab(id) {
    window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
  }

  function showModal() {
    if (!modal) return;
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function hideModal() {
    if (!modal || !frame) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
    frame.src = 'about:blank';
  }

  function openModal(id) {
    // Fallback rapido se mancano gli elementi DOM
    if (!modal || !frame) {
      openInNewTab(id);
      return;
    }

    // Mostro SUBITO la modale (l'iframe carica dopo)
    showModal();

    // URL embed con youtube-nocookie e origin
    const url =
      'https://www.youtube-nocookie.com/embed/' +
      id +
      '?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=' +
      encodeURIComponent(ORIGIN);

    frame.src = url;
  }

  // Delegato click: intercetto click su .btn-video
  document.addEventListener(
    'click',
    (e) => {
      const btn = e.target.closest('.btn-video');
      if (!btn) return;

      e.preventDefault();

      const id =
        btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';

      if (!id) {
        alert('Video non disponibile');
        return;
      }

      openModal(id);
    },
    true
  );

  // Chiudi con X o clic sul backdrop scuro
  if (closeBtn) {
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      hideModal();
    });
  }
  document.addEventListener('click', (e) => {
    if (e.target.classList && e.target.classList.contains('vm-backdrop')) {
      hideModal();
    }
  });

  // Tasto Esc per chiudere
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideModal();
  });

  // Esport util per test manuale in Console
  window.openVideoById = (id) => openModal(id);
  window.closeVideoModal = () => hideModal();
})();
/* ------- SAFETY EXPORT & VIDEO BIND (append to file end) ------- */
(function () {
  // Export globale SEMPRE disponibile
  if (typeof window.openVideoById !== 'function') {
    window.openVideoById = function (id) {
      const modal = document.getElementById('video-modal');
      const frame = document.getElementById('yt-frame');
      if (modal && frame) {
        // mostra modale
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        // imposta URL YouTube privacy e origin
        frame.src = 'https://www.youtube-nocookie.com/embed/' + id +
          '?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=' +
          encodeURIComponent(location.origin);
      } else {
        // fallback in nuova scheda se la modale non c'è
        window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
      }
    };
  }

  // Gestione chiusura modale (backdrop, bottone, ESC)
  function closeModal() {
    const modal = document.getElementById('video-modal');
    const frame = document.getElementById('yt-frame');
    if (!modal) return;
    modal.classList.remove('show');
    document.body.style.overflow = '';
    if (frame) frame.src = 'about:blank';
  }
  document.addEventListener('click', (e) => {
    if (e.target.id === 'video-close' || e.target.id === 'video-close-btn') {
      e.preventDefault();
      closeModal();
    }
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Bind difensivo dei bottoni .btn-video
  function bindVideoButtons() {
    document.querySelectorAll('.btn-video').forEach((btn) => {
      if (btn.__boundVideo) return;
      btn.__boundVideo = true;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const id = btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';
        if (!id) { alert('Video non disponibile'); return; }
        window.openVideoById(id);
      }, { passive: false });
    });
  }

  // Primo bind al ready
  if (document.readyState !== 'loading') bindVideoButtons();
  else document.addEventListener('DOMContentLoaded', bindVideoButtons);

  // Re-bind automatico a ogni render/mutazione del contenitore
  const host = document.getElementById('recipes');
  if (host && !host.__videoObserver) {
    host.__videoObserver = new MutationObserver(bindVideoButtons);
    host.__videoObserver.observe(host, { childList: true, subtree: true });
  }

  // Espone il re-bind per chiamarlo dopo i render manualmente (se serve)
  window.bindVideoButtons = bindVideoButtons;
})();
