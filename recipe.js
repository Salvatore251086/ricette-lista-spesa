// recipe.js v15 — dettaglio ricetta con schema.org, preferiti, lista, video nocookie

const RECIPES_URL = 'assets/json/recipes-it.json?v=15'

const qs = s => document.querySelector(s)
const qsa = s => Array.from(document.querySelectorAll(s))

const ui = {
  title: qs('#rTitle'),
  year: qs('#year'),
  meta: qs('#meta'),
  img: qs('#rImg'),
  tags: qs('#tags'),
  ing: qs('#ingList'),
  steps: qs('#steps'),
  srcBtn: qs('#btnSource'),
  addAll: qs('#btnAddAll'),
  fav: qs('#btnFav'),
  vwrap: qs('#videoWrap'),
  yt: qs('#yt')
}

ui.year && (ui.year.textContent = new Date().getFullYear())

let LIST = loadList()
let FAVS = loadFavs()
let RECIPE = null

const id = new URL(location.href).searchParams.get('id') || ''

start()

async function start(){
  const all = await fetchJSON(RECIPES_URL)
  const list = Array.isArray(all) ? all : (all.recipes || [])
  const byId = list.find(r => (r.id || '').toLowerCase() === id.toLowerCase())
  if (!byId){
    renderNotFound()
    return
  }
  RECIPE = byId
  renderRecipe(byId)
  wireActions()
}

function renderNotFound(){
  ui.title.textContent = 'Ricetta non trovata'
  ui.meta.textContent = ''
  ui.tags.innerHTML = ''
  ui.ing.innerHTML = ''
  ui.steps.innerHTML = ''
  ui.srcBtn.style.display = 'none'
  ui.addAll.style.display = 'none'
  ui.fav.style.display = 'none'
  ui.vwrap.style.display = 'none'
}

function renderRecipe(r){
  ui.title.textContent = r.title || 'Ricetta'
  ui.meta.textContent = metaText(r)
  ui.img.src = imageSrc(r)
  ui.img.alt = r.title || 'Ricetta'
  ui.tags.innerHTML = toTags(r).map(t => `<span class="pill">${escapeHtml(t)}</span>`).join('')
  ui.ing.innerHTML = toIngredientsPretty(r).map(x => `<li>${escapeHtml(x)}</li>`).join('')
  ui.steps.innerHTML = toSteps(r).map(x => `<li>${escapeHtml(x)}</li>`).join('')

  const url = r.url || ''
  if (url){
    ui.srcBtn.href = url
    ui.srcBtn.style.display = 'inline-block'
  } else {
    ui.srcBtn.style.display = 'none'
  }

  const favNow = isFav(idOf(r))
  ui.fav.setAttribute('aria-pressed', String(favNow))
  ui.fav.textContent = favNow ? '★ Preferito' : '☆ Preferito'

  const ytId = normalizeVideo(r)
  if (ytId){
    ui.vwrap.style.display = 'block'
    ui.yt.src = `https://www.youtube-nocookie.com/embed/${ytId}`
  } else {
    ui.vwrap.style.display = 'none'
  }

  injectJSONLD(r, ytId)
}

function wireActions(){
  ui.addAll.addEventListener('click', ()=>{
    const items = toIngredientsRefs(RECIPE)
    addToList(items)
    toast('Ingredienti aggiunti')
  })
  ui.fav.addEventListener('click', ()=>{
    const rid = idOf(RECIPE)
    toggleFav(rid)
    const now = isFav(rid)
    ui.fav.setAttribute('aria-pressed', String(now))
    ui.fav.textContent = now ? '★ Preferito' : '☆ Preferito'
  })
}

