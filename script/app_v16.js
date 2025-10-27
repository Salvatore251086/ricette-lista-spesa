/* app_v16.js — v16.2: Chip auto-build + filtri AND, anti-153 + anti ad-block */

/* Utils e stato */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'v16.2';
const DATA_URL    = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`;

const STATE = {
  recipes: [],
  filtered: [],
  selectedTags: new Set(),   // chip selezionati
  onlyFav: false,
  search: '',
  ytBlocked: false,
  allTags: []                // elenco tag disponibili per chip
};

const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim();

/* Data */
async function fetchRecipes(){
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* YouTube */
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
    setTimeout(()=> finish(true), 800);
  });
}

/* Rileva ad-block contro YouTube */
async function detectYouTubeBlocked(){
  const testFetch = fetch('https://www.youtube.com/generate_204', { mode: 'no-cors' })
    .then(()=>true).catch(()=>false);
  const testImg = new Promise(res=>{
    const i = new Image();
    i.onload = ()=>res(true);
    i.onerror = ()=>res(false);
    i.src = 'https://i.ytimg.com/generate_204';
    setTimeout(()=>res(false), 1200);
  });
  const [okFetch, okImg] = await Promise.allSettled([testFetch, testImg]).then(rs=>rs.map(r=>r.status==='fulfilled' ? r.value : false));
  STATE.ytBlocked = !(okFetch || okImg);
}

/* Chip: build da dataset */
function buildChipbar(){
  const bar = $('#chipbar');
  if (!bar) return;

  // raccogli tutti i tag dalle ricette
  const set = new Set();
  for (const r of STATE.recipes){
    for (const t of (r.tags || [])){
      const v = norm(t);
      if (v) set.add(v);
    }
  }
  // ordina alfabetico
  STATE.allTags = Array.from(set).sort((a,b)=> a.localeCompare(b, 'it'));

  // ricostruisci la barra
  const chips = [
    `<button class="chip ${STATE.selectedTags.size? '' : 'active'}" data-tag="tutti" type="button" name="chip_all">Tutti</button>`,
    ...STATE.allTags.map(t=>{
      const isOn = STATE.selectedTags.has(t) ? 'active' : '';
      return `<button class="chip ${isOn}" data-tag="${t}" type="button">${t}</button>`;
    })
  ].join('');

  bar.innerHTML = chips;
}

/* Render cards */
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

    let videoEl;
    if (STATE.ytBlocked || !yid){
      const url = yid
        ? `https://www.youtube.com/watch?v=${yid}`
        : `https://www.youtube.com/results?search_query=${encodeURIComponent((r.title||'')+' ricetta')}`;
      videoEl = `<a class="btn btn-video" href="${url}" target="_blank" rel="noopener">Guarda video</a>`;
    } else {
      videoEl = `
        <button type="button"
                class="btn btn-video"
                data-youtube-id="${yid}"
                onclick="window.__openVideo(this.dataset.youtubeId, &quot;${safeTitle}&quot;)"
                aria-label="Guarda video ${safeTitle}">
          Guarda video
        </button>`.trim();
    }

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
            ${videoEl}
          </div>
        </div>
      </article>
    `;
  }).join('');

  host.innerHTML = html;
}

/* Filtri e ricerca */
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
      buildChipbar(); // aggiorna “active”
    } else {
      const all = $('.chip[data-tag="tutti"]', bar);
      if (all) all.classList.remove('active');

      if (STATE.selectedTags.has(tag)) STATE.selectedTags.delete(tag);
      else STATE.selectedTags.add(tag);

      // toggla classe
      chip.classList.toggle('active');
      // se nessun tag selezionato, riattiva “Tutti”
      if (STATE.selectedTags.size === 0) buildChipbar();
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

/* Suggerisci */
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

/* Aggiorna dati */
function setupRefresh(){
  const btn = $('#refresh');
  if (!btn) return;
  btn.addEventListener('click', async ()=>{
    btn.disabled = true;
    btn.textContent = 'Aggiorno…';
    try{
      const data = await fetchRecipes();
      STATE.recipes = data;
      // reset filtri e chip
      STATE.selectedTags.clear();
      buildChipbar();
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

/* Modale video 3 stadi */
let fb1 = null, fb2 = null;
function clearTimers(){ if (fb1){clearTimeout(fb1); fb1=null;} if (fb2){clearTimeout(fb2); fb2=null;} }

window.__openVideo = async function(ytId, title){
  if (STATE.ytBlocked){
    const url = ytId
      ? `https://www.youtube.com/watch?v=${ytId}`
      : `https://www.youtube.com/results?search_query=${encodeURIComponent((title||'')+' ricetta')}`;
    window.open(url, '_blank', 'noopener');
    return;
  }

  const t = (title || 'Ricetta');
  const hasId = typeof ytId === 'string' && ytId.trim().length === 11;
  const modal = $('#video-modal');
  const frame = $('#yt-frame');

  if (!modal || !frame){
    const url = hasId
      ? `https://www.youtube.com/watch?v=${ytId}`
      : `https://www.youtube.com/results?search_query=${encodeURIComponent(t+' ricetta')}`;
    window.open(url, '_blank', 'noopener');
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

  await checkThumbExists(ytId);

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
      stage3();
    }
  };
  window.addEventListener('message', onMsg, false);

  const stage1 = () => {
    frame.src =
      `https://www.youtube-nocookie.com/embed/${ytId}` +
      `?autoplay=1&rel=0&modestbranding=1&playsinline=1` +
      `&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
    frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    frame.setAttribute("allowfullscreen", "");
  };
  const stage2 = () => {
    frame.src =
      `https://www.youtube.com/embed/${ytId}` +
      `?autoplay=1&rel=0&modestbranding=1&playsinline=1` +
      `&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`;
  };
  const stage3 = () => {
    clearTimers();
    window.removeEventListener('message', onMsg, false);
    window.__closeVideo();
    window.open(`https://www.youtube.com/watch?v=${ytId}`, '_blank', 'noopener');
  };

  fb1 = setTimeout(()=> { stage2(); fb2 = setTimeout(stage3, 1500); }, 1500);
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

document.addEventListener('click', e=>{
  if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')){
    e.preventDefault();
    window.__closeVideo();
  }
});
document.addEventListener('keydown', e=>{
  if (e.key === 'Escape') window.__closeVideo();
});

/* Boot */
(async function init(){
  try{
    const ver = $('#app-version');
    if (ver) ver.textContent = APP_VERSION;

    await detectYouTubeBlocked();

    STATE.recipes = await fetchRecipes();
    STATE.filtered = STATE.recipes.slice();

    // CHIPS
    buildChipbar();
    setupChips();

    setupSearch();
    setupOnlyFav();
    setupSuggest();
    setupRefresh();

    applyFilters(); // render iniziale con filtri correnti (Tutti)
  }catch(err){
    console.error(err);
    const host = $('#recipes');
    if (host) host.innerHTML = `<p class="muted">Errore nel caricamento dati: ${err.message}</p>`;
  }
})();
