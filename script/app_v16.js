/* app_v16.js — fix definitivo errore 153 con fallback a 3 stadi, modale ON, bottoni colorati */

/* ============ Utils & Stato ============ */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'v16';
const DATA_URL    = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`;

const STATE = {
  recipes: [],
  filtered: [],
  selectedTags: new Set(),
  onlyFav: false,
  search: ''
};

const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim();

/* ============ Data ============ */
async function fetchRecipes(){
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ============ YouTube helpers ============ */
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

function checkThumbExists(id){
  return new Promise(resolve=>{
    if (!id) return resolve(false);
    const img = new Image();
    let done = false;
    const finish = ok => { if (!done){ done = true; resolve(ok); } };
    img.onload = ()=> finish(true);
    img.onerror = ()=> finish(false);
    img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    setTimeout(()=> finish(true), 800); // se YouTube blocca onload, non impedire il tentativo
  });
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
    const safeTitle = (r.title || 'Ricetta').replace(/"/g, '&quot;');

    const btnVideo = `
      <button type="button"
              class="btn btn-video"
              data-youtube-id="${yid || ''}"
              onclick="window.__openVideo(this.dataset.youtubeId, &quot;${safeTitle}&quot;)"
              aria-label="Guarda video ${safeTitle}">
        Guarda video
      </button>`.trim();

    const btnSrc = r.url
      ? `<a class="btn btn-recipe" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>`
      : `<button class="btn btn-recipe" type="button" disabled>Ricetta</button>`;

    const metaBits = [];
    if (r.time)     metaBits.push(`${r.time} min`);
    if (r.servings) metaBits.push(`${r.servings} porz.`);

    return `
      <article class="recipe-card">
        <img class="thumb" src="${img}" alt="${safeTitle}" loading="lazy">
        <div class="body">
          <h3>${safeTitle}</h3>
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

  if (STATE.onlyFav) out = out.filter(r => r.favorite);

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
  bar.addEventListener('click', e=>{
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

/* ============ Suggerisci ricette ============ */
const normalizeWords = str => norm(str).split(/[^a-z0-9]+/i).filter(Boolean);

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
      alert('Nessuna ricetta trovata con questi ingredienti.');
      return;
    }
    renderRecipes(hits);
    $('#recipes')?.scrollIntoView({behavior:'smooth', block:'start'});
  });

  ta.addEventListener('keydown', e=>{
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
      if ($('#search')) $('#search').value = '';
      applyFilters();
    }catch(e){
      alert('Aggiornamento fallito: ' + e.message);
    }finally{
      btn.disabled = false;
      btn.textContent = 'Aggiorna dati';
    }
  });
}

/* ============ Modale Video: anti-153 a 3 stadi ============ */
let fb1 = null, fb2 = null;

function clearTimers(){
  if (fb1) { clearTimeout(fb1); fb1 = null; }
  if (fb2) { clearTimeout(fb2); fb2 = null; }
}

window.__openVideo = async function(ytId, title){
  const t = (title || 'Ricetta');
  const hasId = typeof ytId === 'string' && ytId.trim().length === 11;
  const modal = $('#video-modal');
  const frame = $('#yt-frame');

  if (!modal || !frame){
    if (hasId) window.open(`https://www.youtube.com/watch?v=${ytId}`, '_blank', 'noopener');
    else window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(t+' ricetta')}`, '_blank', 'noopener');
    return;
  }

  clearTimers();
  frame.onload = null;
  frame.onerror = null;
  frame.src = 'about:blank';
  modal.setAttribute('aria-hidden', 'false');
  document.body.classList.add('no-scroll');

  if (!hasId){
    window.__closeVideo();
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(t+' ricetta')}`, '_blank', 'noopener');
    return;
  }

  // 0) verifica thumbnail (ID palesemente invalido o bloccato)
  await checkThumbExists(ytId);

  // Listener messaggi player: qualunque “onReady / onStateChange / infoDelivery” cancella i fallback
  const onMsg = ev => {
    const okOrigin = typeof ev.origin === 'string' &&
      (ev.origin.includes('youtube-nocookie.com') || ev.origin.includes('youtube.com'));
    if (!okOrigin) return;
    let d = ev.data;
    if (typeof d === 'string'){ try { d = JSON.parse(d); } catch {} }
    if (!d || typeof d !== 'object') return;
    if (d.event === 'onReady' || d.event === 'onStateChange' || d.event === 'infoDelivery'){
      clearTimers();
    }
    if (d.event === 'onError'){
      // errore esplicito → salta subito allo stadio 3
      stage3();
    }
  };
  window.addEventListener('message', onMsg, false);

  // Stadio 1: youtube-nocookie + enablejsapi + origin
  const stage1 = () => {
    frame.src =
      `https://www.youtube-nocookie.com/embed/${ytId}` +
      `?autoplay=1&rel=0&modestbranding=1&playsinline=1` +
      `&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.setAttribute("allowfullscreen", "");
  };

  // Stadio 2: passa a youtube.com/embed (alcuni creator bloccano nocookie)
  const stage2 = () => {
    frame.src =
      `https://www.youtube.com/embed/${ytId}` +
      `?autoplay=1&rel=0&modestbranding=1&playsinline=1` +
      `&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  };

  // Stadio 3: fallback hard, nuova scheda
  const stage3 = () => {
    clearTimers();
    window.removeEventListener('message', onMsg, false);
    window.__closeVideo();
    window.open(`https://www.youtube.com/watch?v=${ytId}`, '_blank', 'noopener');
  };

  // Armo i timer
  fb1 = setTimeout(()=> { stage2(); fb2 = setTimeout(stage3, 1500); }, 1500);

  // Avvio
  stage1();
};

window.__closeVideo = function(){
  const modal = $('#video-modal');
  const frame = $('#yt-frame');
  clearTimers();
  if (frame) frame.src = 'about:blank';
  if (modal) modal.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('no-scroll');
};

// chiusure rapide
document.addEventListener('click', e=>{
  if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')){
    e.preventDefault();
    window.__closeVideo();
  }
});
document.addEventListener('keydown', e=>{
  if (e.key === 'Escape') window.__closeVideo();
});

/* ============ Boot ============ */
(async function init(){
  try{
    const ver = $('#app-version');
    if (ver) ver.textContent = APP_VERSION;

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
