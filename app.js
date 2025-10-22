// app.js v10 — preferiti, export, paginazione, video YouTube, verifica link
const RECIPES_URL = 'assets/json/recipes-it.json'
const VOCAB_URL   = 'assets/json/ingredients-it.json'
const PAGE_SIZE = 8

const qs = s => document.querySelector(s)
const qsa = s => Array.from(document.querySelectorAll(s))
const gtagSafe = (...args)=>{ try{ window.gtag && window.gtag(...args) }catch{} }

const ALLOWED_RECIPE_DOMAINS = [
  'ricette.giallozafferano.it',
  'www.giallozafferano.it',
  'blog.giallozafferano.it',
  'www.fattoincasadabenedetta.it',
  'www.cucchiaio.it',
  'www.misya.info',
  'www.lacucinaitaliana.it',
  'www.youtube.com',
  'youtu.be'
]

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
  listCopy: qs('#listCopy'), listPaste: qs('#listPaste'), listTxt: qs('#listTxt'), listCsv: qs('#listCsv'),
  btnLoadMore: qs('#btnLoadMore'), btnFavsOnly: qs('#btnFavsOnly'),
}

ui.year && (ui.year.textContent = new Date().getFullYear())

let ALL = []
let TAGS = []
let LIST = loadList()
let VOCAB = new Set()
let DETECTED = new Set()
let FAVS = loadFavs()
let SHOW_FAVS_ONLY = false
let PAGE = 1

initTabs()
initFilters()
initList()
initCookies()
initGenerator()
initPaging()
await loadData()

async function loadData(){
  const [recipes, vocab] = await Promise.all([fetchJSON(RECIPES_URL), fetchJSON(VOCAB_URL)])
  ALL = Array.isArray(recipes) ? recipes : (recipes.recipes || [])
  const vocabList = Array.isArray(vocab) ? vocab : (vocab.words || vocab.ingredients || [])
  VOCAB = new Set((vocabList||[]).map(normalizeItem))
  renderTags()
  render(true)
}
async function fetchJSON(url){
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`)
  return res.json()
}

function toTags(r){
  return normalizeArray(r?.tags).map(v=>{
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') return firstString(v, ['name','title','tag','label','value'])
    return ''
  }).filter(Boolean)
}
function toIngredients(r){
  return normalizeArray(r?.ingredients).map(v=>{
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') return firstString(v, ['name','ingredient','title','value','label','item','text'])
    return ''
  }).filter(Boolean)
}
function imageSrc(r){
  const raw = r?.image || r?.img || r?.images || null
  const list = normalizeArray(raw).map(v=>{
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') return firstString(v, ['src','url','path'])
    return ''
  }).filter(Boolean)
  return list[0] || 'assets/icons/shortcut-96.png'
}
function isYouTubeUrl(u){
  try { const url = new URL(u); return url.hostname === 'www.youtube.com' || url.hostname === 'youtu.be' } catch { return false }
}
function getYouTubeId(u){
  try {
    const url = new URL(u)
    if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] || ''
    if (url.hostname === 'www.youtube.com'){
      if (url.pathname === '/watch') return url.searchParams.get('v') || ''
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || ''
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] || ''
    }
    return ''
  } catch { return '' }
}
function normalizeVideo(r){
  const v = r.video || ''
  if (typeof v === 'string' && v.trim()){
    return v.includes('http') ? getYouTubeId(v) : v.trim()
  }
  if (r.url && isYouTubeUrl(r.url)) return getYouTubeId(r.url)
  return ''
}
function isLikelyRecipeUrl(u){
  try {
    const url = new URL(u)
    if (!ALLOWED_RECIPE_DOMAINS.includes(url.hostname)) return false
    if (isYouTubeUrl(u)) return true
    const p = url.pathname.toLowerCase()
    return p.includes('/ricette') || p.includes('ricetta') || p.includes('/ricetta/') || p.endsWith('.html')
  } catch { return false }
}
function normalizeArray(x){
  if (!x) return []
  if (!Array.isArray(x)) return [x]
  const out = []
  const stack = [...x]
  while (stack.length){
    const v = stack.shift()
    if (Array.isArray(v)) stack.push(...v)
    else out.push(v)
  }
  return out
}
function firstString(obj, keys){
  for (const k of keys){ if (typeof obj[k] === 'string' && obj[k].trim()) return obj[k] }
  for (const v of Object.values(obj)){ if (typeof v === 'string' && v.trim()) return v }
  return ''
}

function filteredList(){
  const term = (ui.q?.value || '').trim().toLowerCase()
  const tmax = parseInt(ui.t?.value || '0', 10)
  const diet = ui.d?.value || ''
  return ALL.filter(r => {
    if (SHOW_FAVS_ONLY && !isFav(r)) return false
    const tags = toTags(r)
    const ingredients = toIngredients(r)
    const byText = !term || r.title.toLowerCase().includes(term) || ingredients.join(',').toLowerCase().includes(term) || tags.join(',').toLowerCase().includes(term)
    const byTime = !tmax || (toNumber(r.time) <= tmax)
    const byDiet = !diet || (normalize(r.diet) === diet)
    return byText && byTime && byDiet
  })
}

function render(resetPage=false){
  if (resetPage) PAGE = 1
  const list = filteredList()
  const upto = list.slice(0, PAGE*PAGE_SIZE)
  ui.grid.innerHTML = upto.map(cardRecipe).join('')
  ui.empty.classList.toggle('hidden', upto.length > 0)
  ui.btnLoadMore.classList.toggle('hidden', upto.length >= list.length)
  attachCardHandlers()
}

function renderTags(){
  const set = new Set()
  ALL.forEach(r => toTags(r).forEach(t => t && set.add(t)))
  TAGS = [...set].slice(0, 20)
  ui.quickTags.innerHTML = TAGS.map(t => `<button class="pill" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join('')
  ui.quickTags.onclick = e => {
    const tag = e.target?.dataset?.tag
    if (!tag) return
    ui.q.value = tag
    render(true)
  }
}

