/* ============================================================
   app_v16.js – UI completa con filtri chips, ricerca, suggeritore,
   refresh dataset e MODALE VIDEO ROBUSTA (doppio host + timeout)
   ============================================================ */

/* ------------------ Utils & Stato ------------------ */
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`;

const STATE = {
  all: [],          // dataset completo
  list: [],         // lista corrente (filtrata/ordinata)
  selectedTags: new Set(),  // es: {"veloce","primo"}
  onlyFav: false,
  search: '',
  sort: 'relevance'
};

const norm = s => String(s || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().trim();

/* ------------------ Fetch dataset ------------------ */
async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ------------------ Helpers ------------------ */
function getYouTubeId(r){
  if(!r) return '';
  if(r.youtubeId) return String(r.youtubeId).trim();
  if(r.ytid)      return String(r.ytid).trim();
  if(r.videoId)   return String(r.videoId).trim();
  if(r.video){
    const m = String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
    if(m) return m[1];
  }
  return '';
}

function formatMeta(r){
  const bits = [];
  if (r.time) bits.push(`${r.time} min`);
  if (r.servings) bits.push(`${r.servings} porz.`);
  return bits.join(' · ');
}

/* ------------------ Render ------------------ */
function renderRecipes(list){
  const host = $('#recipes');
  if(!host) return;

  if(!Array.isArray(list) || !list.length){
    host.innerHTML = `<p class="muted">Nessuna ricetta trovata.</p>`;
    return;
  }

  host.innerHTML = list.map(r=>{
    const img  = r.image || 'assets/icons/icon-512.png';
    const yid  = getYouTubeId(r);
    const tags = Array.isArray(r.tags) ? r.tags : [];

    return `
      <article class="recipe-card">
        <img class="thumb" src="${img}" alt="${r.title||''}" loading="lazy" />
        <div class="body">
          <h3 class="title">${r.title || 'Senza titolo'}</h3>
          <p class="meta">${formatMeta(r)}${tags.length ? ` · ${norm(tags[0])}` : ''}</p>
          <div class="tags">
            ${tags.map(t => `<span class="tag">${t}</span>`).join('')}
          </div>
          <div class="actions">
            ${r.url ? `<a class="btn btn-ghost" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>` : ''}
            ${
              yid
              ? `<button class="btn btn-video" data-youtube-id="${yid}">Guarda video</button>`
              : `<button class="btn btn-video" disabled title="Video non disponibile">Guarda video</button>`
            }
          </div>
        </div>
      </article>
    `;
  }).join('');

  // assicura i listener video
  if (window.bindVideoButtons) window.bindVideoButtons();
}

/* ------------------ Filtri + Ordinamento ------------------ */
function applyFilters(){
  let out = STATE.all.slice();

  // chips (AND di tutti i tag selezionati)
  const need = [...STATE.selectedTags].map(norm).filter(t => t !== 'tutti');
  if(need.length){
    out = out.filter(r => {
      const bag = new Set((r.tags || []).map(norm));
      for (const t of need) if (!bag.has(t)) return false;
      return true;
    });
  }

  // preferiti (placeholder)
  if (STATE.onlyFav) out = out.filter(r => r.favorite);

  // ricerca
  const q = norm(STATE.search);
  if (q){
    out = out.filter(r => {
      const hay = [
        r.title,
        ...(r.tags || []),
        ...(r.ingredients || []).map(i => i.ref || i.name || i.ingredient)
      ].filter(Boolean).map(norm).join(' ');
      return hay.includes(q);
    });
  }

  // sort
  switch (STATE.sort) {
    case 'title':
      out.sort((a,b) => norm(a.title).localeCompare(norm(b.title)));
      break;
    case 'time':
      out.sort((a,b) => (a.time||1e9) - (b.time||1e9));
      break;
    case 'relevance':
    default:
      // niente: “come arrivano”
      break;
  }

  STATE.list = out;
  renderRecipes(out);
}

/* ------------------ UI Wiring ------------------ */
function setupChips(){
  const bar = $('#chipbar');
  if(!bar) return;

  bar.addEventListener('click', (e)=>{
    const chip = e.target.closest('.chip');
    if(!chip) return;

    const tag = chip.dataset.tag || '';
    if(!tag) return;

    if (tag === 'tutti') {
      STATE.selectedTags.clear();
      $$('.chip', bar).forEach(c => c.classList.remove('active'));
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
  if(!el) return;
  el.addEventListener('input', ()=>{
    STATE.search = el.value || '';
    applyFilters();
  });
}

function setupFav(){
  const el = $('#only-fav');
  if(!el) return;
  el.addEventListener('change', ()=>{
    STATE.onlyFav = !!el.checked;
    applyFilters();
  });
}

function setupSort(){
  const el = $('#sort');
  if(!el) return;
  el.addEventListener('change', ()=>{
    STATE.sort = el.value || 'relevance';
    applyFilters();
  });
}

function setupRefresh(){
  const btn = $('#refresh');
  if(!btn) return;
  btn.addEventListener('click', async ()=>{
    btn.disabled = true; const txt = btn.textContent; btn.textContent = 'Aggiorno…';
    try{
      const data = await fetchRecipes();
      STATE.all = Array.isArray(data) ? data : [];
      applyFilters();
    }catch(err){
      alert('Errore aggiornamento: ' + err.message);
    }finally{
      btn.disabled = false; btn.textContent = txt;
    }
  });
}

/* ------------------ Suggeritore ------------------ */
function normalizeWords(str){
  return norm(str).split(/[^a-z0-9]+/).filter(Boolean);
}

function suggestRecipes(userText, N=6){
  const words = new Set(normalizeWords(userText));
  if(!words.size) return [];

  const scored = STATE.all.map(r=>{
    const refs = new Set((r.ingredients || []).map(i => norm(i.ref || i.name || i.ingredient)));
    let score = 0;
    words.forEach(w => { if (refs.has(w)) score++; });
    return { r, score };
  });

  scored.sort((a,b)=> b.score - a.score || norm(a.r.title).localeCompare(norm(b.r.title)));
  return scored.filter(x => x.score > 0).slice(0, N).map(x => x.r);
}

function setupSuggest(){
  const ta  = $('#ingredients-input');
  const btn = $('#btn-suggest');
  if(!ta || !btn) return;

  const run = ()=>{
    const txt = ta.value || '';
    const hits = suggestRecipes(txt, 6);
    if (!hits.length){
      alert('Nessuna ricetta trovata con questi ingredienti. Prova parole semplici (es: "pasta, aglio, olio").');
      return;
    }
    renderRecipes(hits);
    $('#recipes')?.scrollIntoView({behavior:'smooth', block:'start'});
  };

  btn.addEventListener('click', run);
  ta.addEventListener('keydown', (e)=>{
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
  });
}

/* ------------------ Modale Video ROBUSTA ------------------ */
(() => {
  let wired = false;
  let inFlight = false;

  function buildUrl(host, id) {
    const p = new URLSearchParams({
      autoplay:'1', rel:'0', modestbranding:'1', playsinline:'1',
      enablejsapi:'1', origin: location.origin
    });
    return `https://${host}/embed/${id}?${p.toString()}`;
  }

  function ensureAttrs(frame){
    frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    frame.setAttribute('allowfullscreen', '');
    frame.setAttribute('referrerpolicy', 'origin-when-cross-origin');
  }

  function showModal(){
    const m = $('#video-modal'); if(!m) return false;
    m.classList.add('show'); m.style.display='flex';
    document.body.classList.add('no-scroll'); return true;
  }
  function hideModal(){
    const m = $('#video-modal'); const f = $('#yt-frame');
    if (f) f.src = 'about:blank';
    if (m){ m.classList.remove('show'); m.style.display='none'; }
    document.body.classList.remove('no-scroll'); inFlight = false;
  }
  function openTab(id){
    window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
  }

  function tryIntoFrame(url, frame, timeout=1600){
    return new Promise(res=>{
      let done = false;
      const ok = ()=>{ if(!done){ done=true; cleanup(); res(true);} };
      const ko = ()=>{ if(!done){ done=true; cleanup(); res(false);} };
      const cleanup = ()=>{
        frame.removeEventListener('load', ok);
        frame.removeEventListener('error', ko);
        clearTimeout(tid);
      };
      frame.addEventListener('load', ok, {once:true});
      frame.addEventListener('error', ko, {once:true});
      const tid = setTimeout(ko, timeout);
      frame.src = url;
    });
  }

  async function openVideoById(id){
    if (inFlight) return;
    inFlight = true;

    const modal = $('#video-modal');
    const frame = $('#yt-frame');

    if (!modal || !frame) { inFlight=false; return openTab(id); }
    ensureAttrs(frame); frame.src = 'about:blank';

    if (!showModal()) { inFlight=false; return openTab(id); }

    const hosts = ['www.youtube-nocookie.com', 'www.youtube.com'];
    for (const h of hosts){
      const ok = await tryIntoFrame(buildUrl(h, id), frame);
      if (ok){ inFlight=false; return; }
      frame.src = 'about:blank';
      await new Promise(r=>setTimeout(r,120));
    }
    hideModal(); openTab(id); inFlight=false;
  }

  function bind(){
    if (wired) return; wired = true;

    // bottoni video
    document.addEventListener('click', (e)=>{
      const btn = e.target.closest('.btn-video');
      if (!btn) return;
      const id = btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';
      if (!id) return;
      e.preventDefault();
      openVideoById(id);
    }, true);

    // chiusura
    document.addEventListener('click', (e)=>{
      if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')){
        e.preventDefault(); hideModal();
      }
    });
    window.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') hideModal(); });
  }

  window.openVideoById = openVideoById;
  window.bindVideoButtons = bind;

  if (document.readyState !== 'loading') bind();
  else document.addEventListener('DOMContentLoaded', bind);
})();

/* ------------------ Boot ------------------ */
(async function init(){
  try{
    const ver = $('#app-version'); if (ver) ver.textContent = `v${APP_VERSION}`;

    STATE.all = await fetchRecipes();
    STATE.list = STATE.all.slice();

    setupChips();
    setupSearch();
    setupFav();
    setupSort();
    setupRefresh();
    setupSuggest();

    renderRecipes(STATE.list);
  }catch(err){
    console.error(err);
    const host = $('#recipes');
    if (host) host.innerHTML = `<p class="error">Errore nel caricamento dati: ${err.message}</p>`;
  }
})();
