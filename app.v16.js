/* app.v16.js — usa config/project.config.json */

const CFG = window.RLS_CONFIG || {}
const PATHS = CFG.paths || {}
const APP_VERSION = 'v17'
const LIST_KEY = 'rls.list'
const USER_RECIPES_KEY = 'rls.user_recipes'
const PLAN = window.RLS_PLAN || 'starter'

const IS_DEV = new URL(location.href).searchParams.get('dev')==='1'
const FETCH_INIT = IS_DEV ? { cache:'reload' } : { cache:'no-store' }

function el(s){ return document.querySelector(s) }
function html(t,c){ t.innerHTML=c }
function esc(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }
function fold(s){ return String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim() }
function todayISO(){ return new Date().toISOString().slice(0,10) }

function loadList(){ try{return JSON.parse(localStorage.getItem(LIST_KEY))||[]}catch{return[]} }
function saveList(a){ localStorage.setItem(LIST_KEY,JSON.stringify(a)) }
function addToList(items){
  const list=loadList()
  items.forEach(it=>{
    const name=String(it.name||it.ingredient||'').trim()
    if(!name) return
    const unit=String(it.unit||'').trim()
    const qty=Number(it.qty??it.quantity??1)||1
    const i=list.findIndex(x=>x.name.toLowerCase()===name.toLowerCase()&&(x.unit||'')===unit)
    if(i>=0) list[i].qty=Number(list[i].qty||0)+qty
    else list.push({name,qty,unit,checked:false})
  })
  saveList(list)
  return list
}
function toggleList(name){
  const list=loadList()
  const i=list.findIndex(x=>x.name.toLowerCase()===String(name).toLowerCase())
  if(i>=0) list[i].checked=!list[i].checked
  saveList(list); return list
}
function removeFromList(name){ const n=loadList().filter(x=>x.name.toLowerCase()!==String(name).toLowerCase()); saveList(n); return n }
function clearChecked(){ const n=loadList().filter(x=>!x.checked); saveList(n); return n }

function renderTags(tags){ return (tags||[]).map(t=>'<span class="badge">'+esc(t)+'</span>').join('') }
function makeYouTube(idOrUrl){
  const id=extractYouTubeId(idOrUrl)
  if(!id) return ''
  const src='https://www.youtube-nocookie.com/embed/'+id
  return '<iframe src="'+src+'" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0"></iframe>'
}
function extractYouTubeId(s){
  try{
    if(!s) return ''
    if(String(s).length===11 && !/[^a-zA-Z0-9_-]/.test(s)) return s
    const u=new URL(s)
    if(u.hostname.includes('youtube.com')) return u.searchParams.get('v')||''
    if(u.hostname==='youtu.be') return u.pathname.slice(1)
  }catch{}
  return ''
}

async function loadJSON(p){ const r=await fetch(p, FETCH_INIT); return r.json() }
function loadUserRecipes(){ try{return JSON.parse(localStorage.getItem(USER_RECIPES_KEY))||[]}catch{return[]} }
function saveUserRecipes(a){ localStorage.setItem(USER_RECIPES_KEY, JSON.stringify(a)) }

async function loadRecipes(){
  const file = PATHS.recipes || 'assets/json/recipes-it.json'
  const base = await loadJSON(file)
  let list = [...(base.recipes||[]), ...loadUserRecipes()]
  const planCfg = (CFG.app&&CFG.app.plans&&CFG.app.plans[PLAN]) || {}
  if(planCfg.recipesLimit && planCfg.recipesLimit>0) list=list.slice(0,planCfg.recipesLimit)
  return list
}

async function loadPromotions(){
  const file = PATHS.promotions || 'assets/json/promotions.json'
  try{ const r=await fetch(file, FETCH_INIT); return await r.json() }catch{ return { promotions:[], stores:[] } }
}
function validNow(p){ const t=todayISO(); return (!p.valid_from||t>=p.valid_from)&&(!p.valid_to||t<=p.valid_to) }
function bestPriceForIngredient(promos, name){
  const n=String(name||'').toLowerCase()
  const cand=promos.promotions.filter(p=>{
    if(!validNow(p)) return false
    const aliases=(p.aliases||[]).map(x=>String(x).toLowerCase())
    return aliases.includes(n)
  })
  if(cand.length===0) return null
  cand.sort((a,b)=>a.price-b.price)
  const best=cand[0]
  const store=promos.stores.find(s=>s.id===best.store_id)
  return { store:store?store.name:best.store_id, product:best.product, price:best.price, unit_price:typeof best.unit_price==='number'?best.unit_price:undefined }
}
async function computeSmartCart(list){
  const promos=await loadPromotions()
  return list.map(n=>{ const s=bestPriceForIngredient(promos,n.name); return s?{...n,suggestion:s}:{...n,suggestion:null} })
}