function cardRecipe(r){
  const mins = toNumber(r.time)
  const ing = toIngredients(r).slice(0,6).map(escapeHtml).join(', ')
  const tags = toTags(r).slice(0,3).map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(' ')
  const img = imageSrc(r)
  const shareTxt = encodeURIComponent(`Ricetta: ${r.title}\nIngredienti: ${toIngredients(r).join(', ')}`)
  const shareUrl = `https://wa.me/?text=${shareTxt}`
  const fav = isFav(r)
  const rid = escapeHtml(r.id || r.title || '')
  const ytId = normalizeVideo(r)
  const hasVideo = !!ytId
  const hasUrl = !!r.url
  const verified = hasUrl ? isLikelyRecipeUrl(r.url) : false

  return `
    <article class="card" data-id="${rid}" data-title="${escapeHtml(r.title)}">
      <div class="imgbox"><img src="${escapeAttr(img)}" alt="${escapeAttr(r.title)}" loading="lazy" onerror="this.src='assets/icons/shortcut-96.png'"></div>
      <h3>${escapeHtml(r.title)}</h3>
      <div class="muted">${mins ? mins + ' min' : 'Tempo n.d.'} · ${escapeHtml(prettyDiet(r.diet))}</div>
      <p class="muted">${ing}</p>
      <div>${tags}</div>
      <div class="toolbar" style="margin-top:10px">
        <button class="btn btn-add">Aggiungi ingredienti</button>
        <a class="btn" href="${shareUrl}" target="_blank" rel="noopener">Condividi</a>
        ${hasUrl ? `<a class="btn" href="${escapeAttr(r.url)}" target="_blank" rel="noopener">${verified ? 'Apri ricetta' : 'Apri link (non verificato)'}</a>` : ``}
        ${hasVideo ? `<button class="btn btn-video" data-yt="${ytId}">Guarda video</button>` : ``}
        <button class="btn btn-fav" aria-pressed="${fav}">${fav ? '★ Preferito' : '☆ Preferito'}</button>
      </div>
      ${hasVideo ? `
        <div class="video-wrap hidden" style="margin-top:10px;aspect-ratio:16/9;border:1px solid #e3ece7;border-radius:12px;overflow:hidden">
          <iframe src="https://www.youtube.com/embed/${ytId}" title="Video ricetta" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen style="width:100%;height:100%;border:0"></iframe>
        </div>
      ` : ``}
    </article>
  `
}
function attachCardHandlers(){
  qsa('.btn.btn-add').forEach(btn=>{
    btn.onclick = e=>{
      const card = e.target.closest('.card')
      const id = card?.dataset?.id || ''
      const rec = ALL.find(x => (x.id||x.title||'')===id) || pickByTitle(card?.dataset?.title||'')
      if (!rec) return
      const items = toIngredients(rec).map(normalizeItem)
      addToList(items)
      gtagSafe('event','add_to_list',{item_count:items.length})
      toast('Ingredienti aggiunti')
    }
  })
  qsa('.btn.btn-fav').forEach(btn=>{
    btn.onclick = e=>{
      const card = e.target.closest('.card')
      const id = card?.dataset?.id || ''
      toggleFav(id)
      e.target.setAttribute('aria-pressed', String(isFavId(id)))
      e.target.textContent = isFavId(id) ? '★ Preferito' : '☆ Preferito'
      gtagSafe('event','toggle_favorite',{id})
    }
  })
  qsa('.btn.btn-video').forEach(btn=>{
    btn.onclick = e=>{
      const card = e.target.closest('.card')
      const box = card.querySelector('.video-wrap')
      if (!box) return
      box.classList.toggle('hidden')
      gtagSafe('event','open_video',{id: btn.dataset.yt})
    }
  })
}

