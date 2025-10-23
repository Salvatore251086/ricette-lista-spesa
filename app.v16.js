/* App v16: robusta, niente riferimenti sbagliati, nessun addEventListener su null */

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const els = {
  year: $('#year'),
  tabs: { ricette: $('#tabRicette'), gen: $('#tabGeneratore'), lista: $('#tabLista') },
  sections: { ricette: $('#ricetteSec'), gen: $('#genSec'), lista: $('#listaSec') },
  q: $('#q'),
  time: $('#filterTime'),
  diet: $('#filterDiet'),
  reset: $('#btnReset'),
  onlyFav: $('#btnFav'),
  grid: $('#recipesGrid'),
  empty: $('#empty'),
  more: $('#btnLoadMore'),
  cookieBar: $('#cookieBar'),
  cookieAccept: $('#cookieAccept'),
  cookieDecline: $('#cookieDecline'),
};

// stato app
const state = {
  recipes: [],
  filtered: [],
  page: 0,
  pageSize: 12,
  onlyFav: false,
  favs: new Set(JSON.parse(localStorage.getItem('favs') || '[]'))
};

// util
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const inFav = (id) => state.favs.has(id);
const toggleFav = (id) => {
  if (state.favs.has(id)) state.favs.delete(id); else state.favs.add(id);
  localStorage.setItem('favs', JSON.stringify([...state.favs]));
};

// bootstrap UI safe-guard
function safeBind(el, ev, fn){ if(el) el.addEventListener(ev, fn, {passive:true}); }

// render card
function card(r){
  const fav = inFav(r.id);
  const tags = (r.tags||[]).map(t=>`<span class="badge">${t}</span>`).join('');
  const img = r.image || 'assets/icons/icon-512.png';
  return `
  <article class="card recipe" data-id="${r.id}">
    <img alt="${r.title}" src="${img}">
    <h3 style="margin:4px 0 0">${r.title}</h3>
    <p class="muted" style="margin:0">${r.time? r.time+' min · ': ''}${r.servings? r.servings+' porzioni' : ''}</p>
    <div class="badges">${tags}</div>
    <div class="row">
      <button class="btn btn-sm" data-action="open">Apri ricetta</button>
      <button class="btn btn-ghost btn-sm" data-action="video"${r.video? '' : ' disabled'}>Guarda video</button>
      <button class="chip" data-action="fav" aria-pressed="${fav?'true':'false'}">${fav? 'Preferito' : 'Aggiungi preferito'}</button>
    </div>
  </article>`;
}

// mount cards paginated
function render(reset=false){
  if(reset){ els.grid.innerHTML=''; state.page=0; }
  const slice = state.filtered.slice(0,(state.page+1)*state.pageSize);
  els.grid.insertAdjacentHTML('beforeend', slice.slice(els.grid.childElementCount).map(card).join(''));
  els.empty.classList.toggle('hidden', slice.length>0);
  const hasMore = slice.length < state.filtered.length;
  els.more.classList.toggle('hidden', !hasMore);
}

// open handlers via delegation
function onGridClick(e){
  const btn = e.target.closest('button[data-action]');
  if(!btn) return;
  const art = e.target.closest('article[data-id]');
  if(!art) return;
  const id = art.dataset.id;
  const r = state.filtered.find(x=>x.id===id) || state.recipes.find(x=>x.id===id);
  if(!r) return;
  const action = btn.dataset.action;

  if(action==='open' && r.url){
    window.open(r.url,'_blank','noopener');
  }
  if(action==='video' && r.video){
    window.open(r.video,'_blank','noopener');
  }
  if(action==='fav'){
    toggleFav(id);
    btn.setAttribute('aria-pressed', inFav(id)?'true':'false');
    btn.textContent = inFav(id)? 'Preferito' : 'Aggiungi preferito';
    if(state.onlyFav){ applyFilters(true); }
  }
}

