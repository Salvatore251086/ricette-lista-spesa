<script>
// app_v16.6.js

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const DATA_URL    = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`;

const STATE = {
  recipes: [],
  filtered: [],
  selectedTags: new Set(),
  onlyFav: false,
  search: ''
};

const norm = s => String(s||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().trim();

async function fetchRecipes(){
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  // Può arrivare {recipes:[...]} o direttamente [...]
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.recipes) ? raw.recipes : []);
  return arr
    .map(normalizeRecipe)
    .filter(r => r && r.title); // scarta righe vuote
}

// Adatta qualunque forma in quella attesa dalla UI
function normalizeRecipe(x){
  if (!x || typeof x !== 'object') return null;

  // fallback titoli possibili: title, titolo, name
  const title = safeText(x.title || x.titolo || x.name);
  // url, link, source
  const url   = safeText(x.url || x.link || x.source);
  // immagine
  const image = safeText(x.image || x.img || 'assets/icons/icon-512.png');
  // tempo e porzioni accettano numeri o stringhe
  const time     = toInt(x.time || x.tempo);
  const servings = toInt(x.servings || x.porzioni);

  // tags può essere array o stringa "a,b,c"
  let tags = x.tags;
  if (typeof tags === 'string') {
    tags = tags.split(',').map(t => t.trim()).filter(Boolean);
  }
  if (!Array.isArray(tags)) tags = [];

  // youtube id o url da cui estrarre id
  const youtubeId = extractYouTubeId(x.youtubeId || x.ytid || x.videoId || x.video || x.video_url);

  // ingredients può essere:
  //  - array di stringhe
  //  - array di oggetti con ref/name/ingredient
  //  - stringa "pasta; olio; sale"
  let ingredients = x.ingredients;
  if (typeof ingredients === 'string') {
    ingredients = ingredients.split(';').map(s => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(ingredients)) ingredients = [];
  ingredients = ingredients.map(i => {
    if (typeof i === 'string') return { ref: i };
    if (i && typeof i === 'object') {
      const ref = i.ref || i.name || i.ingredient || '';
      return { ref: String(ref) };
    }
    return null;
  }).filter(Boolean);

  // steps può essere array o stringa con \n
  let steps = x.steps;
  if (typeof steps === 'string') {
    steps = steps.split('\n').map(s => s.trim()).filter(Boolean);
  }
  if (!Array.isArray(steps)) steps = [];

  // Record vuoti? scarta
  if (!title && ingredients.length === 0 && tags.length === 0) return null;

  return { title, url, image, time, servings, tags, youtubeId, ingredients, steps };
}

function safeText(v){ return v ? String(v).trim() : ''; }
function toInt(v){ const n = parseInt(v,10); return Number.isFinite(n) ? n : undefined; }
function extractYouTubeId(v){
  const s = String(v||'').trim();
  if (!s) return '';
  const m = s.match(/(?:[?&]v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  return '';
}

// UI
function getYouTubeId(r){ return r.youtubeId || ''; }

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
      ? `<button class="btn btn-video" data-youtube-id="${yid}" aria-label="Guarda video ${escapeAttr(r.title)}">Guarda video</button>`
      : `<button class="btn btn-video" disabled>Guarda video</button>`;
    const btnSrc = r.url
      ? `<a class="btn btn-ghost" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">Ricetta</a>`
      : `<button class="btn btn-ghost" disabled>Ricetta</button>`;
    const metaBits = [];
    if (r.time)     metaBits.push(`${r.time} min`);
    if (r.servings) metaBits.push(`${r.servings} porz.`);
    return `
      <article class="recipe-card">
        <img class="thumb" src="${escapeAttr(img)}" alt="${escapeAttr(r.title||'')}" loading="lazy" />
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

function escapeAttr(s){ return String(s||'').replace(/"/g,'&quot;'); }

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
  if (STATE.onlyFav) out = out.filter(r => r.favorite);
  if (q){
    out = out.filter(r=>{
      const hay = [
        r.title,
        ...(r.tags||[]),
        ...(r.ingredients||[]).map(i=> i.ref )
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

// Video minimal
let videoBindingDone = false;
let ytWatchdog = null;
let ytFrameId = null;

function ensureVideoBinding(){
  if (videoBindingDone) return;
  videoBindingDone = true;
  document.addEventListener('click', (e)=>{
    const btn = e.target.closest('.btn-video');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.youtubeId || '';
    if (id) openVideoById(id);
  });
  document.addEventListener('click', (e)=>{
    if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')) {
      e.preventDefault();
      closeVideo();
    }
  });
  window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeVideo(); });
  window.addEventListener('message', onYTMessage, false);
}

function onYTMessage(ev){
  const okOrigin = typeof ev.origin === 'string' &&
    (ev.origin.includes('youtube-nocookie.com') || ev.origin.includes('youtube.com'));
  if (!okOrigin) return;
  let data = ev.data;
  if (typeof data === 'string'){ try { data = JSON.parse(data); } catch {} }
  if (!data || typeof data !== 'object') return;
  const evt = data.event;
  const id  = data.id;
  if (ytWatchdog && id && ytFrameId && id !== ytFrameId) return;
  if (evt === 'onReady' || evt === 'infoDelivery' || evt === 'onStateChange') clearYTWatchdog();
  if (evt === 'onError') doYTDirectOpen();
}
function clearYTWatchdog(){ if (ytWatchdog) { clearTimeout(ytWatchdog); ytWatchdog = null; } }
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
  if (!modal || !frame){ window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener'); return; }
  frame.onload = null; frame.onerror = null; frame.src = 'about:blank';
  ytFrameId = 'ytp-' + Date.now();
  frame.id  = 'yt-frame';
  frame.dataset.playerId = ytFrameId;
  frame.dataset.watchUrl = 'https://www.youtube.com/watch?v=' + id;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');
  const url = 'https://www.youtube-nocookie.com/embed/' + id
    + '?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1'
    + '&origin=' + encodeURIComponent(location.origin) + '&widgetid=1';
  clearYTWatchdog();
  ytWatchdog = setTimeout(() => { doYTDirectOpen(); }, 3000);
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

// Boot
(async function init(){
  try{
    const ver = $('#app-version');
    if (ver) ver.textContent = 'v' + APP_VERSION;
    const data = await fetchRecipes();
    STATE.recipes = data;
    STATE.filtered = data.slice();
    setupChips();
    setupSearch();
    setupOnlyFav();
    renderRecipes(STATE.recipes);
  }catch(err){
    console.error(err);
    const host = $('#recipes');
    if (host) host.innerHTML = `<p class="muted">Errore nel caricamento dati: ${err.message}</p>`;
  }
})();
</script>