async function fetchJSON(url){
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

function metaText(r){
  const t = toNumber(r.time)
  const s = toNumber(r.servings)
  const d = prettyDiet(r.diet)
  const parts = []
  parts.push(t ? `${t} min` : 'Tempo n.d.')
  if (s) parts.push(`${s} porzioni`)
  if (d) parts.push(d)
  return parts.join(' · ')
}

/* Normalizzazioni */

function toTags(r){
  const raw = r?.tags
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  return arr.map(x => typeof x === 'string' ? x : firstString(x, ['name','title','label','tag','value'])).filter(Boolean)
}

function toIngredientsPretty(r){
  const raw = r?.ingredients
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  return arr.map(v=>{
    if (typeof v === 'string') return v
    const name = firstString(v, ['ref','name','ingredient','title','value','label','item','text'])
    const qty = v.qty != null ? String(v.qty).trim() : ''
    const unit = v.unit ? String(v.unit).trim() : ''
    const pretty = String(name || '').replace(/[-_]/g,' ').trim()
    if (qty && unit) return `${qty} ${unit} ${pretty}`
    if (qty) return `${qty} ${pretty}`
    return pretty
  }).filter(Boolean)
}

function toIngredientsRefs(r){
  const raw = r?.ingredients
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  return arr.map(v=>{
    if (typeof v === 'string') return normalizeItem(v)
    const name = firstString(v, ['ref','name','ingredient','title','value','label','item','text'])
    return normalizeItem(name)
  }).filter(Boolean)
}

function toSteps(r){
  const raw = r?.steps
  const arr = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  return arr.map(x => typeof x === 'string' ? x : firstString(x, ['text','step','instruction'])).filter(Boolean)
}

function imageSrc(r){
  const raw = r?.image || r?.img || r?.images || null
  const list = Array.isArray(raw) ? raw : (raw ? [raw] : [])
  const urls = list.map(v=>{
    if (typeof v === 'string') return v
    if (v && typeof v === 'object') return firstString(v, ['src','url','path'])
    return ''
  }).filter(Boolean)
  return urls[0] || 'assets/icons/shortcut-96.png'
}

function isYouTubeUrl(u){
  try {
    const url = new URL(u)
    return url.hostname === 'www.youtube.com' || url.hostname === 'youtu.be'
  } catch { return false }
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

/* JSON-LD Recipe */

function injectJSONLD(r, ytId){
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    'name': r.title || '',
    'image': imageSrc(r),
    'recipeIngredient': toIngredientsPretty(r),
    'recipeInstructions': toSteps(r).map(t => ({ '@type': 'HowToStep', 'text': t })),
    'totalTime': r.time ? `PT${toNumber(r.time)}M` : undefined,
    'recipeCategory': toTags(r),
    'recipeYield': r.servings ? String(r.servings) : undefined,
    'video': ytId ? {
      '@type': 'VideoObject',
      'name': r.title || 'Video ricetta',
      'embedUrl': `https://www.youtube-nocookie.com/embed/${ytId}`
    } : undefined
  }
  // pulizia undefined
  Object.keys(ld).forEach(k => ld[k] === undefined && delete ld[k])

  let el = document.getElementById('ld-recipe')
  if (!el){
    el = document.createElement('script')
    el.type = 'application/ld+json'
    el.id = 'ld-recipe'
    document.head.appendChild(el)
  }
  el.textContent = JSON.stringify(ld)
}

/* Lista e preferiti */

function loadList(){ try { return JSON.parse(localStorage.getItem('rls_list') || '[]') } catch { return [] } }
function saveList(){ localStorage.setItem('rls_list', JSON.stringify(LIST)) }
function addToList(items){
  for (const it of items){
    if (!it) continue
    if (!LIST.includes(it)) LIST.push(it)
  }
  saveList()
}
function loadFavs(){ try { return new Set(JSON.parse(localStorage.getItem('rls_favs') || '[]')) } catch { return new Set() } }
function saveFavs(){ localStorage.setItem('rls_favs', JSON.stringify(Array.from(FAVS))) }
function idOf(r){ return r?.id || '' }
function isFav(id){ return FAVS.has(id) }
function toggleFav(id){
  if (!id) return
  if (FAVS.has(id)) FAVS.delete(id)
  else FAVS.add(id)
  saveFavs()
}

/* Utilità */

function firstString(obj, keys){
  for (const k of keys){ if (obj && typeof obj[k] === 'string' && obj[k].trim()) return obj[k] }
  for (const v of Object.values(obj || {})){ if (typeof v === 'string' && v.trim()) return v }
  return ''
}
function toNumber(v){
  if (typeof v === 'number') return v
  if (typeof v === 'string'){
    const m = v.match(/\d+/)
    return m ? parseInt(m[0], 10) : 0
  }
  return 0
}
function prettyDiet(d){
  const n = String(d || '').toLowerCase().replace(/\s+/g,'_')
  if (n === 'vegetariano') return 'Vegetariano'
  if (n === 'vegano') return 'Vegano'
  if (n === 'senza_glutine') return 'Senza glutine'
  return 'Onnivoro'
}
function normalizeItem(v){
  return String(v || '')
    .toLowerCase()
    .replace(/[-_]/g,' ')
    .trim()
    .replace(/\s+/g,' ')
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }
function toast(msg){
  const el = document.createElement('div')
  el.textContent = msg
  el.style.position = 'fixed'
  el.style.bottom = '18px'
  el.style.left = '50%'
  el.style.transform = 'translateX(-50%)'
  el.style.background = '#0f1614'
  el.style.color = '#d8ede6'
  el.style.padding = '10px 14px'
  el.style.border = '1px solid #cfe3d9'
  el.style.borderRadius = '12px'
  el.style.zIndex = '60'
  document.body.appendChild(el)
  setTimeout(()=> el.remove(), 1500)
}
