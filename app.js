// app.js
const DATA_URL = 'assets/json/recipes-it.json';

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

const ui = {
  grid: qs('#recipesGrid'),
  empty: qs('#empty'),
  q: qs('#q'),
  t: qs('#filterTime'),
  d: qs('#filterDiet'),
  reset: qs('#btnReset'),
  quickTags: qs('#quickTags'),
  genSec: qs('#genSec'),
  ricetteSec: qs('#ricetteSec'),
  listaSec: qs('#listaSec'),
  tabRicette: qs('#tabRicette'),
  tabGeneratore: qs('#tabGeneratore'),
  tabLista: qs('#tabLista'),
  genIngredients: qs('#genIngredients'),
  genDiet: qs('#genDiet'),
  genTime: qs('#genTime'),
  genBtn: qs('#genBtn'),
  genClear: qs('#genClear'),
  genResults: qs('#genResults'),
  year: qs('#year'),
  cookieBar: qs('#cookieBar'),
  cookieAccept: qs('#cookieAccept'),
  cookieDecline: qs('#cookieDecline'),
  listItems: qs('#listItems'),
  listInput: qs('#listInput'),
  listAdd: qs('#listAdd'),
  listClear: qs('#listClear'),
};

let ALL = [];
let TAGS = [];
let LIST = loadList();

ui.year.textContent = new Date().getFullYear();

initTabs();
initFilters();
initGenerator();
initList();
initCookies();
loadData();