function initFilters(){
  ui.q?.addEventListener('input', ()=>render(true))
  ui.t?.addEventListener('change', ()=>render(true))
  ui.d?.addEventListener('change', ()=>render(true))
  ui.reset?.addEventListener('click', ()=>{
    ui.q.value = ''
    ui.t.value = ''
    ui.d.value = ''
    SHOW_FAVS_ONLY = false
    ui.btnFavsOnly.setAttribute('aria-pressed','false')
    render(true)
  })
  ui.btnFavsOnly?.addEventListener('click', ()=>{
    SHOW_FAVS_ONLY = !SHOW_FAVS_ONLY
    ui.btnFavsOnly.setAttribute('aria-pressed', String(SHOW_FAVS_ONLY))
    render(true)
  })
}
function initPaging(){
  ui.btnLoadMore?.addEventListener('click', ()=>{
    PAGE += 1
    render(false)
    gtagSafe('event','load_more',{page:PAGE})
  })
}

function initTabs(){
  const setTab = (name)=>{
    const map = { ricette: ui.ricetteSec, generatore: ui.genSec, lista: ui.listaSec }
    for (const k in map){ map[k].classList.toggle('hidden', k!==name) }
    ui.tabRicette.setAttribute('aria-pressed', String(name==='ricette'))
    ui.tabGeneratore.setAttribute('aria-pressed', String(name==='generatore'))
    ui.tabLista.setAttribute('aria-pressed', String(name==='lista'))
  }
  ui.tabRicette.onclick = ()=> setTab('ricette')
  ui.tabGeneratore.onclick = ()=> setTab('generatore')
  ui.tabLista.onclick = ()=> setTab('lista')
  setTab('ricette')
}

