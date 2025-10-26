/* script/app.v16.js – tag, preferiti, video, stato in URL + sort + counter */

/* Utils */
const $  = sel => document.querySelector(sel)
const $$ = sel => Array.from(document.querySelectorAll(sel))
const ver = window.APP_VERSION || 'vdev'
const $ver = $('#app-version')
if ($ver) $ver.textContent = ver

/* Dataset */
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`
async function fetchRecipes() {
  const res = await fetch(DATA_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/* Preferiti */
const FAV_KEY = 'rls:favs'
const loadFavs  = () => { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')) } catch { return new Set() } }
const saveFavs  = (set) => localStorage.setItem(FAV_KEY, JSON.stringify(Array.from(set)))

/* YouTube ID */
function getYouTubeId(r) {
  if (!r) return ''
  if (r.youtubeId) return String(r.youtubeId).trim()
  if (r.ytid)      return String(r.ytid).trim()
  if (r.videoId)   return String(r.videoId).trim()
  if (r.video) {
    const m = String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/)
    if (m) return m[1]
  }
  return ''
}

/* Stato UI */
const state = {
  query: '',
  tags: new Set(),
  onlyFavs: false,
  sort: 'relevance',
  favs: loadFavs()
}

/* URL <-> Stato: q, tags, favs=1, sort=... */
function readStateFromURL() {
  const p = new URLSearchParams(location.search)
  const q = (p.get('q') || '').trim()
  const tags = (p.get('tags') || '').split(',').map(s=>s.trim()).filter(Boolean)
  const favs = p.get('favs') === '1'
  const sort = p.get('sort') || 'relevance'
  return { q, tags, favs, sort }
}
function writeStateToURL() {
  const p = new URLSearchParams(location.search)
  const q = state.query.trim()
  const tags = Array.from(state.tags)
  if (q) p.set('q', q) else p.delete('q')
  if (tags.length) p.set('tags', tags.join(',')) else p.delete('tags')
  if (state.onlyFavs) p.set('favs','1') else p.delete('favs')
  if (state.sort && state.sort !== 'relevance') p.set('sort', state.sort) else p.delete('sort')
  history.replaceState(null, '', `${location.pathname}?${p.toString()}${location.hash}`)
}

/* Tag bar */
const uniqueTags = list => {
  const s = new Set()
  list.forEach(r => (r.tags || []).forEach(t => s.add(t)))
  return Array.from(s).sort((a,b)=>a.localeCompare(b))
}
function renderTagBar(list) {
  const host = $('#tagbar'); if (!host) return
  const tags = uniqueTags(list)
  const pills = ['Tutti', ...tags].map(tag => {
    const t = tag === 'Tutti' ? '' : tag
    const active = t ? state.tags.has(t) : state.tags.size === 0
    return `<button class="pill ${active ? 'active':''}" data-tag="${t}">${tag}</button>`
  })
  host.innerHTML = pills.join('')
}

/* Card */
function recipeCard(r) {
  const img = r.image || 'assets/icons/icon-512.png'
  const tags = Array.isArray(r.tags) ? r.tags.join(' · ') : ''
  const yid  = getYouTubeId(r)
  const favOn = state.favs.has(r.id)
  const favBtn = `<button class="btn-fav" data-id="${r.id}" aria-pressed="${favOn}">${favOn ? '★' : '☆'}</button>`
  const recipeBtn = r.url ? `<a class="btn-recipe" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>` : ''
  const videoBtn  = yid ? `<button class="btn-video" data-youtube-id="${yid}">Guarda video</button>`
                        : `<button class="btn-video" disabled title="Video non disponibile">Guarda video</button>`
  return `
    <article class="recipe-card" data-id="${r.id}">
      <img src="${img}" alt="${r.title || ''}" loading="lazy">
      <div class="body">
        <h3>${r.title || 'Senza titolo'}</h3>
        <p class="meta">${r.time ? `${r.time} min` : ''}${r.servings ? ` · ${r.servings} porz.` : ''}${tags ? ` · ${tags}` : ''}</p>
        <div class="actions">
          ${favBtn}
          ${recipeBtn}
          ${videoBtn}
        </div>
      </div>
    </article>
  `
}

/* Render lista + contatore */
function renderRecipes(list) {
  const wrap = $('#recipes'); if (!wrap) return
  wrap.innerHTML = list.length ? list.map(recipeCard).join('') : '<p>Nessuna ricetta trovata</p>'
  const rc = $('#result-count')
  if (rc) rc.textContent = `${list.length} ${list.length === 1 ? 'risultato' : 'risultati'}`
}

/* Ordinamento */
function sortRecipes(list, mode) {
  const arr = list.slice()
  switch (mode) {
    case 'title-az':
      arr.sort((a,b)=>(a.title||'').localeCompare(b.title||'')); break
    case 'title-za':
      arr.sort((a,b)=>(b.title||'').localeCompare(a.title||'')); break
    case 'time-asc':
      arr.sort((a,b)=>(Number(a.time)||9e9) - (Number(b.time)||9e9)); break
    case 'time-desc':
      arr.sort((a,b)=>(Number(b.time)||-9e9) - (Number(a.time)||-9e9)); break
    case 'relevance':
    default:
      break
  }
  return arr
}

/* Filtro + sort + render */
function applyFiltersAndRender(source) {
  let out = source
  if (state.tags.size > 0) {
    out = out.filter(r => (r.tags || []).some(t => state.tags.has(t)))
  }
  if (state.query) {
    const q = state.query.toLowerCase()
    out = out.filter(r => {
      const hay = [
        r.title,
        ...(r.tags || []),
        ...(r.ingredients || []).map(i => i.ref)
      ].filter(Boolean).join(' ').toLowerCase()
      return hay.includes(q)
    })
  }
  if (state.onlyFavs) {
    out = out.filter(r => state.favs.has(r.id))
  }
  out = sortRecipes(out, state.sort)
  renderTagBar(window.__ALL_RECIPES__ || [])
  renderRecipes(out)
  if (window.bindVideoButtons) window.bindVideoButtons()
}

/* Wire UI */
function wireTagClicks() {
  const host = $('#tagbar'); if (!host) return
  host.addEventListener('click', e => {
    const b = e.target.closest('.pill'); if (!b) return
    const tag = b.dataset.tag || ''
    if (!tag) state.tags.clear()
    else { state.tags.has(tag) ? state.tags.delete(tag) : state.tags.add(tag) }
    writeStateToURL()
    applyFiltersAndRender(window.__ALL_RECIPES__ || [])
  })
}
function wireSearch() {
  const s = $('#search'); if (!s) return
  s.addEventListener('input', () => {
    state.query = s.value.trim()
    writeStateToURL()
    applyFiltersAndRender(window.__ALL_RECIPES__ || [])
  })
}
function wireOnlyFavs() {
  const chk = $('#only-favs'); if (!chk) return
  chk.addEventListener('change', () => {
    state.onlyFavs = !!chk.checked
    writeStateToURL()
    applyFiltersAndRender(window.__ALL_RECIPES__ || [])
  })
}
function wireSort() {
  const sel = $('#sort'); if (!sel) return
  sel.value = state.sort
  sel.addEventListener('change', () => {
    state.sort = sel.value || 'relevance'
    writeStateToURL()
    applyFiltersAndRender(window.__ALL_RECIPES__ || [])
  })
}
function wireFavButtons() {
  document.addEventListener('click', e => {
    const b = e.target.closest('.btn-fav'); if (!b) return
    const id = b.dataset.id; if (!id) return
    state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id)
    saveFavs(state.favs)
    applyFiltersAndRender(window.__ALL_RECIPES__ || [])
  })
}

/* Video modal */
;(() => {
  if (window.__videoInit) return
  window.__videoInit = true
  const modal = document.getElementById('video-modal')
  const frame = document.getElementById('yt-frame')
  const ORIGIN = location.origin
  let timer = null
  const openTab = id => window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener')
  function closeModal() {
    if (!modal || !frame) return
    if (timer) { clearTimeout(timer); timer = null }
    frame.src = 'about:blank'
    modal.classList.remove('show')
    modal.style.display = 'none'
    document.body.style.overflow = ''
  }
  function openModal(id) {
    if (!modal || !frame) { openTab(id); return }
    try { frame.onload=null; frame.onerror=null } catch {}
    if (timer) { clearTimeout(timer); timer=null }
    frame.src = 'about:blank'
    modal.classList.add('show')
    modal.style.display = 'flex'
    document.body.style.overflow = 'hidden'
    const url = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=' + encodeURIComponent(ORIGIN)
    let loaded=false
    frame.onload = () => { loaded=true }
    frame.onerror= () => { if (!loaded) { closeModal(); openTab(id) } }
    timer = setTimeout(()=>{ if(!loaded){ closeModal(); openTab(id) } },2000)
    frame.src = url
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('.btn-video'); if (btn) {
      e.preventDefault()
      const id = btn.dataset.youtubeId || ''
      if (id) openModal(id)
      return
    }
    if (e.target.id==='video-close' || e.target.classList.contains('vm-backdrop')) {
      e.preventDefault(); closeModal()
    }
  }, true)
  function bindVideoButtons(){
    $$('.btn-video').forEach(btn=>{
      if (btn.__boundVideo) return
      btn.__boundVideo=true
      btn.addEventListener('click', e=>{
        e.preventDefault()
        const id = btn.dataset.youtubeId || ''
        if (id) openModal(id)
      }, {passive:false})
    })
  }
  window.bindVideoButtons = bindVideoButtons
  window.addEventListener('keydown', e=>{ if(e.key==='Escape') closeModal() })
})()

/* Refresh */
function setupRefresh(){
  const b = $('#refresh'); if (!b) return
  b.addEventListener('click', async ()=>{
    b.disabled=true; b.textContent='Aggiorno'
    try{
      const data = await fetchRecipes()
      window.__ALL_RECIPES__ = data
      renderTagBar(data)
      applyFiltersAndRender(data)
    }catch(e){ alert('Errore aggiornamento') }
    finally{ b.disabled=false; b.textContent='Aggiorna dati' }
  })
}

/* Applica stato all’UI */
function applyStateToUI(){
  const s=$('#search'), chk=$('#only-favs'), sel=$('#sort')
  if (s) s.value = state.query
  if (chk) chk.checked = state.onlyFavs
  if (sel) sel.value = state.sort
  renderTagBar(window.__ALL_RECIPES__ || [])
}

/* Init */
async function init(){
  try{
    const { q, tags, favs, sort } = readStateFromURL()
    state.query = q
    state.tags  = new Set(tags)
    state.onlyFavs = !!favs
    state.sort = sort || 'relevance'

    const data = await fetchRecipes()
    window.__ALL_RECIPES__ = data

    applyStateToUI()
    applyFiltersAndRender(data)

    wireTagClicks()
    wireSearch()
    wireOnlyFavs()
    wireSort()
    wireFavButtons()
    setupRefresh()
  }catch(e){
    console.error(e)
    const wrap = $('#recipes')
    if (wrap) wrap.innerHTML = '<p class="error">Errore nel caricamento dati</p>'
  }
}
document.readyState !== 'loading' ? init() : document.addEventListener('DOMContentLoaded', init)
