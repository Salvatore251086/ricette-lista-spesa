/* ==========
   Dati demo
===========*/
const RECIPES = [
  {
    id: 'frittata-pomodori',
    name: 'Frittata ai pomodori',
    minutes: 15,
    vegetarian: true,
    ingredients: ['uova','pomodoro','cipolla','olio','sale'],
    missingToBuy: ['pane'],
    tips: ['Usa i pomodori un po’ maturi', 'Ottima per il pranzo veloce']
  },
  {
    id: 'pasta-zucca',
    name: 'Pasta alla zucca',
    minutes: 22,
    vegetarian: true,
    ingredients: ['pasta','zucca','cipolla','olio','sale','pepe'],
    missingToBuy: ['grana'],
    tips: ['Congela la zucca a cubetti', 'Aggiungi salvia se l’hai']
  },
  {
    id: 'pollo-patate',
    name: 'Pollo al forno con patate',
    minutes: 40,
    vegetarian: false,
    ingredients: ['pollo','patate','rosmarino','olio','sale'],
    missingToBuy: ['insalata'],
    tips: ['Taglia le patate sottili per cuocere prima']
  }
];

const OFFERS = [
  {id:'off1', name:'Pomodori grappolo', cat:'Verdura', store:'SuperDì', pct:-35, note:'Fino a domenica'},
  {id:'off2', name:'Latte intero 1L', cat:'Latticini', store:'IperPiù', pct:-25, note:'Con tessera'},
  {id:'off3', name:'Pasta 500g', cat:'Dispensa', store:'MarketX', pct:-30, note:'Max 6 pz'}
];

/* ==========
   Utility
===========*/
const qs = sel => document.querySelector(sel);
const qsa = sel => [...document.querySelectorAll(sel)];
const save = (k,v)=>localStorage.setItem(k,JSON.stringify(v));
const load = (k,fb)=>JSON.parse(localStorage.getItem(k) || JSON.stringify(fb));

/* ==========
   Tabs
===========*/
qsa('.tab').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    qsa('.tab').forEach(b=>b.classList.remove('active'));
    qsa('.panel').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active');
    qs(btn.dataset.target).classList.add('active');
  });
});

/* ==========
   Preferenze (Impostazioni)
===========*/
const dlg = qs('#dlg-settings');
qs('#btn-settings').addEventListener('click', ()=> dlg.showModal());

const PREFS_KEY = 'prefs';
const prefs = load(PREFS_KEY,{veg:false,quick:false});
qs('#pref-veg').checked = prefs.veg;
qs('#pref-quick').checked = prefs.quick;

qs('#btn-save-prefs').addEventListener('click', ()=>{
  const newPrefs = {
    veg: qs('#pref-veg').checked,
    quick: qs('#pref-quick').checked
  };
  save(PREFS_KEY,newPrefs);
});

/* ==========
   Ricette
===========*/
const ingInput = qs('#ing-input');
const recipesEl = qs('#recipes');

// ripristina ultimo input
ingInput.value = load('last-ings','');

function norm(s){ return s.trim().toLowerCase(); }
function splitIngs(s){
  return s.split(',').map(norm).filter(Boolean);
}

function scoreRecipe(userIngs, r){
  const set = new Set(userIngs);
  const have = r.ingredients.filter(i=>set.has(i)).length;
  const pct = Math.round((have / r.ingredients.length)*100);
  return {have, pct};
}

function passPrefs(r){
  if (prefs.veg && !r.vegetarian) return false;
  if (prefs.quick && r.minutes > 25) return false;
  return true;
}

function renderRecipes(list, userIngs){
  recipesEl.innerHTML = '';
  if (!list.length){
    recipesEl.innerHTML = `<div class="card"><p class="note">Nessuna ricetta trovata. Prova ad aggiungere più ingredienti.</p></div>`;
    return;
  }
  list.forEach(r=>{
    const {pct} = scoreRecipe(userIngs,r);
    const miss = r.ingredients.filter(i=>!userIngs.includes(i));
    const el = document.createElement('div');
    el.className = 'card recipe';
    el.innerHTML = `
      <div class="badges">
        <span class="badge">${pct}% match</span>
        <span class="badge gray">${r.minutes} min</span>
        ${r.vegetarian ? `<span class="badge">Veg</span>`:''}
      </div>
      <h3>${r.name}</h3>
      <div class="note">Hai: ${r.ingredients.filter(i=>userIngs.includes(i)).join(', ') || '—'}</div>
      <div class="note">Mancano: ${miss.join(', ') || 'niente, puoi cucinare!'}</div>
      <div class="recipe-footer">
        <button class="btn btn-primary" data-act="to-list">Aggiungi mancanti alla lista</button>
        <button class="btn" data-act="tips">Consigli</button>
      </div>
    `;
    el.querySelector('[data-act="to-list"]').addEventListener('click', ()=>{
      addManyToList(miss.length ? miss : r.missingToBuy);
    });
    el.querySelector('[data-act="tips"]').addEventListener('click', ()=>{
      alert(`Consigli:\n- ${r.tips.join('\n- ')}`);
    });
    recipesEl.appendChild(el);
  });
}

