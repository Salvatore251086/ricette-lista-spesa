// Ricette & Lista Spesa · App core con inserimento ricette e verifica YouTube

// 0) Config
const LIST_KEY = 'rls.list';
const USER_RECIPES_KEY = 'rls.user_recipes';
const ALLOWED_YT_CHANNELS = [
  'UCj3NcgJQJz0B2s3AqJ4vMwA', // Giallo Zafferano (esempio, sostituisci con ID reali)
  'UC3d5qL6Q9sH9PqO0F6d0kbg', // Benedetta
  'UCmS4G0rKQ2F0r2m6y0xMari'  // Max Mariola
];

// 1) Persistenza lista spesa con dedupe
function loadList(){ try{ return JSON.parse(localStorage.getItem(LIST_KEY)) || [] }catch{ return [] } }
function saveList(items){ localStorage.setItem(LIST_KEY, JSON.stringify(items)) }
function addToList(items){
  const list = loadList();
  items.forEach(it=>{
    const name = String(it.name || it.ingredient || '').trim();
    if(!name) return;
    const unit = String(it.unit || '').trim();
    const qty = Number(it.qty ?? it.quantity ?? 1) || 1;
    const idx = list.findIndex(x => x.name.toLowerCase()===name.toLowerCase() && (x.unit||'')===unit);
    if(idx>=0) list[idx].qty = Number(list[idx].qty||0)+qty;
    else list.push({ name, qty, unit, checked:false });
  });
  saveList(list);
  return list;
}
function toggleList(name){ const list=loadList(); const i=list.findIndex(x=>x.name.toLowerCase()===String(name).toLowerCase()); if(i>=0) list[i].checked=!list[i].checked; saveList(list); return list; }
function removeFromList(name){ const next=loadList().filter(x=>x.name.toLowerCase()!==String(name).toLowerCase()); saveList(next); return next; }
function clearChecked(){ const next=loadList().filter(x=>!x.checked); saveList(next); return next; }

// 2) Filtri a chip AND
function filterByTagsAND(recipes, activeTags){
  if(!activeTags || activeTags.length===0) return recipes;
  const want = activeTags.map(t=>t.toLowerCase());
  return recipes.filter(r=>{
    const tags = (r.tags||[]).map(t=>t.toLowerCase());
    return want.every(t=>tags.includes(t));
  });
}

// 3) Suggerisci ricette
function normalizeToken(s){ return String(s).toLowerCase().trim() }
function suggestRecipes(recipes, inputText){
  const tokens = String(inputText||'').split(',').map(normalizeToken).filter(Boolean);
  if(tokens.length===0) return [];
  return recipes
    .map(r=>{
      const ingr = (r.ingredients||[]).map(i=>normalizeToken(i.name));
      const matches = tokens.filter(t=>ingr.includes(t)).length;
      const ratio = matches / Math.max(1, ingr.length);
      const score = matches*2 + ratio;
      return { recipe:r, score, matches };
    })
    .filter(x=>x.matches>0)
    .sort((a,b)=>b.score-a.score)
    .map(x=>x.recipe);
}

// 4) Spesa intelligente
async function loadPromotions(){ try{ const r=await fetch('assets/json/promotions.json',{cache:'no-store'}); return await r.json() }catch{ return { promotions:[], stores:[] } } }
function bestPriceForIngredient(promos, ingredientName){
  const name = String(ingredientName||'').toLowerCase();
  const candidates = promos.promotions.filter(p=>{
    const aliases=(p.aliases||[]).map(x=>String(x).toLowerCase());
    return aliases.includes(name);
  });
  if(candidates.length===0) return null;
  candidates.sort((a,b)=>a.price-b.price);
  const best=candidates[0];
  const store=promos.stores.find(s=>s.id===best.store_id);
  return { store: store?store.name:best.store_id, product: best.product, price: best.price };
}
async function computeSmartCart(neededItems){
  const promos = await loadPromotions();
  return neededItems.map(n=>{
    const best = bestPriceForIngredient(promos, n.name);
    return best ? { ...n, suggestion: best } : { ...n, suggestion:null };
  });
}