/* Data */
async function loadData(){
  try {
    const res = await fetch(DATA_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    ALL = Array.isArray(json) ? json : (json.recipes || []);
    renderTags();
    render();
  } catch (e){
    ui.grid.innerHTML = cardError('Errore caricamento dati', e.message);
    ui.empty.classList.add('hidden');
  }
}

/* Rendering */
function render(){
  const term = ui.q.value.trim().toLowerCase();
  const tmax = parseInt(ui.t.value || '0', 10);
  const diet = ui.d.value;
  const filtered = ALL.filter(r => {
    const byText = !term || r.title.toLowerCase().includes(term) || (r.ingredients||[]).join(',').toLowerCase().includes(term);
    const byTime = !tmax || (toNumber(r.time) <= tmax);
    const byDiet = !diet || (normalize(r.diet) === diet);
    return byText && byTime && byDiet;
  });
  ui.grid.innerHTML = filtered.map(cardRecipe).join('');
  ui.empty.classList.toggle('hidden', filtered.length > 0);
  attachCardHandlers();
}

function renderTags(){
  const set = new Set();
  ALL.forEach(r => (r.tags||[]).forEach(t => set.add(t)));
  TAGS = [...set].slice(0, 20);
  ui.quickTags.innerHTML = TAGS.map(t => `<button class="pill" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  ui.quickTags.addEventListener('click', e => {
    const tag = e.target?.dataset?.tag;
    if (!tag) return;
    ui.q.value = tag;
    render();
  });
}

/* Cards */
function cardRecipe(r){
  const mins = toNumber(r.time);
  const ing = (r.ingredients||[]).slice(0,6).map(escapeHtml).join(', ');
  const tags = (r.tags||[]).slice(0,3).map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(' ');
  return `
    <article class="card" data-id="${escapeHtml(r.id||'')}" data-title="${escapeHtml(r.title)}">
      <h3>${escapeHtml(r.title)}</h3>
      <div class="muted">${mins ? mins + ' min' : 'Tempo n.d.'} · ${escapeHtml(prettyDiet(r.diet))}</div>
      <p class="muted">${ing}</p>
      <div>${tags}</div>
      <div class="toolbar" style="margin-top:10px">
        <button class="btn btn-add">Aggiungi ingredienti alla lista</button>
        ${r.url ? `<a class="btn" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">Apri ricetta</a>` : ``}
      </div>
    </article>
  `;
}

function cardError(title, msg){
  return `
    <article class="card">
      <h3>${escapeHtml(title)}</h3>
      <p class="muted">${escapeHtml(msg)}</p>
    </article>
  `;
}

function attachCardHandlers(){
  qsa('.btn.btn-add').forEach(btn=>{
    btn.onclick = e=>{
      const card = e.target.closest('.card');
      const id = card?.dataset?.id || '';
      const rec = ALL.find(x => (x.id||'')===id) || pickByTitle(card?.dataset?.title||'');
      if (!rec) return;
      const items = (rec.ingredients||[]).map(normalizeItem);
      addToList(items);
      toast('Ingredienti aggiunti alla lista');
    };
  });
}

/* Filters */
function initFilters(){
  ui.q.addEventListener('input', render);
  ui.t.addEventListener('change', render);
  ui.d.addEventListener('change', render);
  ui.reset.addEventListener('click', ()=>{
    ui.q.value = '';
    ui.t.value = '';
    ui.d.value = '';
    render();
  });
}

/* Tabs */
function initTabs(){
  const setTab = (name)=>{
    const map = {
      ricette: ui.ricetteSec,
      generatore: ui.genSec,
      lista: ui.listaSec,
    };
    for (const k in map){
      map[k].classList.toggle('hidden', k!==name);
    }
    ui.tabRicette.setAttribute('aria-pressed', String(name==='ricette'));
    ui.tabGeneratore.setAttribute('aria-pressed', String(name==='generatore'));
    ui.tabLista.setAttribute('aria-pressed', String(name==='lista'));
  };
  ui.tabRicette.onclick = ()=> setTab('ricette');
  ui.tabGeneratore.onclick = ()=> setTab('generatore');
  ui.tabLista.onclick = ()=> setTab('lista');
  setTab('ricette');
}

/* Generatore */
function initGenerator(){
  ui.genBtn.onclick = ()=>{
    const want = splitCSV(ui.genIngredients.value);
    const diet = ui.genDiet.value;
    const tmax = parseInt(ui.genTime.value || '0', 10);
    const out = scoreMatches(ALL, want, diet, tmax).slice(0, 12);
    ui.genResults.innerHTML = out.map(cardRecipe).join('') || cardError('Nessuna proposta', 'Prova con ingredienti diversi');
    attachCardHandlers();
  };
  ui.genClear.onclick = ()=>{
    ui.genIngredients.value = '';
    ui.genDiet.value = '';
    ui.genTime.value = '';
    ui.genResults.innerHTML = '';
  };
}

/* Scoring */
function scoreMatches(list, want, diet, tmax){
  const W = new Set(want.map(normalizeItem));
  const out = list
    .filter(r => !diet || normalize(r.diet)===diet)
    .filter(r => !tmax || toNumber(r.time) <= tmax)
    .map(r=>{
      const ing = (r.ingredients||[]).map(normalizeItem);
      const have = ing.filter(x => W.has(x)).length;
      const score = have*2 - (ing.length - have);
      return { r, score, have };
    })
    .sort((a,b)=> b.score - a.score || b.have - a.have)
    .map(x=>x.r);
  return out;
}

/* Lista spesa */
function initList(){
  renderList();
  ui.listAdd.onclick = ()=>{
    const raw = ui.listInput.value.trim();
    if (!raw) return;
    addToList(splitCSV(raw).map(normalizeItem));
    ui.listInput.value = '';
  };
  ui.listClear.onclick = ()=>{
    LIST = [];
    saveList();
    renderList();
  };
  ui.listItems.addEventListener('click', e=>{
    const idx = e.target?.dataset?.idx;
    if (typeof idx === 'undefined') return;
    LIST.splice(Number(idx), 1);
    saveList();
    renderList();
  });
}

function addToList(items){
  for (const it of items){
    if (!it) continue;
    if (!LIST.includes(it)) LIST.push(it);
  }
  saveList();
  renderList();
}

function renderList(){
  if (!LIST.length){
    ui.listItems.innerHTML = `<p class="muted">Lista vuota.</p>`;
    return;
  }
  ui.listItems.innerHTML = LIST.map((x,i)=>`
    <div class="row" style="justify-content:space-between; padding:6px 0; border-bottom:1px dashed #20312c">
      <span>${escapeHtml(x)}</span>
      <button class="btn" data-idx="${i}">Rimuovi</button>
    </div>
  `).join('');
}

function loadList(){
  try {
    return JSON.parse(localStorage.getItem('rls_list')||'[]');
  } catch { return []; }
}
function saveList(){
  localStorage.setItem('rls_list', JSON.stringify(LIST));
}

/* Cookie bar */
function initCookies(){
  const key = 'rls_cookie_ok';
  const ok = localStorage.getItem(key);
  ui.cookieBar.classList.toggle('hidden', !!ok);
  ui.cookieAccept.onclick = ()=>{
    localStorage.setItem(key, '1');
    ui.cookieBar.classList.add('hidden');
  };
  ui.cookieDecline.onclick = ()=>{
    localStorage.setItem(key, '0');
    ui.cookieBar.classList.add('hidden');
  };
}

/* Utils */
function toNumber(v){
  if (typeof v === 'number') return v;
  if (typeof v === 'string'){
    const m = v.match(/\d+/);
    return m ? parseInt(m[0],10) : 0;
  }
  return 0;
}
function prettyDiet(d){
  const n = normalize(d);
  if (n==='vegetariano') return 'Vegetariano';
  if (n==='vegano') return 'Vegano';
  if (n==='senza_glutine') return 'Senza glutine';
  return 'Onnivoro';
}
function normalize(v){
  return String(v||'').toLowerCase().replace(/\s+/g,'_');
}
function normalizeItem(v){
  return String(v||'').toLowerCase().trim().replace(/\s+/g,' ');
}
function splitCSV(s){
  return String(s||'').split(/[,\n;]/).map(x=>x.trim()).filter(Boolean);
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}
function escapeAttr(s){ return escapeHtml(s).replace(/"/g, '&quot;'); }
function pickByTitle(t){ return ALL.find(x => (x.title||'').toLowerCase() === String(t||'').toLowerCase()); }

function toast(msg){
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.position='fixed';
  el.style.bottom='18px';
  el.style.left='50%';
  el.style.transform='translateX(-50%)';
  el.style.background='#0f1614';
  el.style.color='#d8ede6';
  el.style.padding='10px 14px';
  el.style.border='1px solid #27443c';
  el.style.borderRadius='12px';
  el.style.zIndex='60';
  document.body.appendChild(el);
  setTimeout(()=> el.remove(), 1600);
}

/* Startup */
window.addEventListener('DOMContentLoaded', ()=>{
  // niente altro qui
});