function renderRecipeCard(r){
  const tags=renderTags(r.tags)
  return `
    <div class="card">
      <h3>${esc(r.title)}</h3>
      <div>${Number(r.prepTime||0)+Number(r.cookTime||0)} min totali</div>
      <div>${tags}</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-green" data-action="add-list" data-id="${esc(r.id)}">Aggiungi alla lista</button>
        ${r.youtubeId?`<button class="btn btn-blue" data-action="watch" data-id="${esc(r.youtubeId)}">Video</button>`:''}
        ${r.sourceUrl?`<a class="btn btn-ghost" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">Preparazione</a>`:''}
      </div>
    </div>
  `
}

async function renderRecipesView(){
  const app=el('#app')
  const all=await loadRecipes()
  html(app, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
      <h2 style="margin:0">Ricette</h2>
      <button id="btn-new-recipe" class="btn">Nuova ricetta</button>
      <button id="btn-export-recipes" class="btn">Esporta JSON aggiornato</button>
    </div>
    <div class="grid" id="grid"></div>
  `)

  function apply(){
    const q=fold(el('#search')?.value||'')
    const filtered = q
      ? all.filter(r=>{
          const t=fold(r.title).includes(q)
          const i=(r.ingredients||[]).some(x=>fold(x.name).includes(q))
          return t||i
        })
      : all
    html(el('#grid'), filtered.map(renderRecipeCard).join(''))
  }
  apply()
  const s=el('#search'); if(s){ let t; s.addEventListener('input',()=>{clearTimeout(t); t=setTimeout(apply,150)}) }

  el('#grid').addEventListener('click',ev=>{
    const btn=ev.target.closest('button'); if(!btn) return
    const act=btn.getAttribute('data-action')
    if(act==='add-list'){
      const id=btn.getAttribute('data-id')
      const r=all.find(x=>x.id===id); if(!r) return
      addToList((r.ingredients||[]).map(i=>({name:i.name, qty:i.quantity||i.qty||1, unit:i.unit||''})))
      alert('Ingredienti aggiunti')
    }
    if(act==='watch'){
      const yt=btn.getAttribute('data-id')
      const holder=document.createElement('div'); holder.innerHTML=makeYouTube(yt); document.body.appendChild(holder)
      setTimeout(()=>{ const f=holder.querySelector('iframe'); if(!f||!f.contentWindow) window.open('https://www.youtube.com/watch?v='+yt,'_blank') }, CFG.youtube?.iframeTimeoutMs||2000)
    }
  })

  el('#btn-new-recipe').onclick=()=>renderAddRecipeView()
  el('#btn-export-recipes').onclick=exportMergedRecipes
}

async function renderListView(){
  const app=el('#app')
  const list=loadList()
  const smart=await computeSmartCart(list)
  html(app, `
    <h2>Lista</h2>
    <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button id="btn-clear-checked" class="btn">Rimuovi spuntati</button>
      <button id="btn-refresh-list" class="btn">Ricarica</button>
    </div>
    <div id="list"></div>
  `)
  const node=el('#list')
  function row(i){
    const sug=i.suggestion?`<div style="font-size:12px;color:#555">Offerta migliore: ${esc(i.suggestion.store)} · ${esc(i.suggestion.product)} · €${Number(i.suggestion.price).toFixed(2)}${typeof i.suggestion.unit_price==='number'?' ('+i.suggestion.unit_price+' €/unità)':''}</div>`:`<div style="font-size:12px;color:#888">Nessuna offerta</div>`
    return `
      <div class="card" data-name="${esc(i.name)}" style="padding:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <div><strong>${esc(i.name)}</strong> · ${Number(i.qty).toString()} ${esc(i.unit||'')}</div>
            ${sug}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn" data-action="toggle">${i.checked?'Non comprato':'Comprato'}</button>
            <button class="btn" data-action="remove">Rimuovi</button>
          </div>
        </div>
      </div>
    `
  }
  html(node, smart.map(row).join(''))
  node.addEventListener('click',ev=>{
    const b=ev.target.closest('button'); if(!b) return
    const r=ev.target.closest('.card'); const name=r?.getAttribute('data-name'); if(!name) return
    const a=b.getAttribute('data-action')
    if(a==='toggle'){ toggleList(name); renderListView() }
    if(a==='remove'){ removeFromList(name); renderListView() }
  })
  el('#btn-clear-checked').onclick=()=>{ clearChecked(); renderListView() }
  el('#btn-refresh-list').onclick=()=>renderListView()
}