// 5) YouTube helper
function extractYouTubeId(urlOrId){
  try{
    if(!urlOrId) return '';
    if(urlOrId.length===11 && !/[^a-zA-Z0-9_-]/.test(urlOrId)) return urlOrId;
    const u = new URL(urlOrId);
    if(u.hostname.includes('youtube.com')) return u.searchParams.get('v')||'';
    if(u.hostname==='youtu.be') return u.pathname.slice(1);
  }catch{}
  return '';
}
function makeYouTube(urlOrId){
  const id = extractYouTubeId(urlOrId);
  if(!id) return '';
  const src = 'https://www.youtube-nocookie.com/embed/'+id;
  return `<iframe src="${src}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0"></iframe>`;
}

// 6) Dataset ricette, merge con ricette utente
async function loadJSON(p){ const r=await fetch(p,{cache:'no-store'}); return r.json() }
function loadUserRecipes(){ try{ return JSON.parse(localStorage.getItem(USER_RECIPES_KEY)) || [] }catch{ return [] } }
function saveUserRecipes(arr){ localStorage.setItem(USER_RECIPES_KEY, JSON.stringify(arr)) }
async function loadRecipes(){
  const base = await loadJSON('assets/json/recipes-it.json');
  const user = loadUserRecipes();
  return [...(base.recipes||[]), ...user];
}

// 7) Inserimento nuova ricetta
async function validateYouTubeOnServer(urlOrId){
  const url = '/api/validate-youtube?url=' + encodeURIComponent(urlOrId) + '&allowed=' + ALLOWED_YT_CHANNELS.join(',');
  try{
    const r = await fetch(url, { cache:'no-store' });
    if(!r.ok) return { ok:false, reason:'HTTP '+r.status };
    const data = await r.json();
    return data; // { ok, id, channelId, channelTitle, title }
  }catch{ return { ok:false, reason:'network' } }
}

function downloadJSON(filename, obj){
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
}

async function addNewRecipeFromForm(formEl){
  const fd = new FormData(formEl);
  const title = String(fd.get('title')||'').trim();
  const description = String(fd.get('description')||'').trim();
  const sourceUrl = String(fd.get('sourceUrl')||'').trim();
  const youtubeInput = String(fd.get('youtube')||'').trim();
  const servings = Number(fd.get('servings')||2)||2;
  const prepTime = Number(fd.get('prepTime')||0)||0;
  const cookTime = Number(fd.get('cookTime')||0)||0;
  const tags = String(fd.get('tags')||'').split(',').map(s=>s.trim()).filter(Boolean);
  const ingredients = String(fd.get('ingredients')||'')
    .split('\n')
    .map(l=>l.trim())
    .filter(Boolean)
    .map(line=>{
      // formato: nome | qty | unit
      const parts = line.split('|').map(s=>s.trim());
      return { name: parts[0], quantity: Number(parts[1]||1)||1, unit: parts[2]||'' };
    });

  if(!title || ingredients.length===0){
    alert('Titolo e almeno un ingrediente sono obbligatori');
    return;
  }

  // Validazione YouTube
  let youtubeId = '';
  if(youtubeInput){
    const res = await validateYouTubeOnServer(youtubeInput);
    if(res && res.ok && ALLOWED_YT_CHANNELS.includes(res.channelId)){
      youtubeId = res.id;
    }else{
      // ultima chance, accetta ID se formalmente valido
      const quick = extractYouTubeId(youtubeInput);
      if(quick) youtubeId = quick;
    }
  }

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'') + '-' + Date.now().toString(36);

  const rec = {
    id, title, description,
    image: '', // opzionale, puoi gestire upload locale
    servings, prepTime, cookTime,
    difficulty: 'easy',
    category: [],
    ingredients,
    steps: [],
    tags,
    sourceUrl,
    youtubeId
  };

  const current = loadUserRecipes();
  current.push(rec);
  saveUserRecipes(current);

  alert('Ricetta aggiunta in locale. Ricorda di esportare per aggiornare il JSON di produzione.');
  renderRecipesView();
}