function applyFilters(keepPage=false){
  const q = (els.q?.value || '').toLowerCase().trim();
  const t = parseInt(els.time?.value || '') || null;
  const d = els.diet?.value || '';
  const onlyFav = state.onlyFav;

  let arr = state.recipes.slice();
  if(q){
    arr = arr.filter(r=>{
      const hay = `${r.title} ${(r.tags||[]).join(' ')} ${(r.ingredients||[]).map(i=>i.ref).join(' ')}`.toLowerCase();
      return hay.includes(q);
    });
  }
  if(t){ arr = arr.filter(r => (r.time||999) <= t); }
  if(d){ arr = arr.filter(r => (r.tags||[]).includes(d)); }
  if(onlyFav){ arr = arr.filter(r => inFav(r.id)); }

  state.filtered = arr;
  render(!keepPage);
}

// data loading
async function fetchJsonSafe(url){
  try{
    const res = await fetch(url, {cache:'no-store'});
    if(!res.ok) return null;
    const ct = res.headers.get('content-type') || '';
    if(!ct.includes('application/json') && !url.endsWith('.json')) return null;
    return await res.json();
  }catch{ return null; }
}

function normalizeList(list){
  // garantiamo campi minimi
  return (list||[]).map((r,i)=>({
    id: r.id || `rid-${i}-${(r.title||'').toLowerCase().replace(/\W+/g,'-').slice(0,50)}`,
    title: r.title || 'Ricetta',
    time: r.time ?? null,
    servings: r.servings ?? null,
    tags: r.tags || [],
    image: r.image || 'assets/icons/icon-512.png',
    ingredients: r.ingredients || [],
    steps: r.steps || [],
    url: r.url || '',
    video: r.video || ''
  }));
}

async function loadData(){
  // 1) base locale
  const base = await fetchJsonSafe('assets/json/recipes-it.json') || [];
  // 2) merge opzionale con import
  const imported = await fetchJsonSafe('import/recipes.json') || [];
  const map = new Map();
  normalizeList(base).forEach(r=>map.set(r.id,r));
  normalizeList(imported).forEach(r=>map.set(r.id,r)); // override se stesso id
  state.recipes = Array.from(map.values());
  state.filtered = state.recipes.slice();
  render(true);
}

function bindFilters(){
  safeBind(els.grid,'click',onGridClick);
  safeBind(els.more,'click',()=>{ state.page++; render(); });
  safeBind(els.q,'input',()=>applyFilters());
  safeBind(els.time,'change',()=>applyFilters());
  safeBind(els.diet,'change',()=>applyFilters());
  safeBind(els.reset,'click',()=>{
    if(els.q) els.q.value='';
    if(els.time) els.time.value='';
    if(els.diet) els.diet.value='';
    state.onlyFav=false; els.onlyFav?.setAttribute('aria-pressed','false');
    applyFilters();
  });
  safeBind(els.onlyFav,'click',()=>{
    state.onlyFav = !(els.onlyFav.getAttribute('aria-pressed')==='true');
    els.onlyFav.setAttribute('aria-pressed', state.onlyFav?'true':'false');
    applyFilters();
  });
}

function bindTabs(){
  const setTab=(name)=>{
    const on = (k)=>k===name;
    els.sections.ricette.classList.toggle('hidden', !on('ricette'));
    els.sections.gen.classList.toggle('hidden', !on('gen'));
    els.sections.lista.classList.toggle('hidden', !on('lista'));
    els.tabs.ricette?.setAttribute('aria-pressed', on('ricette'));
    els.tabs.gen?.setAttribute('aria-pressed', on('gen'));
    els.tabs.lista?.setAttribute('aria-pressed', on('lista'));
  };
  safeBind(els.tabs.ricette,'click',()=>setTab('ricette'));
  safeBind(els.tabs.gen,'click',()=>setTab('gen'));
  safeBind(els.tabs.lista,'click',()=>setTab('lista'));
}

function cookies(){
  const k='rx_cookies_ok';
  const ok = localStorage.getItem(k);
  if(!ok && els.cookieBar){ els.cookieBar.classList.remove('hidden'); }
  safeBind(els.cookieAccept,'click',()=>{ localStorage.setItem(k,'1'); els.cookieBar?.classList.add('hidden'); });
  safeBind(els.cookieDecline,'click',()=>{ els.cookieBar?.classList.add('hidden'); });
}

async function bootstrap(){
  if(els.year) els.year.textContent = new Date().getFullYear();
  bindFilters(); bindTabs(); cookies();
  await loadData();
}
document.addEventListener('DOMContentLoaded', bootstrap);
