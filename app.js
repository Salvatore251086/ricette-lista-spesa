// app.js (v5) — rimuove [object Object] in ingredienti e tag
const RECIPES_URL = 'assets/json/recipes-it.json';
const VOCAB_URL   = 'assets/json/ingredients-it.json';

const qs = s => document.querySelector(s);
const qsa = s => Array.from(document.querySelectorAll(s));

const ui = {
  grid: qs('#recipesGrid'), empty: qs('#empty'),
  q: qs('#q'), t: qs('#filterTime'), d: qs('#filterDiet'), reset: qs('#btnReset'),
  quickTags: qs('#quickTags'),
  genSec: qs('#genSec'), ricetteSec: qs('#ricetteSec'), listaSec: qs('#listaSec'),
  tabRicette: qs('#tabRicette'), tabGeneratore: qs('#tabGeneratore'), tabLista: qs('#tabLista'),
  year: qs('#year'), cookieBar: qs('#cookieBar'), cookieAccept: qs('#cookieAccept'), cookieDecline: qs('#cookieDecline'),
  ocrFile: qs('#ocrFile'), ocrCamera: qs('#ocrCamera'), ocrStatus: qs('#ocrStatus'), ocrText: qs('#ocrText'),
  normList: qs('#normList'),
  genIngredients: qs('#genIngredients'), genDiet: qs('#genDiet'), genTime: qs('#genTime'),
  genFromText: qs('#genFromText'), genBtn: qs('#genBtn'), genClear: qs('#genClear'), genResults: qs('#genResults'),
  listItems: qs('#listItems'), listInput: qs('#listInput'), listAdd: qs('#listAdd'), listClear: qs('#listClear'),
};

ui.year && (ui.year.textContent = new Date().getFullYear());

let ALL = []; let TAGS = []; let LIST = loadList();
let VOCAB = new Set(); let DETECTED = new Set();

initTabs(); initFilters(); initList(); initCookies(); initGenerator();
await loadData();

/* -------------------- Data -------------------- */
async function loadData(){
  const [recipes, vocab] = await Promise.all([fetchJSON(RECIPES_URL), fetchJSON(VOCAB_URL)]);
  ALL = Array.isArray(recipes) ? recipes : (recipes.recipes || []);
  const vocabList = Array.isArray(vocab) ? vocab : (vocab.words || vocab.ingredients || []);
  VOCAB = new Set(vocabList.map(normalizeItem));
  renderTags(); render();
}
async function fetchJSON(url){
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
  return res.json();
}

/* -------------------- Mappers robusti -------------------- */
function toTags(r){
  const raw = r?.tags || [];
  return flatten(raw).map(t=>{
    if (typeof t === 'string') return t;
    if (t && typeof t === 'object') return t.name || t.title || t.tag || t.value || t.label || '';
    return '';
  }).filter(Boolean);
}
function toIngredients(r){
  const raw = r?.ingredients || [];
  return flatten(raw).map(x=>{
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object') {
      return x.name || x.ingredient || x.title || x.value || x.label || '';
    }
    return '';
  }).filter(Boolean);
}
function flatten(x){
  if (!Array.isArray(x)) return [x];
  const out = [];
  const stack = [...x];
  while (stack.length){
    const v = stack.shift();
    if (Array.isArray(v)) stack.push(...v);
    else out.push(v);
  }
  return out;
}