function exportMergedRecipes(){
  loadJSON('assets/json/recipes-it.json').then(base=>{
    const user = loadUserRecipes();
    const merged = { ...base, recipes: [ ...(base.recipes||[]), ...user ] };
    downloadJSON('recipes-it.updated.json', merged);
  });
}

// 8) UI helpers
function el(sel){ return document.querySelector(sel) }
function html(target, content){ target.innerHTML = content }
function esc(s){ return String(s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }
function renderTags(tags){ return (tags||[]).map(t=>`<span class="badge">${esc(t)}</span>`).join('') }
function renderRecipeCard(r){
  const tags = renderTags(r.tags);
  return `
    <div class="card">
      <h3>${esc(r.title)}</h3>
      <div>${Number(r.prepTime||0)+Number(r.cookTime||0)} min totali</div>
      <div>${tags}</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <button data-action="add-list" data-id="${esc(r.id)}">Aggiungi alla lista</button>
        ${r.youtubeId ? `<button data-action="watch" data-id="${esc(r.youtubeId)}">Video</button>` : ''}
        ${r.sourceUrl ? `<a href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">Preparazione</a>` : ''}
      </div>
    </div>
  `;
}

// 9) Views
async function renderRecipesView(){
  const app = el('#app');
  const all = await loadRecipes();
  html(app, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
      <h2 style="margin:0">Ricette</h2>
      <button id="btn-new-recipe">Nuova ricetta</button>
      <button id="btn-export-recipes">Esporta JSON aggiornato</button>
    </div>
    <div class="grid" id="grid"></div>
  `);
  const grid = el('#grid');
  html(grid, all.map(renderRecipeCard).join(''));

  grid.addEventListener('click', ev=>{
    const btn = ev.target.closest('button');
    if(!btn) return;
    const action = btn.getAttribute('data-action');
    if(action==='add-list'){
      const id = btn.getAttribute('data-id');
      const r = all.find(x=>x.id===id);
      if(!r) return;
      addToList((r.ingredients||[]).map(i=>({ name:i.name, qty:i.quantity||i.qty||1, unit:i.unit||'' })));
      alert('Ingredienti aggiunti');
    }
    if(action==='watch'){
      const yt = btn.getAttribute('data-id');
      const holder = document.createElement('div');
      holder.innerHTML = makeYouTube(yt);
      document.body.appendChild(holder);
      setTimeout(()=>{
        const iframe = holder.querySelector('iframe');
        if(!iframe || !iframe.contentWindow) window.open('https://www.youtube.com/watch?v='+yt, '_blank');
      }, 2000);
    }
  });

  el('#btn-new-recipe').onclick = ()=> renderAddRecipeView();
  el('#btn-export-recipes').onclick = exportMergedRecipes;
}

async function renderListView(){
  const app = el('#app');
  const list = loadList();
  const smart = await computeSmartCart(list);
  html(app, `
    <h2>Lista</h2>
    <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button id="btn-clear-checked">Rimuovi spuntati</button>
      <button id="btn-refresh-list">Ricarica</button>
    </div>
    <div id="list"></div>
  `);
  const listEl = el('#list');
  function rowHTML(i){
    const sug = i.suggestion
      ? `<div style="font-size:12px;color:#555">Offerta migliore: ${esc(i.suggestion.store)} · ${esc(i.suggestion.product)} · €${Number(i.suggestion.price).toFixed(2)}</div>`
      : `<div style="font-size:12px;color:#888">Nessuna offerta</div>`;
    return `
      <div class="card" data-name="${esc(i.name)}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <div><strong>${esc(i.name)}</strong> · ${Number(i.qty).toString()} ${esc(i.unit||'')}</div>
            ${sug}
          </div>
          <div style="display:flex;gap:8px">
            <button data-action="toggle">${i.checked ? 'Non comprato' : 'Comprato'}</button>
            <button data-action="remove">Rimuovi</button>
          </div>
        </div>
      </div>
    `;
  }
  html(listEl, smart.map(rowHTML).join(''));
  listEl.addEventListener('click', ev=>{
    const btn=ev.target.closest('button'); if(!btn) return;
    const row=ev.target.closest('.card'); const name=row?.getAttribute('data-name'); if(!name) return;
    const action=btn.getAttribute('data-action');
    if(action==='toggle'){ toggleList(name); renderListView() }
    if(action==='remove'){ removeFromList(name); renderListView() }
  });
  el('#btn-clear-checked').onclick=()=>{ clearChecked(); renderListView() };
  el('#btn-refresh-list').onclick=()=> renderListView();
}