function initGenerator(){
  const onPick = async (file) => {
    if (!file || !ui.ocrStatus) return
    ui.ocrStatus.textContent = 'elaborazione...'
    try {
      const { Tesseract } = window
      if (!Tesseract) throw new Error('Tesseract non caricato')
      const res = await Tesseract.recognize(file, 'ita', { workerPath: 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js', langPath: 'https://tessdata.projectnaptha.com/5' })
      const text = (res?.data?.text || '').trim()
      ui.ocrText.value = text
      ui.ocrStatus.textContent = text ? 'ok' : 'vuoto'
      gtagSafe('event','ocr_done',{chars:text.length})
    } catch { ui.ocrStatus.textContent = 'errore' }
  }
  ui.ocrFile?.addEventListener('change', e => onPick(e.target.files?.[0]))
  ui.ocrCamera?.addEventListener('change', e => onPick(e.target.files?.[0]))
  ui.genFromText?.addEventListener('click', ()=>{
    const items = splitGuess((ui.ocrText?.value||'') + ',' + (ui.genIngredients?.value||''))
    addDetected(items)
    gtagSafe('event','generator_add_from_text',{items:items.length})
  })
  ui.genClear?.addEventListener('click', ()=>{
    if (ui.ocrText) ui.ocrText.value = ''
    if (ui.genIngredients) ui.genIngredients.value = ''
    DETECTED = new Set()
    renderDetected()
    if (ui.genResults) ui.genResults.innerHTML = ''
    if (ui.ocrStatus) ui.ocrStatus.textContent = 'inattivo'
  })
  ui.genBtn?.addEventListener('click', ()=>{
    const want = Array.from(DETECTED)
    const diet = ui.genDiet?.value || ''
    const tmax = parseInt(ui.genTime?.value || '0', 10)
    const out = scoreMatches(ALL, want, diet, tmax).slice(0, 12)
    ui.genResults.innerHTML = out.map(cardRecipe).join('') || cardError('Nessuna proposta','Cambia ingredienti')
    attachCardHandlers()
    gtagSafe('event','generator_run',{want:want.length, results:out.length})
  })
}
function addDetected(items){
  items.forEach(x => {
    const n = normalizeItem(x)
    if (!n) return
    if (VOCAB.size === 0 || VOCAB.has(n)) DETECTED.add(n)
  })
  renderDetected()
}
function renderDetected(){
  if (!ui.normList) return
  ui.normList.innerHTML = Array.from(DETECTED).sort().map(x=>`<span class="pill">${escapeHtml(x)}</span>`).join('')
}

function scoreMatches(list, want, diet, tmax){
  const W = new Set(want.map(normalizeItem))
  return list
    .filter(r => !diet || normalize(r.diet)===diet)
    .filter(r => !tmax || toNumber(r.time) <= tmax)
    .map(r=>{
      const ing = toIngredients(r).map(normalizeItem)
      const have = ing.filter(x => W.has(x)).length
      const score = have*2 - (ing.length - have)
      return { r, score, have }
    })
    .sort((a,b)=> b.score - a.score || b.have - a.have)
    .map(x=>x.r)
}

function initList(){
  renderList()
  ui.listAdd?.addEventListener('click', ()=>{
    const raw = ui.listInput?.value.trim()
    if (!raw) return
    addToList(splitCSV(raw).map(normalizeItem))
    ui.listInput.value = ''
  })
  ui.listClear?.addEventListener('click', ()=>{
    LIST = []
    saveList()
    renderList()
  })
  ui.listItems?.addEventListener('click', e=>{
    const idx = e.target?.dataset?.idx
    if (typeof idx === 'undefined') return
    LIST.splice(Number(idx), 1)
    saveList()
    renderList()
  })
  ui.listCopy?.addEventListener('click', async ()=>{
    const text = LIST.join(', ')
    await navigator.clipboard.writeText(text).catch(()=>{})
    toast('Lista copiata')
  })
  ui.listPaste?.addEventListener('click', async ()=>{
    let text = ''
    try { text = await navigator.clipboard.readText() } catch {}
    if (!text) text = prompt('Incolla la lista separata da virgola o nuova riga') || ''
    if (!text) return
    addToList(splitCSV(text).map(normalizeItem))
  })
  ui.listTxt?.addEventListener('click', ()=> downloadFile('lista-spesa.txt', LIST.join('\n')))
  ui.listCsv?.addEventListener('click', ()=> downloadFile('lista-spesa.csv', 'prodotto\n' + LIST.map(x=>csvCell(x)).join('\n')))
}
function downloadFile(name, content){
  const blob = new Blob([content], {type:'text/plain'})
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a); a.click(); a.remove()
}

function addToList(items){
  for (const it of items){
    if (!it) continue
    if (!LIST.includes(it)) LIST.push(it)
  }
  saveList()
  renderList()
}
function renderList(){
  if (!ui.listItems) return
  if (!LIST.length){
    ui.listItems.innerHTML = `<p class="muted">Lista vuota.</p>`
    return
  }
  ui.listItems.innerHTML = LIST.map((x,i)=>`
    <div class="row" style="justify-content:space-between;padding:6px 0;border-bottom:1px dashed #cfe3d9">
      <span>${escapeHtml(x)}</span>
      <button class="btn" data-idx="${i}">Rimuovi</button>
    </div>
  `).join('')
}
function loadList(){ try { return JSON.parse(localStorage.getItem('rls_list')||'[]') } catch { return [] } }
function saveList(){ localStorage.setItem('rls_list', JSON.stringify(LIST)) }

function loadFavs(){ try { return new Set(JSON.parse(localStorage.getItem('rls_favs')||'[]')) } catch { return new Set() } }
function saveFavs(){ localStorage.setItem('rls_favs', JSON.stringify(Array.from(FAVS))) }
function idOf(r){ return r.id || r.title || '' }
function isFav(r){ return FAVS.has(idOf(r)) }
function isFavId(id){ return FAVS.has(id) }
function toggleFav(id){ if (FAVS.has(id)) FAVS.delete(id); else FAVS.add(id); saveFavs() }

function initCookies(){
  const key = 'rls_cookie_ok'
  const ok = localStorage.getItem(key)
  ui.cookieBar?.classList.toggle('hidden', !!ok)
  ui.cookieAccept?.addEventListener('click', ()=>{ localStorage.setItem(key, '1'); ui.cookieBar.classList.add('hidden') })
  ui.cookieDecline?.addEventListener('click', ()=>{ localStorage.setItem(key, '0'); ui.cookieBar.classList.add('hidden') })
}

function toNumber(v){ if (typeof v==='number') return v; if (typeof v==='string'){ const m=v.match(/\d+/); return m?parseInt(m[0],10):0 } return 0 }
function prettyDiet(d){ const n=normalize(d); if(n==='vegetariano')return'Vegetariano'; if(n==='vegano')return'Vegano'; if(n==='senza_glutine')return'Senza glutine'; return'Onnivoro' }
function normalize(v){ return String(v||'').toLowerCase().replace(/\s+/g,'_') }
function normalizeItem(v){ return String(v||'').toLowerCase().trim().replace(/\s+/g,' ') }
function splitCSV(s){ return String(s||'').split(/[,\n;]/).map(x=>x.trim()).filter(Boolean) }
function splitGuess(s){
  return String(s||'').toLowerCase()
    .replace(/[^a-zàèéìòóùçœ\s,;\n]/g,' ')
    .split(/[,\n;]/).flatMap(x=>x.split(/\s{2,}/))
    .map(x=>x.trim()).filter(Boolean)
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;') }
function pickByTitle(t){ return ALL.find(x => (x.title||'').toLowerCase() === String(t||'').toLowerCase()) }
function cardError(title, msg){ return `<article class="card"><h3>${escapeHtml(title)}</h3><p class="muted">${escapeHtml(msg)}</p></article>` }
function csvCell(s){ return `"${String(s).replace(/"/g,'""')}"` }
function toast(msg){
  const el = document.createElement('div')
  el.textContent = msg
  el.style.position='fixed'
  el.style.bottom='18px'
  el.style.left='50%'
  el.style.transform='translateX(-50%)'
  el.style.background='#0f1614'
  el.style.color='#d8ede6'
  el.style.padding='10px 14px'
  el.style.border='1px solid #cfe3d9'
  el.style.borderRadius='12px'
  el.style.zIndex='60'
  document.body.appendChild(el)
  setTimeout(()=> el.remove(), 1500)
}