function renderAddRecipeView(){
  const app=el('#app')
  html(app, `
    <h2>Nuova ricetta</h2>
    <form id="form-recipe" style="display:grid;gap:10px;max-width:640px">
      <input name="title" placeholder="Titolo" required>
      <textarea name="description" placeholder="Descrizione"></textarea>
      <textarea name="ingredients" placeholder="Ingredienti, uno per riga. Formato: nome | qty | unit"></textarea>
      <input name="tags" placeholder="Tag separati da virgola">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input name="servings" type="number" min="1" value="2" placeholder="Porzioni">
        <input name="prepTime" type="number" min="0" value="0" placeholder="Prep min">
        <input name="cookTime" type="number" min="0" value="0" placeholder="Cottura min">
      </div>
      <input name="sourceUrl" placeholder="Link preparazione">
      <input name="youtube" placeholder="URL o ID YouTube">
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" class="btn btn-green">Salva in locale</button>
        <button type="button" id="back" class="btn">Annulla</button>
      </div>
      <p style="font-size:12px;color:#555">Il video viene validato in app con verifica oEmbed. Se l’embed fallisce si apre YouTube in nuova scheda.</p>
    </form>
  `)
  el('#form-recipe').onsubmit=async ev=>{
    ev.preventDefault()
    const fd=new FormData(ev.target)
    const title=String(fd.get('title')||'').trim()
    const description=String(fd.get('description')||'').trim()
    const sourceUrl=String(fd.get('sourceUrl')||'').trim()
    const youtubeInput=String(fd.get('youtube')||'').trim()
    const servings=Number(fd.get('servings')||2)||2
    const prepTime=Number(fd.get('prepTime')||0)||0
    const cookTime=Number(fd.get('cookTime')||0)||0
    const tags=String(fd.get('tags')||'').split(',').map(s=>s.trim()).filter(Boolean)
    const ingredients=String(fd.get('ingredients')||'').split('\n').map(l=>l.trim()).filter(Boolean).map(line=>{
      const p=line.split('|').map(s=>s.trim()); return { name:p[0], quantity:Number(p[1]||1)||1, unit:p[2]||'' }
    })
    if(!title||ingredients.length===0){ alert('Titolo e almeno un ingrediente obbligatori'); return }
    let youtubeId=''
    if(youtubeInput){
      const quick=extractYouTubeId(youtubeInput)
      if(quick){
        try{
          const o=await fetch('https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v='+quick+'&format=json')
          if(o.ok) youtubeId=quick
        }catch{}
      }
    }
    const id=title.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')+'-'+Date.now().toString(36)
    const rec={ id,title,description,image:'',servings,prepTime,cookTime,difficulty:'easy',category:[],ingredients,steps:[],tags,sourceUrl,youtubeId }
    const cur=loadUserRecipes(); cur.push(rec); saveUserRecipes(cur)
    alert('Ricetta salvata in locale. Usa Esporta per aggiornare il JSON di produzione.')
    renderRecipesView()
  }
  el('#back').onclick=()=>renderRecipesView()
}

async function renderSmartView(){
  const app=el('#app')
  const list=loadList()
  const smart=await computeSmartCart(list)
  html(app, `
    <h2>Spesa smart</h2>
    <div class="grid">
      ${smart.map(i=>`
        <div class="card" style="padding:12px">
          <div><strong>${esc(i.name)}</strong> · ${Number(i.qty).toString()} ${esc(i.unit||'')}</div>
          ${i.suggestion?`<div style="margin-top:6px">Vai da <strong>${esc(i.suggestion.store)}</strong><br>${esc(i.suggestion.product)} · €${Number(i.suggestion.price).toFixed(2)}${typeof i.suggestion.unit_price==='number'?' ('+i.suggestion.unit_price+' €/unità)':''}</div>`:`<div style="margin-top:6px;color:#888">Nessuna offerta</div>`}
        </div>
      `).join('')}
    </div>
  `)
}

function renderPlansView(){
  const app=el('#app')
  html(app, `
    <h2>Piani</h2>
    <table>
      <thead><tr><th>Funzione</th><th>Demo</th><th>Starter</th><th>Premium</th></tr></thead>
      <tbody>
        <tr><td>Ricette complete</td><td>20</td><td>Tutte</td><td>Tutte</td></tr>
        <tr><td>Filtri tag AND</td><td>No</td><td>Sì</td><td>Sì</td></tr>
        <tr><td>Suggerisci ricette</td><td>No</td><td>Sì</td><td>Sì</td></tr>
        <tr><td>OCR</td><td>No</td><td>Base</td><td>Avanzato</td></tr>
        <tr><td>Spesa intelligente</td><td>No</td><td>Base</td><td>Pro</td></tr>
        <tr><td>Piani pasto</td><td>No</td><td>No</td><td>Sì</td></tr>
        <tr><td>Fit Hub Pro like</td><td>No</td><td>No</td><td>Sì</td></tr>
      </tbody>
    </table>
  `)
}

function downloadJSON(filename,obj){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'})
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click()
  setTimeout(()=>URL.revokeObjectURL(a.href),1000)
}
function exportMergedRecipes(){
  const file = PATHS.recipes || 'assets/json/recipes-it.json'
  loadJSON(file).then(base=>{
    const user=loadUserRecipes()
    const merged={...base, recipes:[...(base.recipes||[]), ...user]}
    downloadJSON('recipes-it.updated.json', merged)
  })
}

async function bootstrap(){
  const v=el('#app-version'); if(v) v.textContent=APP_VERSION
  const nR=el('#nav-recipes'), nL=el('#nav-lista'), nS=el('#nav-spesa'), nP=el('#nav-piani')
  if(nR) nR.addEventListener('click',renderRecipesView)
  if(nL) nL.addEventListener('click',renderListView)
  if(nS) nS.addEventListener('click',renderSmartView)
  if(nP) nP.addEventListener('click',renderPlansView)
  const b=el('#btn-refresh'); if(b) b.addEventListener('click',()=>location.reload())
  await renderRecipesView()
}
bootstrap()
