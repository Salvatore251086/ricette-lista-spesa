/* app_v16.js — v16.7 fix titoli, link Ricetta, fotocamera, modale video */

const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const DATA_URL    = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`;

const STATE = {
  recipes: [],
  filtered: [],
  selectedTags: new Set(),
  onlyFav: false,
  search: '',
  stream: null,
  devices: [],
  activeDeviceId: null,
  ytWatchdog: null,
  ytFrameId: null
};

const norm = s => String(s||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().trim();

/* ======== Data ======== */
async function fetchRecipes(){
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.json();
  return Array.isArray(raw?.recipes) ? raw.recipes : Array.isArray(raw) ? raw : [];
}

/* Adatta qualsiasi forma in una forma coesa per la UI */
function normalizeRecipe(x){
  if (!x || typeof x !== 'object') return null;

  // titoli più varianti possibili
  const title =
    x.title || x.titolo || x.nome || x.name || x.recipe_title || x.label || '';

  // url sorgente
  const srcUrl =
    x.url || x.link || x.source || x.src || '';

  // immagine
  const image = x.image || x.cover || x.thumb || x.picture || 'assets/icons/icon-512.png';

  // tags come array pulito
  const tags = Array.isArray(x.tags)
    ? x.tags
    : typeof x.tags === 'string'
      ? x.tags.split(',').map(t=>t.trim()).filter(Boolean)
      : [];

  // video id o url
  const ytid = x.youtubeId || x.ytid || x.videoId || '';
  const video =
    ytid ? `https://www.youtube.com/watch?v=${ytid}` :
    x.video || x.video_url || x.youtube || '';

  // tempo e porzioni
  const time = x.time || x.tempo || x.durata || '';
  const servings = x.servings || x.porzioni || x.servi || '';

  return {
    id: x.id || norm(title) || cryptoRandomId(),
    title: String(title || 'Senza titolo').trim(),
    url: srcUrl || '',
    image,
    tags,
    ytid: ytid || '',
    video,
    time,
    servings
  };
}

function cryptoRandomId(){
  try{
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return 'id-' + a[0].toString(36) + a[1].toString(36);
  }catch{ return 'id-' + Math.random().toString(36).slice(2); }
}

/* ======== Render ======== */
function getYouTubeId(r){
  if (!r) return '';
  if (r.ytid) return String(r.ytid).trim();
  if (r.video){
    const m = String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
    if (m) return m[1];
  }
  return '';
}

