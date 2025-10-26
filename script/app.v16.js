/* =======================
   Stato, utils, versione
======================= */
const $ = s => document.querySelector(s)
const ver = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev'
const $ver = $('#app-version'); if ($ver) $ver.textContent = `v${ver}`

const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`
const FAV_KEY = 'recipe_favs_v1'

const state = {
  q: '',                // query
  tags: new Set(),      // tag attivi
  onlyFav: false,       // filtro preferiti
  sort: 'relevance'     // relevance | time | title
}

let ALL_RECIPES = []
let FAVS = loadFavs()

function loadFavs(){
  try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')) }
  catch { return new Set() }
}
function saveFavs(){
  localStorage.setItem(FAV_KEY, JSON.stringify([...FAVS]))
}

/* =======================
   Fetch e bootstrap
======================= */
async function fetchRecipes(){
  const res = await fetch(DATA_URL, { cache:'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/* =======================
   YouTube helper
======================= */
function getYouTubeId(r){
  if (!r) return ''
  if (r.youtubeId) return String(r.youtubeId).trim()
  if (r.ytid) return String(r.ytid).trim()
  if (r.videoId) return String(r.videoId).trim()
  if (r.video){
    const m = String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/)
    if (m) return m[1]
  }
  return ''
}

/* =======================
   URL ↔ stato
======================= */
function readStateFromURL(){
  const p = new URLSearchParams(location.search)
  state.q = p.get('q') || ''
  state.onlyFav = p.get('fav') === '1'
  state.sort = p.get('sort') || 'relevance'
  state.tags = new Set((p.get('tags') || '').split(',').filter(Boolean))
  // UI
  $('#search').value = state.q
  $('#only-fav').checked = state.onlyFav
  $('#sort').value = state.sort
}
function writeStateToURL(){
  const p = new URLSearchParams()
  if (state.q) p.set('q', state.q)
  if (state.onlyFav) p.set('fav','1')
  if (state.sort && state.sort !== 'relevance') p.set('sort', state.sort)
  if (state.tags.size) p.set('tags', [...state.tags].join(','))
  history.replaceState(null, '', `${location.pathname}?${p.toString()}`)
}

/* =======================
   Tag toolbar
======================= */
function collectAllTags(list){
  const set = new Set()
  for (const r of list){
    if (Array.isArray(r.tags)) r.tags.forEach(t => set.add(String(t)))
  }
  return [...set].sort((a,b)=>a.localeCompare(b))
}
function renderTagsToolbar(allTags){
  const box = $('#tags'); if (!box) return
  box.innerHTML = allTags.map(t => `
    <button class="chip ${state.tags.has(t) ? 'active' : ''}" data-tag="${t}">${t}</button>
  `).join('')
}
function bindTagsToolbar(){
  const box = $('#tags'); if (!box) return
  box.addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return
    const t = b.dataset.tag
    if (state.tags.has(t)) state.tags.delete(t); else state.tags.add(t)
    b.classList.toggle('active')
    writeStateToURL()
    applyAndRender()
  })
}

/* =======================
   Filtri e ordinamento
======================= */
function matchesQuery(r, q){
  if (!q) return true
  const hay = [
    r.title,
    ...(r.tags||[]),
    ...(r.ingredients||[]).map(i=>i.ref)
  ].filter(Boolean).join(' ').toLowerCase()
  return hay.includes(q.toLowerCase())
}
function matchesTags(r){
  if (!state.tags.size) return true
  const t = new Set(r.tags||[])
  for (const x of state.tags) if (!t.has(x)) return false
  return true
}
function applyFilters(list){
  return list.filter(r => {
    if (state.onlyFav && !FAVS.has(r.id)) return false
    if (!matchesQuery(r, state.q)) return false
    if (!matchesTags(r)) return false
    return true
  })
}
function sortList(list){
  if (state.sort === 'time') return list.slice().sort((a,b)=> (a.time||9999)-(b.time||9999))
  if (state.sort === 'title') return list.slice().sort((a,b)=> String(a.title||'').localeCompare(String(b.title||'')))
  return list // relevance = ordine originale
}

/* =======================
   Render ricette + UI
======================= */
function updateResultsCount(n){
  const el = $('#results-count'); if (el) el.textContent = `${n} risultati`
}

function recipeCard(r){
  const yid = getYouTubeId(r)
  const img = r.image || 'assets/icons/icon-512.png'
  const tags = Array.isArray(r.tags) ? r.tags.join(' · ') : ''
  const favOn = FAVS.has(r.id)
  return `
  <article class="card" data-id="${r.id}">
    <img src="${img}" alt="${r.title||''}" loading="lazy">
    <div style="flex:1">
      <h3 class="title">${r.title||'Senza titolo'}</h3>
      <p class="meta">
        ${r.time ? `${r.time} min` : ''}${r.servings ? ` · ${r.servings} porz.` : ''}${tags ? ` · ${tags}` : ''}
      </p>
      <div class="actions">
        <button class="fav ${favOn ? 'active':''}" title="Preferito" aria-label="Preferito">${favOn ? '★':'☆'}</button>
        ${r.url ? `<a class="btn-recipe" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>` : `<button disabled class="btn-recipe" title="Fonte mancante">Ricetta</button>`}
        ${yid ? `<button class="btn-video" data-youtube-id="${yid}">Guarda video</button>` : `<button class="btn-video" disabled title="Video non disponibile">Guarda video</button>`}
      </div>
    </div>
  </article>`
}

function render(list){
  const root = $('#recipes'); if (!root) return
  root.innerHTML = list.map(recipeCard).join('')
  updateResultsCount(list.length)
}

function bindCardActions(){
  const root = $('#recipes'); if (!root) return
  root.addEventListener('click', e => {
    const favBtn = e.target.closest('.fav')
    if (favBtn){
      const id = e.target.closest('.card').dataset.id
      if (FAVS.has(id)) FAVS.delete(id); else FAVS.add(id)
      saveFavs()
      favBtn.classList.toggle('active')
      favBtn.textContent = favBtn.classList.contains('active') ? '★' : '☆'
      if (state.onlyFav) applyAndRender()
      return
    }
    const vb = e.target.closest('.btn-video')
    if (vb){
      e.preventDefault()
      const id = vb.dataset.youtubeId || ''
      if (id) openVideo(id)
    }
  })
}

/* =======================
   Video modal con fallback
======================= */
const modal = $('#video-modal')
const frame = $('#yt-frame')
const closeBtn = $('#video-close')
const ORIGIN = location.origin
let videoTimer = null

function openVideo(id){
  if (!modal || !frame) return window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener')
  try { frame.onload = null; frame.onerror = null } catch {}
  if (videoTimer){ clearTimeout(videoTimer); videoTimer = null }
  frame.src = 'about:blank'
  modal.style.display = 'flex'
  document.body.style.overflow = 'hidden'
  const url = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=${encodeURIComponent(ORIGIN)}`
  let loaded = false
  frame.onload = ()=>{ loaded = true }
  frame.onerror = ()=>{ if (!loaded){ closeVideo(); window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener') } }
  videoTimer = setTimeout(()=>{ if (!loaded){ closeVideo(); window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener') } }, 1500)
  frame.src = url
}
function closeVideo(){
  if (!modal || !frame) return
  if (videoTimer){ clearTimeout(videoTimer); videoTimer = null }
  frame.src = 'about:blank'
  modal.style.display = 'none'
  document.body.style.overflow = ''
}
if (closeBtn) closeBtn.addEventListener('click', closeVideo)
window.addEventListener('keydown', e => { if (e.key === 'Escape') closeVideo() })
modal?.addEventListener('click', e => { if (e.target === modal) closeVideo() })

/* =======================
   UI bindings
======================= */
function bindUI(){
  $('#search')?.addEventListener('input', () => {
    state.q = $('#search').value.trim()
    writeStateToURL()
    applyAndRender()
  })
  $('#only-fav')?.addEventListener('change', () => {
    state.onlyFav = $('#only-fav').checked
    writeStateToURL()
    applyAndRender()
  })
  $('#sort')?.addEventListener('change', () => {
    state.sort = $('#sort').value
    writeStateToURL()
    applyAndRender()
  })
  $('#refresh')?.addEventListener('click', async () => {
    const btn = $('#refresh')
    btn.disabled = true; btn.textContent = 'Aggiorno…'
    try {
      ALL_RECIPES = await fetchRecipes()
      initTags()      // rigenera la toolbar tag
      applyAndRender()
    } catch(e){
      alert('Errore aggiornamento: '+e.message)
    } finally {
      btn.disabled = false; btn.textContent = 'Aggiorna dati'
    }
  })
}

function applyAndRender(){
  const filtered = applyFilters(ALL_RECIPES)
  const sorted = sortList(filtered)
  render(sorted)
}

/* =======================
   Tag bootstrap
======================= */
function initTags(){
  const all = collectAllTags(ALL_RECIPES)
  renderTagsToolbar(all)
  bindTagsToolbar()
}

/* =======================
   Avvio
======================= */
;(async function init(){
  try{
    readStateFromURL()
    ALL_RECIPES = await fetchRecipes()
    initTags()
    bindUI()
    render(sortList(applyFilters(ALL_RECIPES)))
    bindCardActions()
  }catch(e){
    console.error(e)
    const root = $('#recipes'); if (root) root.innerHTML = `<p style="padding:14px">Errore caricamento dati: ${e.message}</p>`
  }
})()

/* =======================
   Service Worker (solo GitHub Pages)
======================= */
if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')){
  window.addEventListener('load', async () => {
    try{
      const sw = `service-worker.js?v=${encodeURIComponent(ver)}`
      const reg = await navigator.serviceWorker.register(sw)
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing
        nw?.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller){
            setTimeout(()=>location.reload(), 400)
          }
        })
      })
    }catch(e){
      console.warn('[SW]', e)
    }
  })
}
