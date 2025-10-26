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
/* ===== HOTFIX: CHIP FILTER + SUGGERITORE ROBUSTI ===== */
(function(){
  if (window.__fixChipsSuggest) return;
  window.__fixChipsSuggest = true;

  const norm = s => String(s||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .toLowerCase().trim();

  // Stato minimo, se non c'è
  window.STATE = window.STATE || { selectedTags:new Set(), recipes:[], filtered:[], search:'', onlyFav:false };

  function ensureChipDataset(el){
    if (!el.dataset.tag) {
      const txt = norm(el.textContent);
      el.dataset.tag = txt || 'tutti';
    }
  }

  // Delegato: funziona su TUTTE le .chip presenti o future
  document.addEventListener('click', (e)=>{
    const chip = e.target.closest('.chip');
    if (!chip) return;

    ensureChipDataset(chip);
    const tag = chip.dataset.tag;

    if (tag === 'tutti') {
      STATE.selectedTags.clear();
      document.querySelectorAll('.chip').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
    } else {
      const all = document.querySelector('.chip[data-tag="tutti"]');
      if (all) all.classList.remove('active');

      chip.classList.toggle('active');
      if (chip.classList.contains('active')) STATE.selectedTags.add(tag);
      else STATE.selectedTags.delete(tag);
    }

    console.log('[chip]', tag, '→ selected:', [...STATE.selectedTags]);
    if (typeof applyFilters === 'function') applyFilters();
  }, true);

  // ---------- Suggeritore ----------
  function normalizeWords(str){
    return norm(str).split(/[^a-z0-9]+/).filter(Boolean);
  }

  function suggestRecipes(userText, N=6){
    const words = new Set(normalizeWords(userText));
    if (!words.size) return [];

    const scored = (STATE.recipes||[]).map(r=>{
      const refs = new Set((r.ingredients||[]).map(i => norm(i.ref || i.name || i.ingredient)));
      let score = 0;
      words.forEach(w => { if (refs.has(w)) score++; });
      return { r, score };
    });

    scored.sort((a,b)=> b.score - a.score || norm(a.r.title).localeCompare(norm(b.r.title)));
    return scored.filter(x=>x.score>0).slice(0, N).map(x=>x.r);
  }

  function wireSuggest(){
    // prova id standard, poi fallback per testo/placeholder
    const textarea =
      document.querySelector('#ai-ingredients') ||
      document.querySelector('textarea[placeholder*="ingredient"]') ||
      document.querySelector('textarea');

    const btn =
      document.querySelector('#btn-suggest') ||
      Array.from(document.querySelectorAll('button')).find(b => /suggerisc/i.test(b.textContent));

    if (!textarea || !btn) {
      console.warn('[suggest] UI non trovata', {textarea: !!textarea, btn: !!btn});
      return;
    }

    btn.addEventListener('click', ()=>{
      const txt = textarea.value || '';
      const hits = suggestRecipes(txt, 6);
      console.log('[suggest] parole:', txt, '→ risultati:', hits.map(r=>r.title));
      if (!hits.length) {
        alert('Nessuna ricetta trovata con questi ingredienti. Prova parole semplici (es. "pasta, aglio, olio").');
        return;
      }
      if (typeof renderRecipes === 'function') renderRecipes(hits);
      document.getElementById('recipes')?.scrollIntoView({behavior:'smooth', block:'start'});
    });

    // scorciatoia: Ctrl/Cmd+Invio
    textarea.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        btn.click();
      }
    });
  }

  if (document.readyState !== 'loading') wireSuggest();
  else document.addEventListener('DOMContentLoaded', wireSuggest);
})();
/* ====== PATCH UNIVERSALE: CHIPS + FILTRI + SUGGERITORE ====== */
(function(){
  if (window.__universalPatch) return;
  window.__universalPatch = true;

  // Stato minimo
  window.STATE = window.STATE || {};
  STATE.selectedTags = STATE.selectedTags || new Set();
  STATE.search = STATE.search || '';
  STATE.onlyFav = !!STATE.onlyFav;

  const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  // 1) Hook a renderRecipes per catturare la lista completa
  if (typeof window.renderRecipes === 'function' && !window.__renderHooked) {
    window.__renderHooked = true;
    const ORIG_RENDER = window.renderRecipes;
    window.renderRecipes = function(list){
      if (Array.isArray(list) && list.length && !Array.isArray(STATE.all) ) {
        // Prima volta che vediamo una lista “vera” → salvala
        STATE.all = list.slice();
        STATE.recipes = list.slice();
        console.log('[patch] lista completa catturata:', STATE.all.length);
      }
      return ORIG_RENDER.apply(this, arguments);
    };
  }

  // 2) Implementa applyFilters se assente
  if (typeof window.applyFilters !== 'function') {
    window.applyFilters = function(){
      const all = Array.isArray(STATE.all) ? STATE.all : STATE.recipes || [];
      if (!all.length || typeof window.renderRecipes !== 'function') return;

      const sel = [...(STATE.selectedTags||[])].map(norm);
      const q = norm(STATE.search||'');

      let out = all.filter(r=>{
        // filtro per tag (tutti i tag selezionati devono essere inclusi)
        if (sel.length){
          const rt = new Set((r.tags||[]).map(norm));
          for (const t of sel) if (!rt.has(t)) return false;
        }
        // filtro testo semplice su titolo+tags+ingredienti
        if (q){
          const hay = [
            r.title,
            ...(r.tags||[]),
            ...(r.ingredients||[]).map(i => i.ref || i.name || i.ingredient)
          ].filter(Boolean).map(norm).join(' ');
          if (!hay.includes(q)) return false;
        }
        // preferiti opzionale (se lo usi)
        if (STATE.onlyFav && !r.favorite) return false;
        return true;
      });

      STATE.filtered = out;
      console.log('[patch] applyFilters →', out.length, 'ricette');
      window.renderRecipes(out);
    };
  }

  // 3) CHIPS universali (funziona anche senza data-tag)
  function ensureChipDataset(el){
    if (!el.dataset.tag){
      const txt = norm(el.textContent);
      el.dataset.tag = txt || 'tutti';
    }
  }

  // attiva/disattiva UI e stato
  function toggleChip(chip){
    ensureChipDataset(chip);
    const tag = chip.dataset.tag;
    const isAll = tag === 'tutti';

    if (isAll){
      STATE.selectedTags.clear();
      document.querySelectorAll('.chip,.tag,.badge,[data-tag]').forEach(c=>c.classList.remove('active'));
      chip.classList.add('active');
    } else {
      const allChip = document.querySelector('.chip[data-tag="tutti"], .tag[data-tag="tutti"], .badge[data-tag="tutti"], [data-tag="tutti"]');
      if (allChip) allChip.classList.remove('active');
      chip.classList.toggle('active');
      if (chip.classList.contains('active')) STATE.selectedTags.add(tag);
      else STATE.selectedTags.delete(tag);
    }
    console.log('[chip]', tag, '→', [...STATE.selectedTags]);
    window.applyFilters();
  }

  // delegato: prende .chip .tag .badge o qualsiasi con data-tag
  document.addEventListener('click', (e)=>{
    const chip = e.target.closest('.chip, .tag, .badge, [data-tag]');
    if (!chip) return;

    // Limita ai chip del filtro in alto, ignorando i tag delle card
    // (se i tag delle card hanno un wrapper diverso, puoi restringere qui)
    const inHeader = chip.closest('#chips, .chips, .filters, header, .chip-bar, .filter-chips');
    if (!inHeader) return;

    toggleChip(chip);
  }, true);

  // 4) Search textbox (se presente) → aggiorna STATE.search e filtra
  const searchBox =
    document.querySelector('#search') ||
    document.querySelector('input[type="search"]') ||
    document.querySelector('input[placeholder*="ingredienti"]');

  if (searchBox){
    searchBox.addEventListener('input', ()=>{
      STATE.search = searchBox.value || '';
      window.applyFilters();
    });
  }

  // 5) Bottone “solo preferiti” (se presente)
  const favToggle =
    document.querySelector('#only-fav') ||
    document.querySelector('input[type="checkbox"][name*="pref"]');

  if (favToggle){
    favToggle.addEventListener('change', ()=>{
      STATE.onlyFav = !!favToggle.checked;
      window.applyFilters();
    });
  }

  // 6) SUGGERITORE robusto (textarea + bottone)
  function normalizeWords(str){
    return norm(str).split(/[^a-z0-9]+/).filter(Boolean);
  }
  function suggestRecipes(userText, N=6){
    const words = new Set(normalizeWords(userText));
    if (!words.size) return [];
    const base = Array.isArray(STATE.all) ? STATE.all : STATE.recipes || [];

    const scored = base.map(r=>{
      const refs = new Set((r.ingredients||[]).map(i => norm(i.ref || i.name || i.ingredient)));
      let score = 0;
      words.forEach(w=>{ if (refs.has(w)) score++; });
      return {r, score};
    });
    scored.sort((a,b)=> b.score - a.score || norm(a.r.title).localeCompare(norm(b.r.title)));
    return scored.filter(x=>x.score>0).slice(0,N).map(x=>x.r);
  }
  function wireSuggest(){
    const textarea =
      document.querySelector('#ai-ingredients') ||
      document.querySelector('textarea[placeholder*="ingredient"]') ||
      document.querySelector('textarea');

    const btn =
      document.querySelector('#btn-suggest') ||
      Array.from(document.querySelectorAll('button')).find(b => /suggerisc/i.test(norm(b.textContent)));

    if (!textarea || !btn) {
      console.warn('[patch] suggeritore: UI non trovata', {textarea: !!textarea, btn: !!btn});
      return;
    }

    const run = ()=>{
      const txt = textarea.value || '';
      const hits = suggestRecipes(txt, 6);
      console.log('[suggest]', txt, '→', hits.map(r=>r.title));
      if (!hits.length) return alert('Nessuna ricetta trovata con questi ingredienti.');
      if (typeof window.renderRecipes === 'function') window.renderRecipes(hits);
      document.getElementById('recipes')?.scrollIntoView({behavior:'smooth'});
    };

    btn.addEventListener('click', run);
    textarea.addEventListener('keydown', (e)=>{
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    });
  }
  if (document.readyState !== 'loading') wireSuggest();
  else document.addEventListener('DOMContentLoaded', wireSuggest);

  // 7) Primo tentativo di filtri appena c'è una lista
  setTimeout(()=>{
    if (Array.isArray(STATE.all) && STATE.all.length) applyFilters();
  }, 1000);
})();
/* ==== FIX CHIP-FILTRI ROBUSTO (niente più click "morti") ==== */
(function(){
  if (window.__chipFixPatched) return;
  window.__chipFixPatched = true;

  // stato minimale
  window.STATE = window.STATE || {};
  STATE.selectedTags = STATE.selectedTags || new Set();

  const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  // set di tag noti (ricavati dalle ricette già caricate)
  function collectKnownTags(){
    const base = Array.isArray(STATE.all) ? STATE.all : STATE.recipes || [];
    const set = new Set();
    base.forEach(r => (r.tags||[]).forEach(t => set.add(norm(t))));
    return set;
  }

  // trova tutti i "chip" cliccabili in alto e assegna data-tag dal testo
  function hydrateHeaderChips(){
    const known = collectKnownTags();
    if (!known.size) return; // prima render non ancora catturata

    // prendi elementi "chip-like" non dentro le card
    const candidates = Array.from(document.querySelectorAll(
      'header *, .filters *, .chip-bar *, .chips *, .filter-chips *, .filters, .chip-bar, .chips, .filter-chips, main > *'
    )).filter(el => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.closest('article.recipe-card')) return false;         // ignora i tag dentro la card
      // button/pill/badge testi brevi probabilmente sono chip
      const txt = norm(el.textContent);
      if (!txt || txt.length > 20) return false;
      // se già ha data-tag, va bene
      if (el.dataset && el.dataset.tag) return true;
      // deduci dal testo: se è un tag noto, lo accettiamo
      return known.has(txt);
    });

    candidates.forEach(el => {
      if (!el.dataset) return;
      if (!el.dataset.tag) el.dataset.tag = norm(el.textContent);
      // dai una classe comoda se non c’è
      el.classList.add('chip');
      // evidenzia "Tutti" se presente
      if (['tutti','tutto','all'].includes(el.dataset.tag) && !document.querySelector('.chip.active')) {
        el.classList.add('active');
      }
    });

    // log diagnostico
    const wired = candidates.map(x => x.dataset?.tag).filter(Boolean);
    console.log('[chip-fix] chip pronti:', wired);
  }

  // applica filtri usando STATE.selectedTags e (se presente) STATE.search/STATE.onlyFav
  function applyFilters(){
    const all = Array.isArray(STATE.all) ? STATE.all : STATE.recipes || [];
    if (!all.length || typeof window.renderRecipes !== 'function') return;

    const sel = [...(STATE.selectedTags||[])].map(norm);
    const q = norm(STATE.search||'');

    const out = all.filter(r=>{
      if (sel.length){
        const rt = new Set((r.tags||[]).map(norm));
        for (const t of sel) if (!rt.has(t)) return false;
      }
      if (q){
        const hay = [
          r.title,
          ...(r.tags||[]),
          ...(r.ingredients||[]).map(i => i.ref || i.name || i.ingredient)
        ].filter(Boolean).map(norm).join(' ');
        if (!hay.includes(q)) return false;
      }
      if (STATE.onlyFav && !r.favorite) return false;
      return true;
    });

    STATE.filtered = out;
    console.log('[chip-fix] applyFilters →', out.length, 'ricette', 'tags=', [...STATE.selectedTags]);
    window.renderRecipes(out);
  }
  // esponi applyFilters se non esiste già
  if (typeof window.applyFilters !== 'function') window.applyFilters = applyFilters;

  // delegato click: prendi QUALSIASI elemento con data-tag/chip, tranne i tag dentro le card
  document.addEventListener('click', (e)=>{
    const el = e.target.closest('[data-tag], .chip, .tag, .badge, .pill, button');
    if (!el) return;
    if (el.closest('article.recipe-card')) return; // ignora tag delle card

    const tag = el.dataset?.tag ? norm(el.dataset.tag) : norm(el.textContent);
    if (!tag) return;

    // gestisci "tutti"
    const isAll = ['tutti','tutto','all'].includes(tag);
    if (isAll){
      STATE.selectedTags.clear();
      document.querySelectorAll('.chip.active,[data-tag].active').forEach(c=>c.classList.remove('active'));
      el.classList.add('active');
    } else {
      // togli stato da eventuale "tutti"
      document.querySelectorAll('[data-tag="tutti"].active,[data-tag="tutto"].active,[data-tag="all"].active')
        .forEach(c=>c.classList.remove('active'));
      // toggle selezione
      el.classList.toggle('active');
      if (el.classList.contains('active')) STATE.selectedTags.add(tag);
      else STATE.selectedTags.delete(tag);
    }
    applyFilters();
  }, true);

  // attiva all’avvio e dopo ogni render
  const tryHydrate = () => {
    try { hydrateHeaderChips(); } catch(_) {}
  };
  if (document.readyState !== 'loading') tryHydrate();
  else document.addEventListener('DOMContentLoaded', tryHydrate);

  // se il tuo renderRecipes rimpiazza il DOM, esegui re-idratazione periodica leggera
  setInterval(tryHydrate, 800);

  // primo tentativo filtri quando catturiamo la lista completa
  const tick = setInterval(()=>{
    if (Array.isArray(STATE.all) && STATE.all.length){
      clearInterval(tick);
      tryHydrate();
      // non filtriamo di default: resta la lista piena finché non si clicca un chip
    }
  }, 300);
})();
/* ===== CHIP FIX: niente doppi click, toggle affidabile ===== */
(() => {
  if (window.__chipFix_v2) return;
  window.__chipFix_v2 = true;

  // Stato condiviso (riusa o crea)
  window.STATE = window.STATE || {};
  STATE.selectedTags = STATE.selectedTags || new Set();

  const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();

  // Raccogli i tag noti dalle ricette caricate
  function collectKnownTags() {
    const list = Array.isArray(STATE.all) ? STATE.all : (STATE.recipes || []);
    const set = new Set();
    list.forEach(r => (r.tags || []).forEach(t => set.add(norm(t))));
    return set;
  }

  // Idrata i chip: assegna data-tag dedotto dal testo SOLO se il testo è un tag noto
  function hydrateChips() {
    const known = collectKnownTags();
    if (!known.size) return;

    // prendi elementi "chip-like" nella barra filtri in alto
    const area = document; // non limitare: meglio essere permissivi
    const candidates = Array.from(area.querySelectorAll('button, .chip, .badge, .pill, .filter-chip'))
      .filter(el => {
        if (!(el instanceof HTMLElement)) return false;
        if (el.closest('article.recipe-card')) return false; // ignora tag dentro le card
        const t = norm(el.dataset?.tag || el.textContent);
        // considera "tutti" come chip speciale
        if (['tutti','tutto','all'].includes(t)) return true;
        return known.has(t);
      });

    candidates.forEach(el => {
      const t = norm(el.dataset?.tag || el.textContent);
      el.dataset.tag = t;
      el.classList.add('chip');
    });
  }

  // Applica i filtri
  function applyFilters() {
    const all = Array.isArray(STATE.all) ? STATE.all : (STATE.recipes || []);
    if (!all.length || typeof window.renderRecipes !== 'function') return;

    const sel = [...(STATE.selectedTags||[])].map(norm);
    const q = norm(STATE.search||'');

    const out = all.filter(r => {
      if (sel.length) {
        const rt = new Set((r.tags||[]).map(norm));
        for (const t of sel) if (!rt.has(t)) return false;
      }
      if (q) {
        const hay = [
          r.title,
          ...(r.tags||[]),
          ...(r.ingredients||[]).map(i => i.ref || i.name || i.ingredient)
        ].filter(Boolean).map(norm).join(' ');
        if (!hay.includes(q)) return false;
      }
      if (STATE.onlyFav && !r.favorite) return false;
      return true;
    });

    STATE.filtered = out;
    window.renderRecipes(out);
  }
  if (typeof window.applyFilters !== 'function') window.applyFilters = applyFilters;

  // --- DELEGATO CLICK CON GUARD (solo bubbling) ---
  const handled = new WeakSet();

  document.addEventListener('click', (e) => {
    // guard: evita doppia elaborazione dello stesso evento
    if (handled.has(e)) return;
    handled.add(e);

    const el = e.target.closest('[data-tag], .chip, .badge, .pill, .filter-chip, button');
    if (!el) return;

    // ignora click su tag dentro le card
    if (el.closest && el.closest('article.recipe-card')) return;

    const tag = norm(el.dataset?.tag || el.textContent);
    if (!tag) return;

    const isAll = ['tutti','tutto','all'].includes(tag);

    // Aggiorna UI (classi) e stato
    if (isAll) {
      STATE.selectedTags.clear();
      document.querySelectorAll('.chip.active,[data-tag].active')
        .forEach(c => c.classList.remove('active'));
      el.classList.add('active');
    } else {
      // togli lo stato da "tutti"
      document.querySelectorAll('[data-tag="tutti"].active,[data-tag="tutto"].active,[data-tag="all"].active')
        .forEach(c => c.classList.remove('active'));

      // toggle
      const active = el.classList.toggle('active');
      if (active) STATE.selectedTags.add(tag);
      else STATE.selectedTags.delete(tag);
    }

    applyFilters();
  }, { capture: false }); // <-- solo bubbling

  // Hydrate una volta pronto il DOM e ad ogni mutazione "grossa"
  const tryHydrate = () => { try { hydrateChips(); } catch(_) {} };
  if (document.readyState !== 'loading') tryHydrate();
  else document.addEventListener('DOMContentLoaded', tryHydrate);

  // re-idrata periodicamente (se il render sostituisce la toolbar)
  const hydrateTimer = setInterval(tryHydrate, 800);

  // appena catturiamo l’elenco completo, log e idrata
  const tick = setInterval(() => {
    const base = Array.isArray(STATE.all) ? STATE.all : (STATE.recipes || []);
    if (base.length) {
      clearInterval(tick);
      console.log('[patch] lista completa catturata:', base.length);
      tryHydrate();
    }
  }, 250);
})();