function renderRecipes(list){
  const host = $('#recipes');
  const empty = $('#empty');
  if (!host) return;

  if (!Array.isArray(list) || list.length === 0){
    host.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const html = list.map(r=>{
    const yid = getYouTubeId(r);
    const btnVideo = yid
      ? `<button class="btn btn-primary btn-video" data-youtube-id="${yid}" aria-label="Guarda video ${escapeHtml(r.title)}">Guarda video</button>`
      : `<button class="btn" disabled title="Video non disponibile">Guarda video</button>`;

    // Link Ricetta: se c'è url metto <a>, altrimenti bottone disabilitato
    const btnSrc = r.url
      ? `<a class="btn btn-success" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">Ricetta</a>`
      : `<button class="btn" disabled>Ricetta</button>`;

    const metaBits = [];
    if (r.time) metaBits.push(`${r.time}`);
    if (r.servings) metaBits.push(`${r.servings} porz.`);

    const tagsHtml = (r.tags||[]).map(t=>`<span class="tag" data-tag="${escapeAttr(t)}">${escapeHtml(t)}</span>`).join('');

    return `
      <article class="card">
        <img class="thumb" src="${escapeAttr(r.image || 'assets/icons/icon-512.png')}" alt="${escapeAttr(r.title||'')}" loading="lazy" onerror="this.src='assets/icons/icon-512.png'"/>
        <div class="body">
          <h3>${escapeHtml(r.title || 'Senza titolo')}</h3>
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

function escapeHtml(s){ return String(s).replace(/[&<>"']/g, m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m])); }
function escapeAttr(s){ return escapeHtml(s); }

/* ======== Filtri ======== */
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
        ...(r.tags||[])
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
      $('.chip[data-tag="tutti"]', bar)?.classList.remove('active');
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
  $('#only-fav')?.addEventListener('change', e=>{
    STATE.onlyFav = !!e.target.checked;
    applyFilters();
  });
}

/* ======== Generatore ======== */
function normalizeWords(str){ return norm(str).split(/[^a-z0-9]+/i).filter(Boolean); }
function suggestRecipes(userText, N=6){
  const words = new Set(normalizeWords(userText));
  if (!words.size) return [];
  const scored = STATE.recipes.map(r=>{
    const refs = new Set((r.tags||[]).map(norm));
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
    const hits = suggestRecipes(ta.value||'', 6);
    if (!hits.length){ alert('Nessuna ricetta trovata con questi ingredienti.'); return; }
    renderRecipes(hits);
    $('#recipes')?.scrollIntoView({behavior:'smooth', block:'start'});
  });
}

/* ======== Aggiorna dati ======== */
function setupRefresh(){
  const btn = $('#refresh');
  if (!btn) return;
  btn.addEventListener('click', async ()=>{
    btn.disabled = true;
    btn.textContent = 'Aggiorno…';
    try{
      const raw = await fetchRecipes();
      STATE.recipes = raw.map(normalizeRecipe).filter(Boolean);
      STATE.selectedTags.clear();
      $$('.chip').forEach(c=>c.classList.remove('active'));
      $('.chip[data-tag="tutti"]')?.classList.add('active');
      $('#search') && ($('#search').value = '');
      STATE.search = '';
      applyFilters();
    }catch(e){
      alert('Aggiornamento fallito: ' + e.message);
    }finally{
      btn.disabled = false;
      btn.textContent = 'Aggiorna dati';
    }
  });
}

/* ======== Modale video con watchdog ======== */
function ensureVideoBinding(){
  if (ensureVideoBinding.done) return;
  ensureVideoBinding.done = true;

  document.addEventListener('click', e=>{
    const btn = e.target.closest('.btn-video');
    if (!btn) return;
    e.preventDefault();
    const id = btn.dataset.youtubeId || '';
    if (id) openVideoById(id);
  });

  document.addEventListener('click', e=>{
    if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')) {
      e.preventDefault();
      closeVideo();
    }
  });

  window.addEventListener('keydown', e=>{ if (e.key === 'Escape') closeVideo(); });
  window.addEventListener('message', onYTMessage, false);
}

function onYTMessage(ev){
  const okOrigin = typeof ev.origin === 'string' && (ev.origin.includes('youtube-nocookie.com') || ev.origin.includes('youtube.com'));
  if (!okOrigin) return;
  let data = ev.data;
  if (typeof data === 'string'){ try{ data = JSON.parse(data); }catch{} }
  if (!data || typeof data !== 'object') return;
  if (['onReady','infoDelivery','onStateChange'].includes(data.event)) clearYTWatchdog();
  if (data.event === 'onError') doYTDirectOpen();
}
function clearYTWatchdog(){ if (STATE.ytWatchdog){ clearTimeout(STATE.ytWatchdog); STATE.ytWatchdog = null; } }
function doYTDirectOpen(){
  clearYTWatchdog();
  const frame = $('#yt-frame');
  const src = frame?.dataset?.watchUrl || '';
  closeVideo();
  if (src) window.open(src, '_blank', 'noopener');
}
function openVideoById(id){
  const modal = $('#video-modal');
  const frame = $('#yt-frame');
  if (!modal || !frame){ window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener'); return; }
  frame.onload = null; frame.onerror = null; frame.src = 'about:blank';
  STATE.ytFrameId = 'ytp-' + Date.now();
  frame.dataset.playerId = STATE.ytFrameId;
  frame.dataset.watchUrl = 'https://www.youtube.com/watch?v=' + id;
  modal.classList.add('show');
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');

  const url = 'https://www.youtube-nocookie.com/embed/' + id
    + '?autoplay=1&rel=0&modestbranding=1&playsinline=1'
    + '&enablejsapi=1'
    + '&origin=' + encodeURIComponent(location.origin)
    + '&widgetid=1';

  clearYTWatchdog();
  STATE.ytWatchdog = setTimeout(()=> doYTDirectOpen(), 3000);
  frame.src = url;
}
function closeVideo(){
  clearYTWatchdog();
  const modal = $('#video-modal');
  const frame = $('#yt-frame');
  if (frame) frame.src = 'about:blank';
  modal?.classList.remove('show');
  modal?.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
}

/* ======== Fotocamera minimale ======== */
async function listCameras(){
  try{
    const devices = await navigator.mediaDevices.enumerateDevices();
    STATE.devices = devices.filter(d=>d.kind==='videoinput');
    const sel = $('#cam-devices');
    if (!sel) return;
    sel.innerHTML = STATE.devices.map(d=>`<option value="${d.deviceId}">${escapeHtml(d.label || 'Fotocamera')}</option>`).join('');
    if (!STATE.activeDeviceId && STATE.devices[0]) STATE.activeDeviceId = STATE.devices[0].deviceId;
    if (STATE.activeDeviceId) sel.value = STATE.activeDeviceId;
  }catch{}
}
async function openCamera(){
  try{
    await listCameras();
    const id = $('#cam-devices')?.value || STATE.activeDeviceId || undefined;
    const stream = await navigator.mediaDevices.getUserMedia({ video: id ? { deviceId:{exact:id} } : true, audio:false });
    STATE.stream = stream;
    const v = $('#cam'); v.srcObject = stream; await v.play();
    $('#btn-snap').disabled = false; $('#btn-close-cam').disabled = false;
  }catch{
    alert('Permesso negato o fotocamera non disponibile');
  }
}
function closeCamera(){
  if (STATE.stream){ STATE.stream.getTracks().forEach(t=>t.stop()); STATE.stream = null; }
  const v = $('#cam'); if (v){ v.pause(); v.srcObject = null; }
  $('#btn-snap').disabled = true; $('#btn-close-cam').disabled = true;
}
function setupCameraUI(){
  if (!navigator.mediaDevices?.getUserMedia) { $('#camera-panel')?.remove(); return; }
  $('#btn-open-cam')?.addEventListener('click', openCamera);
  $('#btn-close-cam')?.addEventListener('click', closeCamera);
  $('#cam-devices')?.addEventListener('change', e=>{ STATE.activeDeviceId = e.target.value; if (STATE.stream) openCamera(); });
  $('#btn-snap')?.addEventListener('click', ()=>{
    const v = $('#cam'); const c = $('#snap'); if (!v) return;
    c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v,0,0,c.width,c.height);
    // OCR reale lo attiveremo dopo. Per ora simuliamo append testo
    const ta = $('#ingredients'); if (ta) ta.value = (ta.value ? ta.value + ', ' : '') + 'testo-etichetta';
  });
  $('#btn-upload')?.addEventListener('click', ()=> $('#file-upload').click());
  $('#file-upload')?.addEventListener('change', ()=>{ const ta=$('#ingredients'); if (ta) ta.value = (ta.value?ta.value+', ':'') + 'immagine-caricata'; });
}

/* ======== Boot ======== */
(async function init(){
  try{
    const ver = $('#app-version'); if (ver) ver.textContent = APP_VERSION ? ' '+APP_VERSION : '';
    const data = await fetchRecipes();
    STATE.recipes = data.map(normalizeRecipe).filter(Boolean);
    STATE.filtered = STATE.recipes.slice();

    setupChips();
    setupSearch();
    setupOnlyFav();
    setupSuggest();
    setupRefresh();
    setupCameraUI();

    renderRecipes(STATE.recipes);
  }catch(err){
    console.error(err);
    $('#recipes')?.insertAdjacentHTML('beforebegin', `<p class="muted">Errore nel caricamento dati: ${escapeHtml(err.message)}</p>`);
  }
})();
