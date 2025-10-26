/* app.v16.js — filtro chip “veloce” fix + “Suggerisci ricette” funzionante + video modale robusto */

/* ------------------ Utils & stato ------------------ */
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s));

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev';
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`;

const STATE = {
  recipes: [],
  filtered: [],
  selectedTags: new Set(),     // es: {"veloce","primo"}
  onlyFav: false,
  search: '',
  sort: 'relevance'
};

// normalizza stringhe (accents insensitive)
const norm = s => String(s||'')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().trim();

/* ------------------ Data fetch ------------------ */
async function fetchRecipes(){
  const res = await fetch(DATA_URL, {cache:'no-store'});
  if(!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/* ------------------ Render cards ------------------ */
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

function renderRecipes(list){
  const host = $('#recipes');
  if(!host) return;
  if(!Array.isArray(list) || !list.length){
    host.innerHTML = `<p class="muted">Nessuna ricetta trovata.</p>`;
    return;
  }

  host.innerHTML = list.map(r=>{
    const img = r.image || 'assets/icons/icon-512.png';
    const tags = Array.isArray(r.tags) ? r.tags : [];
    const tagsHtml = tags.map(t=>`<span class="tag">${t}</span>`).join(' ');
    const yid = getYouTubeId(r);
    const btnVideo = yid
      ? `<button class="btn btn-video" data-youtube-id="${yid}" aria-label="Guarda video ${r.title}">Guarda video</button>`
      : `<button class="btn btn-video" disabled title="Video non disponibile">Guarda video</button>`;
    const btnSrc = r.url ? `<a class="btn btn-ghost" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>` : '';

    return `
      <article class="recipe-card">
        <img class="thumb" src="${img}" alt="${r.title||''}" loading="lazy" />
        <div class="body">
          <h3>${r.title||'Senza titolo'}</h3>
          <p class="meta">
            ${r.time ? `${r.time} min` : ''}${r.servings ? ` · ${r.servings} porz.` : ''} 
          </p>
          <p class="tags">${tagsHtml}</p>
          <div class="actions">
            ${btnSrc}
            ${btnVideo}
          </div>
        </div>
      </article>
    `;
  }).join('');

  bindVideoButtons(); // ogni render ricollega i bottoni video
}

/* ------------------ Filtri (chip, search, preferiti) ------------------ */
function applyFilters(){
  const q = norm(STATE.search);
  const needTags = [...STATE.selectedTags].filter(t => t !== 'tutti');

  let out = STATE.recipes;

  // filtro chip per tag (tutti i tag selezionati devono essere presenti)
  if(needTags.length){
    out = out.filter(r=>{
      const tags = (r.tags||[]).map(norm);
      // ogni tag richiesto deve comparire tra i tags della ricetta
      return needTags.every(t => tags.includes(norm(t)));
    });
  }

  // filtro preferiti (se lo usi in futuro: qui andrebbe la tua logica “isFav”)
  if(STATE.onlyFav){
    out = out.filter(r => r.isFav); // placeholder: adatta alla tua logica
  }

  // filtro testo
  if(q){
    out = out.filter(r=>{
      const hay = [
        r.title,
        ...(r.tags||[]),
        ...(r.ingredients||[]).map(i=>i.ref)
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  STATE.filtered = out;
  renderRecipes(out);
}

function setupChips(){
  const bar = $('#chipbar');
  if(!bar) return;
  bar.addEventListener('click', (e)=>{
    const chip = e.target.closest('.chip');
    if(!chip) return;
    const tag = chip.dataset.tag || '';
    if(!tag) return;

    if(tag === 'tutti'){
      // “tutti” deseleziona tutto
      STATE.selectedTags.clear();
      $$('.chip', bar).forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
    } else {
      // togli “tutti” se presente e alterna il tag cliccato
      const all = $('.chip[data-tag="tutti"]', bar);
      if(all) all.classList.remove('active');

      chip.classList.toggle('active');
      if(chip.classList.contains('active')) STATE.selectedTags.add(tag);
      else STATE.selectedTags.delete(tag);
    }
    applyFilters();
  });
}

function setupSearch(){
  const inp = $('#search');
  if(!inp) return;
  inp.addEventListener('input', ()=>{
    STATE.search = inp.value || '';
    applyFilters();
  });
}

function setupOnlyFav(){
  const sw = $('#only-fav');
  if(!sw) return;
  sw.addEventListener('change', ()=>{
    STATE.onlyFav = !!sw.checked;
    applyFilters();
  });
}

/* ------------------ Generatore “Suggerisci ricette” ------------------ */
function normalizeWords(str){
  return norm(str)
    .split(/[^a-z0-9]+/i)
    .map(s=>s.trim())
    .filter(Boolean);
}

/**
 * Semplice ranking: punteggio in base all’overlap tra parole utente e “ref” ingredienti.
 * Ritorna le migliori N (default 6)
 */
function suggestRecipes(userText, N=6){
  const words = new Set(normalizeWords(userText));
  if(!words.size) return [];

  const scored = STATE.recipes.map(r=>{
    const refs = new Set((r.ingredients||[]).map(i=>norm(i.ref)));
    let score = 0;
    words.forEach(w => { if(refs.has(w)) score++; });
    return {r, score};
  });

  scored.sort((a,b)=> b.score - a.score || norm(a.r.title).localeCompare(norm(b.r.title)));
  return scored.filter(x=>x.score>0).slice(0,N).map(x=>x.r);
}

function setupSuggest(){
  const btn = $('#btn-suggest');
  const ta  = $('#ai-ingredients');
  if(!btn || !ta) return;

  btn.addEventListener('click', ()=>{
    const txt = ta.value || '';
    const hits = suggestRecipes(txt, 6);
    if(!hits.length){
      alert('Non ho trovato ricette per questi ingredienti. Prova con termini più semplici (es. "pasta, aglio, olio").');
      return;
    }
    // Mostro i suggerimenti in cima e scrollo alla lista
    renderRecipes(hits);
    $('#recipes')?.scrollIntoView({behavior:'smooth', block:'start'});
  });
}

/* ------------------ Video modale (con fallback) ------------------ */
let __videoInited = false;

function bindVideoButtons(){
  // evita doppio binding
  if(!__videoInited){
    document.addEventListener('click', onGlobalClick, true);
    __videoInited = true;
  }
}

function onGlobalClick(e){
  const btn = e.target.closest('.btn-video');
  if(!btn) return;

  e.preventDefault();
  const id = btn.dataset.youtubeId || '';
  if(!id) return;

  openVideoById(id);
}

function openVideoById(id){
  const modal = $('#video-modal');
  const frame = $('#yt-frame');
  if(!modal || !frame){
    window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener');
    return;
  }

  // ripulisci e prepara
  frame.src = 'about:blank';
  modal.classList.add('show');
  modal.style.display = 'flex';
  document.body.classList.add('no-scroll');

  // errore 153 può capitare su certe reti/user agent.
  // Impostiamo origin + timeout fallback nuova scheda.
  const url = 'https://www.youtube-nocookie.com/embed/'+id
    + '?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin='
    + encodeURIComponent(location.origin);

  let loaded = false;
  const to = setTimeout(()=>{
    if(!loaded){
      closeVideo();
      window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener');
    }
  }, 2000);

  frame.onload = ()=>{ loaded = true; clearTimeout(to); };
  frame.onerror= ()=>{ clearTimeout(to); closeVideo(); window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener'); };
  frame.src = url;
}

function closeVideo(){
  const modal = $('#video-modal');
  const frame = $('#yt-frame');
  if(!modal) return;
  if(frame) frame.src = 'about:blank';
  modal.classList.remove('show');
  modal.style.display = 'none';
  document.body.classList.remove('no-scroll');
}

function setupModalClose(){
  document.addEventListener('click', (e)=>{
    if(e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')){
      e.preventDefault();
      closeVideo();
    }
  });
  window.addEventListener('keydown', (e)=>{ if(e.key==='Escape') closeVideo(); });
}

/* ------------------ Boot ------------------ */
(async function init(){
  try{
    const verEl = $('#app-version');
    if(verEl) verEl.textContent = `v${APP_VERSION}`;

    STATE.recipes = await fetchRecipes();
    STATE.filtered = STATE.recipes.slice();

    // UI wiring
    setupChips();
    setupSearch();
    setupOnlyFav();
    setupSuggest();
    setupModalClose();

    // render iniziale
    applyFilters();

  }catch(err){
    console.error(err);
    const host = $('#recipes');
    if(host) host.innerHTML = `<p class="error">Errore nel caricamento dati: ${err.message}</p>`;
  }
})();
