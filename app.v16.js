/* app.v16.js – versione minima stabile */

/* Utils */
const $ = (sel) => document.querySelector(sel);
const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const $ver = $('#app-version'); if ($ver) $ver.textContent = `v${ver}`;

/* Dataset */
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`;
async function fetchRecipes() {
  const r = await fetch(DATA_URL, { cache: 'no-store' });
  if (!r.ok) throw new Error('HTTP '+r.status);
  return r.json();
}

/* YouTube ID */
function getYouTubeId(recipe){
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
    const tags = Array.isArray(r.tags) ? r.tags.join(' · ') : '';
    const yid = getYouTubeId(r);
    const btn = yid
      ? `<button class="btn-video" data-youtube-id="${yid}">Guarda video</button>`
      : `<button class="btn-video" disabled title="Video non disponibile">Guarda video</button>`;
    return `
      <article class="recipe-card">
        <img src="${img}" alt="${r.title||''}" loading="lazy" />
        <div class="body">
          <h3>${r.title||'Senza titolo'}</h3>
          <p class="meta">${r.time?`${r.time} min`:''}${r.servings?` · ${r.servings} porz.`:''}${tags?` · ${tags}`:''}</p>
          <p>${r.url?`<a href="${r.url}" target="_blank" rel="noopener">Fonte</a>`:''} ${btn}</p>
        </div>
      </article>
    `;
  }).join('');
  wrap.innerHTML = html;
}

/* Ricerca */
function setupSearch(recipes){
  const input = $('#search'); if (!input) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    const out = q ? recipes.filter(r => {
      const hay = [r.title, ...(r.tags||[]), ...(r.ingredients||[]).map(i=>i.ref)]
        .filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    }) : recipes;
    renderRecipes(out);
  });
}

/* Aggiorna dati */
function setupRefresh(){
  const btn = $('#refresh'); if (!btn) return;
  btn.addEventListener('click', async () => {
    btn.disabled = true; btn.textContent = 'Aggiorno…';
    try { const data = await fetchRecipes(); renderRecipes(data); }
    catch(e){ alert('Errore aggiornamento: '+e.message); }
    finally { btn.disabled = false; btn.textContent = 'Aggiorna dati'; }
  });
}

/* Video: modale se presente, altrimenti nuova scheda */
;(() => {
  if (window.__videoInit) return; window.__videoInit = true;
  const modal = document.getElementById('video-modal');
  const frame = document.getElementById('yt-frame');

  function openModal(id){
    if (modal && frame) {
      frame.src = 'https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0';
      modal.classList.add('show'); modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    } else {
      window.open('https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0','_blank','noopener');
    }
  }
  function closeModal(){
    if (!modal || !frame) return;
    frame.src = ''; modal.classList.remove('show'); modal.style.display = 'none';
    document.body.style.overflow = '';
  }

  document.addEventListener('click', e => {
    const b = e.target.closest('.btn-video');
    if (b) { e.preventDefault(); const id = b.dataset.youtubeId||''; if (id) openModal(id); return; }
    if (e.target && (e.target.id==='video-close' || e.target.classList.contains('vm-backdrop'))) {
      e.preventDefault(); closeModal();
    }
  });
  document.addEventListener('keydown', e => { if (e.key==='Escape') closeModal(); });
})();

/* Boot */
(async () => {
  try {
    const data = await fetchRecipes();
    renderRecipes(data);
    setupSearch(data);
    setupRefresh();
  } catch(e){
    console.error(e);
    const wrap = $('#recipes');
    if (wrap) wrap.innerHTML = `<p class="error">Errore nel caricamento dati: ${e.message}</p>`;
  }
})();