function renderAddRecipeView(){
  const app = el('#app');
  html(app, `
    <h2>Nuova ricetta</h2>
    <form id="form-recipe" style="display:grid;gap:10px;max-width:640px">
      <input name="title" placeholder="Titolo" required />
      <textarea name="description" placeholder="Descrizione"></textarea>
      <textarea name="ingredients" placeholder="Ingredienti, uno per riga. Formato: nome | qty | unit"></textarea>
      <input name="tags" placeholder="Tag separati da virgola" />
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input name="servings" type="number" min="1" value="2" placeholder="Porzioni" />
        <input name="prepTime" type="number" min="0" value="0" placeholder="Prep min" />
        <input name="cookTime" type="number" min="0" value="0" placeholder="Cottura min" />
      </div>
      <input name="sourceUrl" placeholder="Link preparazione" />
      <input name="youtube" placeholder="URL o ID YouTube" />
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit">Salva in locale</button>
        <button type="button" id="back">Annulla</button>
      </div>
      <p style="font-size:12px;color:#555">Il video viene validato su canali consentiti. In assenza di conferma server, l’ID valido viene accettato ugualmente.</p>
    </form>
  `);
  el('#form-recipe').onsubmit = async ev=>{ ev.preventDefault(); await addNewRecipeFromForm(ev.target); };
  el('#back').onclick = ()=> renderRecipesView();
}

async function renderSmartView(){
  const app = el('#app');
  const list = loadList();
  const smart = await computeSmartCart(list);
  html(app, `
    <h2>Spesa smart</h2>
    <div class="grid">
      ${smart.map(i=>`
        <div class="card">
          <div><strong>${esc(i.name)}</strong> · ${Number(i.qty).toString()} ${esc(i.unit||'')}</div>
          ${i.suggestion ? `<div style="margin-top:6px">Vai da <strong>${esc(i.suggestion.store)}</strong><br>${esc(i.suggestion.product)} · €${Number(i.suggestion.price).toFixed(2)}</div>` : `<div style="margin-top:6px;color:#888">Nessuna offerta</div>`}
        </div>
      `).join('')}
    </div>
  `);
}

function renderPlansView(){
  const app = el('#app');
  html(app, `
    <h2>Piani</h2>
    <table>
      <thead><tr><th>Funzione</th><th>Demo</th><th>Starter</th><th>Premium</th></tr></thead>
      <tbody>
        <tr><td>Ricette complete</td><td>20</td><td>Tutte</td><td>Tutte</td></tr>
        <tr><td>Filtri multi tag AND</td><td>No</td><td>Sì</td><td>Sì</td></tr>
        <tr><td>Suggerisci ricette</td><td>No</td><td>Sì</td><td>Sì</td></tr>
        <tr><td>OCR</td><td>No</td><td>Base</td><td>Avanzato</td></tr>
        <tr><td>Spesa intelligente</td><td>No</td><td>Base</td><td>Pro</td></tr>
        <tr><td>Piani pasto</td><td>No</td><td>No</td><td>Sì</td></tr>
        <tr><td>Benessere stile Fit Hub Pro</td><td>No</td><td>No</td><td>Sì</td></tr>
      </tbody>
    </table>
  `);
}

// 10) Nav e bootstrap
async function bootstrap(){
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('service-worker.js') }catch{} }
  document.querySelector('#nav-recipes')?.addEventListener('click', renderRecipesView);
  document.querySelector('#nav-lista')?.addEventListener('click', renderListView);
  document.querySelector('#nav-spesa')?.addEventListener('click', renderSmartView);
  document.querySelector('#nav-piani')?.addEventListener('click', renderPlansView);
  document.querySelector('#btn-refresh')?.addEventListener('click', ()=>location.reload());
  await renderRecipesView();
}
bootstrap();
