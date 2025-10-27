/* app_v16.js — build stabile, con fallback YouTube robusto */

/* ============ Utils & Stato ============ */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const DATA_URL    = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`;

const STATE = {
  recipes: [],
  filtered: [],
  selectedTags: new Set(), // es. {"veloce","primo"}
  onlyFav: false,
  search: ''
};

const norm = s => String(s||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().trim();

/* ============ Data ============ */
async function fetchRecipes(){
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ============ YouTube ============ */
function getYouTubeId(r){
  if (!r) return '';
  if (r.youtubeId) return String(r.youtubeId).trim();
  if (r.ytid)      return String(r.ytid).trim();
  if (r.videoId)   return String(r.videoId).trim();
  if (r.video){
    const m = String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return '';
}

/* ============ Render ============ */
function renderRecipes(list){
  const host = $('#recipes');
  if (!host) return;
  if (!Array.isArray(list) || !list.length){
    host.innerHTML = `<p class="muted">Nessuna ricetta trovata.</p>`;
    return;
  }

  const html = list.map(r=>{
    const img = r.image || 'assets/icons/icon-512.png';
    const tags = Array.isArray(r.tags) ? r.tags : [];
    const tagsHtml = tags.map(t=>`<span class="tag" data-tag="${t}">${t}</span>`).join('');
    const yid = getYouTubeId(r);

    const btnVideo = yid
      ? `<button class="btn btn-video" data-youtube-id="${yid}" aria-label="Guarda video ${r.title}">Guarda video</button>`
      : `<button class="btn btn-video" disabled title="Video non disponibile">Guarda video</button>`;

    const btnSrc = r.url
      ? `<a class="btn btn-ghost" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>`
      : `<button class="btn btn-ghost" disabled>Ricetta</button>`;

    const metaBits = [];
    if (r.time)     metaBits.push(`${r.time} min`);
    if (r.servings) metaBits.push(`${r.servings} porz.`);

    return `
      <article class="recipe-card">
        <img class="thumb" src="${img}" alt="${r.title||''}" loading="lazy" />
        <div class="body">
          <h3>${r.title || 'Senza titolo'}</h3>
          <p class="meta">${metaBits.join(' · ')}</p>
          <p class="tags">${tagsHtml}</p>
          <div class="actions">
            ${btnSrc}
            ${btnVideo}
          </div>
        </div>
      </article>
    `;
  }).join('');

  host.innerHTML = html;
  ensureVideoBinding();
}

/* ============ Filtri & Ricerca ============ */
function applyFilters(){
  const q = norm(STATE.search);
  const needTags = [...STATE.selectedTags].filter(t => t !== 'tutti').map(norm);

  let out = STATE.recipes;

  if (needTags.length){
    out = out.filter(r=>{
      const bag = new Set((r.tags||[]).map(norm));
      for (const t of needTags) if (!bag.has(t)) return false;
      return true;
    });
  }

  if (STATE.onlyFav){
    out = out.filter(r => r.favorite);
  }

  if (q){
    out = out.filter(r=>{
      const hay = [
        r.title,
        ...(r.tags||[]),
        ...(r.ingredients||[]).map(i=> i.ref || i.name || i.ingredient )
      ].filter(Boolean).map(norm).join(' ');
      return hay.includes(q);
    });
  }

  STATE.filtered = out;
  renderRecipes(out);
}

function setupChips(){
  const bar = $('#chipbar');
  if (!bar) return;

  bar.addEventListener('click', (e)=>{
    const chip = e.target.closest('.chip');
    if (!chip) return;

    const tag = chip.dataset.tag || norm(chip.textContent);
    if (!tag) return;

    if (tag === 'tutti'){
      STATE.selectedTags.clear();
      $$('.chip', bar).forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
    } else {
      const all = $('.chip[data-tag="tutti"]', bar);
      if (all) all.classList.remove('active');

      chip.classList.toggle('active');
      if (chip.classList.contains('active')) STATE.selectedTags.add(tag);
      else STATE.selectedTags.delete(tag);
    }
    applyFilters();
  });
}

function setupSearch(){
  const el = $('#search');
  if (!el) return;
  el.addEventListener('input', ()=>{
    STATE.search = el.value || '';
    applyFilters();
  });
}

function setupOnlyFav(){
  const el = $('#only-fav');
  if (!el) return;
  el.addEventListener('change', ()=>{
    STATE.onlyFav = !!el.checked;
    applyFilters();
  });
}

/* ============ Generatore "Suggerisci ricette" ============ */
function normalizeWords(str){
  return norm(str).split(/[^a-z0-9]+/i).filter(Boolean);
}
function suggestRecipes(userText, N=6){
  const words = new Set(normalizeWords(userText));
  if (!words.size) return [];

  const scored = STATE.recipes.map(r=>{
    const refs = new Set((r.ingredients||[]).map(i=> norm(i.ref || i.name || i.ingredient)));
    let score = 0;
    words.forEach(w => { if (refs.has(w)) score++; });
    return { r, score };
  });

  scored.sort((a,b)=> b.score - a.score || norm(a.r.title).localeCompare(norm(b.r.title)));
  return scored.filter(x=>x.score>0).slice(0,N).map(x=>x.r);
}

function setupSuggest(){
  const btn = $('#btn-suggest');
  const ta  = $('#ingredients');
  if (!btn || !ta) return;

  btn.addEventListener('click', ()=>{
    const txt = ta.value || '';
    const hits = suggestRecipes(txt, 6);
    if (!hits.length){
      alert('Nessuna ricetta trovata con questi ingredienti. Prova parole semplici (es: "pasta, aglio, olio").');
      return;
    }
    renderRecipes(hits);
    $('#recipes')?.scrollIntoView({behavior:'smooth', block:'start'});
  });

  ta.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      btn.click();
    }
  });
}

/* ============ Aggiorna dati ============ */
function setupRefresh(){
  const btn = $('#refresh');
  if (!btn) return;
  btn.addEventListener('click', async ()=>{
    btn.disabled = true;
    btn.textContent = 'Aggiorno…';
    try{
      const data = await fetchRecipes();
      STATE.recipes = data;
      STATE.selectedTags.clear();
      $$('.chip').forEach(c=>c.classList.remove('active'));
      $('.chip[data-tag="tutti"]')?.classList.add('active');
      STATE.search = '';
      $('#search') && ($('#search').value = '');
      applyFilters();
    }catch(e){
      alert('Aggiornamento fallito: ' + e.message);
    }finally{
      btn.disabled = false;
      btn.textContent = 'Aggiorna dati';
    }
  });
}

/* ============ Video Modale con watchdog & postMessage ============ */
let videoBindingDone = false;
let ytWatchdog = null;
let ytFrameId = null;

function ensureVideoBinding(){
  if (videoBindingDone) return;
  videoBindingDone = true;

  // open
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('.btn-video');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.youtubeId || '';
    if (id) openVideoById(id);
  });

  // close
  document.addEventListener('click', (e)=>{
    if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')) {
      e.preventDefault();
      closeVideo();
    }
  });

  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeVideo(); });

  // ascolta i messaggi del player
  window.addEventListener('message', onYTMessage, false);
}

function onYTMessage(ev){
  // accetta solo messaggi provenienti da domini YouTube
  const okOrigin =
    typeof ev.origin === 'string' &&
    (ev.origin.includes('youtube-nocookie.com') || ev.origin.includes('youtube.com'));

  if (!okOrigin) return;

  let data = ev.data;
  if (typeof data === 'string'){
    try { data = JSON.parse(data); } catch { /* ignore */ }
  }
  if (!data || typeof data !== 'object') return;

  // YouTube Iframe API message format: {event, info, id}
  const evt = data.event;
  const id  = data.id;

  if (ytWatchdog && id && ytFrameId && id !== ytFrameId) {
    // messaggio di un altro player (non nostro)
    return;
  }

  // Qualsiasi segnale di vita del player annulla il fallback
  if (evt === 'onReady' || evt === 'infoDelivery' || evt === 'onStateChange') {
    clearYTWatchdog();
  }
  // Errori espliciti del player → fallback immediato
  if (evt === 'onError') {
    doYTDirectOpen();
  }
}

function clearYTWatchdog(){
  if (ytWatchdog) {
    clearTimeout(ytWatchdog);
    ytWatchdog = null;
  }
}

function doYTDirectOpen(){
  clearYTWatchdog();
  const frame = $('#yt-frame');
  const src = frame && frame.dataset?.watchUrl ? frame.dataset.watchUrl : '';
  closeVideo();
  if (src) window.open(src, '_blank', 'noopener');
}

function openVideoById(id){
  const modal = $('#video-modal');
  const frame = $('#yt-frame');
  if (!modal || !frame){
    window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener');
    return;
  }

  // prepara
  frame.onload = null;
  frame.onerror = null;
  frame.src = 'about:blank';

  // genera un id univoco per correlare i postMessage del player
  ytFrameId = 'ytp-' + Date.now();
  frame.id  = 'yt-frame'; // id DOM visibile resta costante
  frame.dataset.playerId = ytFrameId;
  frame.dataset.watchUrl = 'https://www.youtube.com/watch?v=' + id;

  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');

  // url embed con enablejsapi per ricevere postMessage
  const url = 'https://www.youtube-nocookie.com/embed/' + id
    + '?autoplay=1&rel=0&modestbranding=1&playsinline=1'
    + '&enablejsapi=1'
    + '&origin=' + encodeURIComponent(location.origin)
    + '&widgetid=1';

  // watchdog: se entro 3000ms il player non ci manda alcun messaggio → fallback
  clearYTWatchdog();
  ytWatchdog = setTimeout(() => {
    // nessun messaggio di vita: apri direttamente su YouTube
    doYTDirectOpen();
  }, 3000);

  // NB: l’onload può scattare ANCHE con errore 153. Non lo usiamo per annullare il fallback.
  frame.src = url;
}

function closeVideo(){
  clearYTWatchdog();
  const modal = $('#video-modal');
  const frame = $('#yt-frame');
  if (!modal) return;
  if (frame) frame.src = 'about:blank';
  modal.classList.remove('show');
  modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}

/* ============ Boot ============ */
(async function init(){
  try{
    const ver = $('#app-version');
    if (ver) ver.textContent = 'v' + APP_VERSION;

    STATE.recipes = await fetchRecipes();
    STATE.filtered = STATE.recipes.slice();

    setupChips();
    setupSearch();
    setupOnlyFav();
    setupSuggest();
    setupRefresh();

    renderRecipes(STATE.recipes);
  }catch(err){
    console.error(err);
    const host = $('#recipes');
    if (host) host.innerHTML = `<p class="muted">Errore nel caricamento dati: ${err.message}</p>`;
  }
})();