function findRecipes(){
  const userIngs = splitIngs(ingInput.value);
  save('last-ings', ingInput.value);
  const found = RECIPES
    .filter(passPrefs)
    .map(r=>({r, score:scoreRecipe(userIngs,r)}))
    .sort((a,b)=>b.score.pct - a.score.pct)
    .map(x=>x.r);
  renderRecipes(found, userIngs);
}

qs('#btn-find').addEventListener('click', findRecipes);
// primo render se avevi già ingredienti
if (ingInput.value.trim()) findRecipes();

/* ==========
   Lista Spesa
===========*/
const LIST_KEY = 'shopping:list';
let LIST = load(LIST_KEY,[]);

const listEl = qs('#list');
const nameEl = qs('#item-name');
const qtyEl  = qs('#item-qty');
const catEl  = qs('#item-cat');

function persistList(){
  save(LIST_KEY, LIST);
  renderList();
}
function addItem(name, qty='', cat=''){
  if (!name.trim()) return;
  LIST.push({id:crypto.randomUUID(), name:name.trim(), qty:qty.trim(), cat:cat.trim(), done:false});
  persistList();
}
function addManyToList(names){
  (names||[]).forEach(n=>addItem(n));
}
function toggleDone(id){
  const it = LIST.find(x=>x.id===id);
  if (it){ it.done = !it.done; persistList(); }
}
function clearDone(){
  LIST = LIST.filter(x=>!x.done);
  persistList();
}
function renderList(){
  listEl.innerHTML = '';
  if (!LIST.length){
    listEl.innerHTML = `<li class="item"><span class="note">Lista vuota.</span></li>`;
    return;
  }
  LIST.forEach(it=>{
    const li = document.createElement('li');
    li.className = 'item';
    li.innerHTML = `
      <input type="checkbox" ${it.done?'checked':''} aria-label="Acquistato" />
      <span class="name">${it.name} ${it.qty?`<span class="note">(${it.qty})</span>`:''}</span>
      <span class="cat">${it.cat||''}</span>
      <button class="btn" aria-label="Rimuovi">🗑️</button>
    `;
    li.querySelector('input').addEventListener('change', ()=>toggleDone(it.id));
    li.querySelector('button').addEventListener('click', ()=>{
      LIST = LIST.filter(x=>x.id!==it.id);
      persistList();
    });
    listEl.appendChild(li);
  });
}
renderList();

qs('#btn-add').addEventListener('click', ()=>{
  addItem(nameEl.value, qtyEl.value, catEl.value);
  nameEl.value=''; qtyEl.value=''; catEl.value='';
  nameEl.focus();
});
qs('#btn-clear-done').addEventListener('click', clearDone);
qs('#btn-export').addEventListener('click', ()=>{
  const text = LIST.map(x=>`- ${x.done?'[x] ':'[ ] '}${x.name}${x.qty?` (${x.qty})`:''}${x.cat?` — ${x.cat}`:''}`).join('\n');
  navigator.clipboard.writeText(text).then(()=>alert('Lista copiata negli appunti!'));
});

/* ==========
   Offerte (demo)
===========*/
const offersEl = qs('#offers');
const offersFilterEl = qs('#offers-filter');

function renderOffers(cat=''){
  offersEl.innerHTML = '';
  OFFERS
    .filter(o=>!cat || o.cat===cat)
    .forEach(o=>{
      const d = document.createElement('div');
      d.className='card offer';
      d.innerHTML = `
        <div><strong>${o.name}</strong></div>
        <div class="pct">${o.pct}%</div>
        <div class="store">${o.store} • ${o.cat}</div>
        <div class="note">${o.note}</div>
        <button class="btn btn-primary" data-name="${o.name}">Aggiungi alla lista</button>
      `;
      d.querySelector('button').addEventListener('click', (e)=>{
        addItem(e.target.dataset.name, '', o.cat);
      });
      offersEl.appendChild(d);
    });
}
renderOffers();

offersFilterEl.addEventListener('change', ()=> renderOffers(offersFilterEl.value));
qs('#btn-refresh-offers').addEventListener('click', ()=> renderOffers(offersFilterEl.value));