/* -------------------- Render elenco -------------------- */
function render(){
  const term = (ui.q?.value || '').trim().toLowerCase();
  const tmax = parseInt(ui.t?.value || '0', 10);
  const diet = ui.d?.value || '';
  const filtered = ALL.filter(r => {
    const tags = toTags(r);
    const ingredients = toIngredients(r);
    const byText = !term || r.title.toLowerCase().includes(term) || ingredients.join(',').toLowerCase().includes(term) || tags.join(',').toLowerCase().includes(term);
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
  ALL.forEach(r => toTags(r).forEach(t => t && set.add(t)));
  TAGS = [...set].slice(0, 20);
  ui.quickTags.innerHTML = TAGS.map(t => `<button class="pill" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('');
  ui.quickTags.onclick = e => {
    const tag = e.target?.dataset?.tag;
    if (!tag) return;
    ui.q.value = tag;
    render();
  };
}

/* -------------------- Card -------------------- */
function cardRecipe(r){
  const mins = toNumber(r.time);
  const ing = toIngredients(r).slice(0,6).map(escapeHtml).join(', ');
  const tags = toTags(r).slice(0,3).map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(' ');
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
function attachCardHandlers(){
  qsa('.btn.btn-add').forEach(btn=>{
    btn.onclick = e=>{
      const card = e.target.closest('.card');
      const id = card?.dataset?.id || '';
      const rec = ALL.find(x => (x.id||'')===id) || pickByTitle(card?.dataset?.title||'');
      if (!rec) return;
      const items = toIngredients(rec).map(normalizeItem);
      addToList(items);
      toast('Ingredienti aggiunti alla lista');
    };
  });
}

/* -------------------- Filtri e Tabs -------------------- */
function initFilters(){
  ui.q?.addEventListener('input', render);
  ui.t?.addEventListener('change', render);
  ui.d?.addEventListener('change', render);
  ui.reset?.addEventListener('click', ()=>{ ui.q.value=''; ui.t.value=''; ui.d.value=''; render(); });
}
function initTabs(){
  const setTab = (name)=>{
    const map = { ricette: ui.ricetteSec, generatore: ui.genSec, lista: ui.listaSec };
    for (const k in map){ map[k].classList.toggle('hidden', k!==name); }
    ui.tabRicette.setAttribute('aria-pressed', String(name==='ricette'));
    ui.tabGeneratore.setAttribute('aria-pressed', String(name==='generatore'));
    ui.tabLista.setAttribute('aria-pressed', String(name==='lista'));
  };
  ui.tabRicette.onclick = ()=> setTab('ricette');
  ui.tabGeneratore.onclick = ()=> setTab('generatore');
  ui.tabLista.onclick = ()=> setTab('lista');
  setTab('ricette');
}

/* -------------------- Generatore + OCR -------------------- */
function initGenerator(){
  const onPick = async (file) => {
    if (!file) return;
    if (!ui.ocrStatus) return;
    ui.ocrStatus.textContent = 'elaborazione...';
    try {
      const { Tesseract } = window;
      if (!Tesseract) throw new Error('Tesseract non caricato');
      const res = await Tesseract.recognize(file, 'ita', { workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js', langPath: 'https://tessdata.projectnaptha.com/5' });
      const text = (res?.data?.text || '').trim();
      ui.ocrText.value = text;
      ui.ocrStatus.textContent = text ? 'ok' : 'vuoto';
    } catch { ui.ocrStatus.textContent = 'errore'; }
  };
  ui.ocrFile?.addEventListener('change', e => onPick(e.target.files?.[0]));
  ui.ocrCamera?.addEventListener('change', e => onPick(e.target.files?.[0]));

  ui.genFromText?.addEventListener('click', ()=>{
    const items = splitGuess(ui.ocrText?.value + ',' + ui.genIngredients?.value);
    addDetected(items);
  });
  ui.genClear?.addEventListener('click', ()=>{
    if (ui.ocrText) ui.ocrText.value = '';
    if (ui.genIngredients) ui.genIngredients.value = '';
    DETECTED = new Set(); renderDetected(); if (ui.genResults) ui.genResults.innerHTML = ''; if (ui.ocrStatus) ui.ocrStatus.textContent = 'inattivo';
  });
  ui.genBtn?.addEventListener('click', ()=>{
    const want = Array.from(DETECTED);
    const diet = ui.genDiet?.value || '';
    const tmax = parseInt(ui.genTime?.value || '0', 10);
    const out = scoreMatches(ALL, want, diet, tmax).slice(0, 12);
    ui.genResults.innerHTML = out.map(cardRecipe).join('') || cardError('Nessuna proposta', 'Prova ingredienti diversi');
    attachCardHandlers();
  });
}
function addDetected(items){
  items.forEach(x => {
    const n = normalizeItem(x);
    if (!n) return;
    if (VOCAB.size === 0 || VOCAB.has(n)) DETECTED.add(n);
  });
  renderDetected();
}
function renderDetected(){
  if (!ui.normList) return;
  ui.normList.innerHTML = Array.from(DETECTED).sort().map(x=>`<span class="pill">${escapeHtml(x)}</span>`).join('');
}

/* -------------------- Match scoring -------------------- */
function scoreMatches(list, want, diet, tmax){
  const W = new Set(want.map(normalizeItem));
  return list
    .filter(r => !diet || normalize(r.diet)===diet)
    .filter(r => !tmax || toNumber(r.time) <= tmax)
    .map(r=>{
      const ing = toIngredients(r).map(normalizeItem);
      const have = ing.filter(x => W.has(x)).length;
      const score = have*2 - (ing.length - have);
      return { r, score, have };
    })
    .sort((a,b)=> b.score - a.score || b.have - a.have)
    .map(x=>x.r);
}

/* -------------------- Lista spesa -------------------- */
function initList(){
  renderList();
  ui.listAdd?.addEventListener('click', ()=>{
    const raw = ui.listInput?.value.trim();
    if (!raw) return;
    addToList(splitCSV(raw).map(normalizeItem));
    ui.listInput.value = '';
  });
  ui.listClear?.addEventListener('click', ()=>{ LIST = []; saveList(); renderList(); });
  ui.listItems?.addEventListener('click', e=>{
    const idx = e.target?.dataset?.idx;
    if (typeof idx === 'undefined') return;
    LIST.splice(Number(idx), 1);
    saveList(); renderList();
  });
}
function addToList(items){
  for (const it of items){ if (!it) continue; if (!LIST.includes(it)) LIST.push(it); }
  saveList(); renderList();
}
function renderList(){
  if (!ui.listItems) return;
  if (!LIST.length){ ui.listItems.innerHTML = `<p class="muted">Lista vuota.</p>`; return; }
  ui.listItems.innerHTML = LIST.map((x,i)=>`
    <div clas
