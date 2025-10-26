/* app_v16.js — build stabile con Fotocamera/OCR + video fallback robusto */

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
      <article class="recipe-card card">
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

/* ============ Fotocamera & OCR ============ */
const Cam = {
  stream: null,
  worker: null,
  opening: false,
};

function supportsMedia(){
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
}

async function ensureOcrWorker(){
  if (Cam.worker) return Cam.worker;
  // Usa Tesseract.js 5 – carica ITA e ENG (fallback) dal CDN standard
  Cam.worker = await Tesseract.createWorker({
    logger: _msg => { /* silenzioso; se vuoi progresso, logga qui */ },
    langPath: 'https://tessdata.projectnaptha.com/5',
  });
  await Cam.worker.loadLanguage('ita');
  await Cam.worker.initialize('ita');
  // Aggiungi ENG come fallback veloce per etichette miste
  try {
    await Cam.worker.loadLanguage('eng');
    await Cam.worker.initialize('eng');
    await Cam.worker.setParameters({ tessedit_ocr_engine_mode: 'DEFAULT' });
  } catch { /* opzionale */ }
  return Cam.worker;
}

async function openCamera(){
  if (Cam.opening || Cam.stream) return;
  Cam.opening = true;

  const video = $('#cam');
  const shot  = $('#btn-shot-ocr');
  const close = $('#btn-close-cam');

  try{
    if (!supportsMedia()) throw new Error('Fotocamera non supportata su questo dispositivo.');

    const constraints = {
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    };

    // iOS/Safari a volte richiede user
    try {
      Cam.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      Cam.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio:false });
    }

    video.srcObject = Cam.stream;
    await video.play();

    shot.disabled  = false;
    close.disabled = true; // abilitato dopo il primo frame
    video.addEventListener('loadeddata', ()=> { close.disabled = false; }, { once:true });

  }catch(err){
    alert('Impossibile aprire la fotocamera: ' + err.message);
  }finally{
    Cam.opening = false;
  }
}

function closeCamera(){
  const video = $('#cam');
  const shot  = $('#btn-shot-ocr');
  const close = $('#btn-close-cam');

  if (Cam.stream){
    Cam.stream.getTracks().forEach(t=>t.stop());
    Cam.stream = null;
  }
  video.srcObject = null;
  shot.disabled  = true;
  close.disabled = true;
}

function drawVideoToCanvas(){
  const video = $('#cam');
  const canvas = $('#snap');
  const ctx = canvas.getContext('2d');

  // ridimensiona per performance (lato maggiore ~ 1280)
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.min(1280 / Math.max(vw, vh), 1);
  const cw = Math.round(vw * scale);
  const ch = Math.round(vh * scale);

  canvas.width = cw; canvas.height = ch;
  ctx.drawImage(video, 0, 0, cw, ch);
  return canvas;
}

async function runOcrOnCanvas(canvas){
  const worker = await ensureOcrWorker();
  const { data } = await worker.recognize(canvas);
  return data.text || '';
}

function mergeIntoIngredients(text){
  const ta = $('#ingredients');
  if (!ta) return;

  const current = ta.value;
  const tokens = (current ? current + ',' : '') + text;
  // normalizza: minuscole, separa per non alfanumerici, togli vuoti, deduplica
  const words = tokens
    .toLowerCase()
    .split(/[^a-z0-9àèéìòù]+/i)
    .map(s=>s.trim())
    .filter(Boolean);

  const uniq = Array.from(new Set(words));
  ta.value = uniq.join(', ');
}

async function shotAndOcr(){
  try{
    const canvas = drawVideoToCanvas();
    const text = await runOcrOnCanvas(canvas);
    if (!text.trim()){
      alert('Non ho letto testo nella foto. Prova a mettere a fuoco o più luce.');
      return;
    }
    mergeIntoIngredients(text);
  }catch(err){
    alert('Errore OCR: ' + err.message);
  }
}

async function ocrImageFile(file){
  const img = new Image();
  const url = URL.createObjectURL(file);
  await new Promise((ok, ko)=>{
    img.onload = ok; img.onerror = ko; img.src = url;
  });

  // disegna su canvas ridotto
  const canvas = $('#snap');
  const ctx = canvas.getContext('2d');

  const maxSide = 1600;
  const scale = Math.min(maxSide / Math.max(img.width, img.height), 1);
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  URL.revokeObjectURL(url);
  const text = await runOcrOnCanvas(canvas);
  if (!text.trim()){
    alert('Nessun testo riconosciuto nell’immagine.');
    return;
  }
  mergeIntoIngredients(text);
}

function setupCameraUI(){
  const btnOpen  = $('#btn-open-cam');
  const btnShot  = $('#btn-shot-ocr');
  const btnClose = $('#btn-close-cam');
  const btnUpload= $('#btn-upload');
  const input    = $('#file-ocr');
  const dropZone = $('#ocr-dropzone');
  const dz       = dropZone?.querySelector('.dropzone');

  if (btnOpen)  btnOpen.addEventListener('click', openCamera);
  if (btnClose) btnClose.addEventListener('click', closeCamera);
  if (btnShot)  btnShot.addEventListener('click', shotAndOcr);

  if (btnUpload) btnUpload.addEventListener('click', ()=> input.click());
  if (input) input.addEventListener('change', async (e)=>{
    const f = e.target.files?.[0];
    if (f) await ocrImageFile(f);
    input.value = '';
  });

  // Drag&Drop nel riquadro nero
  if (dropZone && dz){
    const active = v => dz.classList.toggle('active', v);
    ['dragenter','dragover'].forEach(ev=> dropZone.addEventListener(ev, (e)=>{ e.preventDefault(); active(true); }));
    ['dragleave','drop'].forEach(ev=> dropZone.addEventListener(ev, (e)=>{ e.preventDefault(); active(false); }));

    dropZone.addEventListener('drop', async (e)=>{
      const f = e.dataTransfer?.files?.[0];
      if (f) await ocrImageFile(f);
    });
  }

  // Incolla immagine dall’appunti (desktop)
  document.addEventListener('paste', async (e)=>{
    const file = [...(e.clipboardData?.items||[])]
      .map(i=> i.getAsFile && i.getAsFile())
      .find(Boolean);
    if (file && /^image\//i.test(file.type)){
      await ocrImageFile(file);
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
  const okOrigin =
    typeof ev.origin === 'string' &&
    (ev.origin.includes('youtube-nocookie.com') || ev.origin.includes('youtube.com'));

  if (!okOrigin) return;

  let data = ev.data;
  if (typeof data === 'string'){
    try { data = JSON.parse(data); } catch { /* ignore */ }
  }
  if (!data || typeof data !== 'object') return;

  const evt = data.event;
  const id  = data.id;

  if (ytWatchdog && id && ytFrameId && id !== ytFrameId) return;

  if (evt === 'onReady' || evt === 'infoDelivery' || evt === 'onStateChange') {
    clearYTWatchdog();
  }
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

  frame.onload = null;
  frame.onerror = null;
  frame.src = 'about:blank';

  ytFrameId = 'ytp-' + Date.now();
  frame.dataset.playerId = ytFrameId;
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
    setupCameraUI();

    renderRecipes(STATE.recipes);
  }catch(err){
    console.error(err);
    const host = $('#recipes');
    if (host) host.innerHTML = `<p class="muted">Errore nel caricamento dati: ${err.message}</p>`;
  }
})();
