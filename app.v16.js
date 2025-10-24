// app.v16.js
const $ = (sel) => document.querySelector(sel);

// Mostra versione corrente
const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const $ver = $('#app-version');
if ($ver) $ver.textContent = `v${ver}`;

// URL dataset con cache-busting
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`;

// Fetch "no-store" per forzare dati freschi
async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} nel fetch del dataset`);
  return res.json();
}

// Rendering minimale (adatta alla tua UI)
function renderRecipes(list) {
  const $wrap = $('#recipes');
  if (!$wrap) return;

  if (!Array.isArray(list) || !list.length) {
    $wrap.innerHTML = `<p>Nessuna ricetta trovata.</p>`;
    return;
  }

  const cards = list.map((r) => {
    const img = r.image || 'assets/icons/icon-512.png';
    const tags = Array.isArray(r.tags) ? r.tags.join(' · ') : '';
    return `
      <article class="recipe-card">
        <img src="${img}" alt="${r.title || ''}" loading="lazy" />
        <div class="body">
          <h3>${r.title || 'Senza titolo'}</h3>
          <p class="meta">
            ${r.time ? `${r.time} min` : ''}${r.servings ? ` · ${r.servings} porz.` : ''}${tags ? ` · ${tags}` : ''}
          </p>
          ${r.url ? `<p><a href="${r.url}" target="_blank" rel="noopener">Fonte</a></p>` : ''}
        </div>
      </article>
    `;
  });

  $wrap.innerHTML = cards.join('');
}

// Ricerca client-side (semplice)
function setupSearch(recipes) {
  const $search = $('#search');
  if (!$search) return;
  $search.addEventListener('input', () => {
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
  });
}

// Bottone “Aggiorna dati”
function setupRefresh() {
  const $btn = $('#refresh');
  if (!$btn) return;
  $btn.addEventListener('click', async () => {
    $btn.disabled = true;
    $btn.textContent = 'Aggiorno…';
    try {
      const data = await fetchRecipes();
      renderRecipes(data);
    } catch (e) {
      alert(`Errore aggiornamento: ${e.message}`);
    } finally {
      $btn.disabled = false;
      $btn.textContent = 'Aggiorna dati';
    }
  });
}

// Boot
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

// ————————————————————————————————
// Service Worker (registrazione + gestione update)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      // Passiamo la versione come query (non indispensabile, ma utile per debug)
      const swUrl = `service-worker.js?v=${encodeURIComponent(ver)}`;
      const reg = await navigator.serviceWorker.register(swUrl);

      // Notifica se arriva un nuovo SW pronto ad attivarsi
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            console.log('[SW] Nuova versione installata, ricarico per prendere i nuovi asset');
            // puoi mostrare un toast; qui eseguo un reload soft dopo 500ms
            setTimeout(() => location.reload(), 500);
          }
        });
      });

      // Se il SW invia un messaggio di skipWaiting/activate, ricarica
      navigator.serviceWorker.addEventListener('message', (ev) => {
        if (ev?.data === 'reload') {
          location.reload();
        }
      });
    } catch (e) {
      console.warn('[SW] Registrazione fallita:', e);
    }
  });
}
/* --- Video modal controller --- */
(function(){
  if (window.__videoInit) return;
  window.__videoInit = true;

  function openVideo(yid) {
    var modal = document.getElementById('video-modal');
    var frame = document.getElementById('yt-frame');
    if (!modal || !frame) return window.open('https://www.youtube.com/watch?v=' + yid, '_blank', 'noopener');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + yid + '?autoplay=1&rel=0';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }

  function closeVideo() {
    var modal = document.getElementById('video-modal');
    var frame = document.getElementById('yt-frame');
    if (!modal || !frame) return;
    frame.src = '';
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  document.addEventListener('click', function(e){
    var btn = e.target.closest('.btn-video');
    if (btn) {
      e.preventDefault();
      var yid = btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';
      if (yid) {
        try { openVideo(yid) } catch(_) { window.open('https://www.youtube.com/watch?v=' + yid, '_blank', 'noopener') }
      } else {
        var href = btn.getAttribute('href');
        if (href) window.open(href, '_blank', 'noopener');
      }
      return;
    }
    if (e.target.id === 'video-close' || e.target.id === 'video-modal') closeVideo();
  });
})();
