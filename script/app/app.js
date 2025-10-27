/* app_v16.js — init sicuro, delega eventi, modale video con fallback */

const $ = (s, r=document)=>r.querySelector(s)
const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s))

const APP_VERSION = (typeof window!=='undefined' && window.APP_VERSION) || 'dev'
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`

const STATE = { recipes: [], filtered: [], selectedTags: new Set(), onlyFav: false, search: '' }
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()

function getYouTubeId(r){
  if(!r) return ''
  if(r.youtubeId) return String(r.youtubeId).trim()
  if(r.ytid) return String(r.ytid).trim()
  if(r.videoId) return String(r.videoId).trim()
  if(r.video){
    const m = String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/)
    if(m) return m[1]
  }
  return ''
}

async function fetchRecipes(){
  const res = await fetch(DATA_URL, { cache: 'no-store' })
  if(!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()
  const arr = Array.isArray(raw) ? raw : (Array.isArray(raw.recipes) ? raw.recipes : [])
  return arr.map(normalizeRecipe).filter(r=>r && r.title)
}

function normalizeRecipe(x){
  if(!x || typeof x!=='object') return null
  const title = x.title || x.titolo || x.name || x.nome || 'Senza titolo'
  const time = x.time || x.tempo || ''
  const servings = x.servings || x.porz || ''
  const tags = Array.isArray(x.tags) ? x.tags : String(x.tags||'').split(/[;,]/).map(s=>s.trim()).filter(Boolean)
  const image = x.image || x.img || 'assets/icons/icon-512.png'
  const url = x.url || x.link || ''
  const ytid = getYouTubeId(x)
  const ingredients = Array.isArray(x.ingredients) ? x.ingredients : String(x.ingredients||'').split(/[\n,]+/).map(s=>s.trim()).filter(Boolean).map(ref=>({ref}))
  return { title, time, servings, tags, image, url, ytid, ingredients }
}

function renderRecipes(list){
  const host = $('#recipes')
  const empty = $('#empty')
  if(!host) return
  if(!Array.isArray(list) || !list.length){
    host.innerHTML = ''
    if(empty) empty.style.display = 'block'
    return
  }
  if(empty) empty.style.display = 'none'

  host.innerHTML = list.map(r=>{
    const t = r.tags||[]
    const tagsHtml = t.map(x=>`<span class="tag" data-tag="${x}">${x}</span>`).join('')
    const btnSrc = r.url
      ? `<button class="btn green btn-recipe" data-href="${r.url}">Ricetta</button>`
      : `<button class="btn" disabled>Ricetta</button>`
    const btnVid = r.ytid
      ? `<button class="btn blue btn-video" data-youtube-id="${r.ytid}">Guarda video</button>`
      : `<button class="btn" disabled>Guarda video</button>`
    const metaBits = []
    if(r.time) metaBits.push(`${r.time}`)
    if(r.servings) metaBits.push(`${r.servings} porz.`)
    return `
      <article class="card">
        <img src="${r.image}" alt="${r.title}">
        <div class="b">
          <h3 style="margin:0 0 4px 0;font-size:16px">${r.title}</h3>
          <div class="meta">${metaBits.join(' · ')}</div>
          <div class="tags">${tagsHtml}</div>
          <div class="act">${btnSrc}${btnVid}</div>
        </div>
      </article>
    `
  }).join('')
}

function applyFilters(){
  const q = norm(STATE.search)
  const need = [...STATE.selectedTags].filter(t=>t!=='tutti').map(norm)
  let out = STATE.recipes.slice()
  if(need.length){
    out = out.filter(r=>{
      const bag = new Set((r.tags||[]).map(norm))
      for(const t of need) if(!bag.has(t)) return false
      return true
    })
  }
  if(STATE.onlyFav) out = out.filter(r=>r.favorite)
  if(q){
    out = out.filter(r=>{
      const hay = [
        r.title,
        ...(r.tags||[]),
        ...(r.ingredients||[]).map(i=>i.ref||i.name||i.ingredient)
      ].filter(Boolean).map(norm).join(' ')
      return hay.includes(q)
    })
  }
  STATE.filtered = out
  renderRecipes(out)
}

function setupChips(){
  const bar = $('#chipbar')
  if(!bar) return
  bar.addEventListener('click', e=>{
    const chip = e.target.closest('.chip')
    if(!chip) return
    const tag = chip.dataset.tag || norm(chip.textContent)
    if(tag==='tutti'){
      STATE.selectedTags.clear()
      $$('.chip', bar).forEach(c=>c.classList.remove('active'))
      chip.classList.add('active')
    }else{
      $('.chip[data-tag="tutti"]', bar)?.classList.remove('active')
      chip.classList.toggle('active')
      if(chip.classList.contains('active')) STATE.selectedTags.add(tag)
      else STATE.selectedTags.delete(tag)
    }
    applyFilters()
  })
}

function setupSearch(){
  $('#search')?.addEventListener('input', ()=>{
    STATE.search = $('#search').value || ''
    applyFilters()
  })
  $('#only-fav')?.addEventListener('change', ()=>{
    STATE.onlyFav = !!$('#only-fav').checked
    applyFilters()
  })
}

function setupSuggest(){
  $('#btn-suggest')?.addEventListener('click', ()=>{
    const txt = $('#ingredients')?.value || ''
    const words = new Set(norm(txt).split(/[^a-z0-9]+/).filter(Boolean))
    if(!words.size){ alert('Scrivi qualche ingrediente'); return }
    const scored = STATE.recipes.map(r=>{
      const refs = new Set((r.ingredients||[]).map(i=>norm(i.ref||i.name||i.ingredient)))
      let s = 0
      words.forEach(w=>{ if(refs.has(w)) s++ })
      return {r, s}
    }).sort((a,b)=> b.s - a.s || norm(a.r.title).localeCompare(norm(b.r.title)))
    const hits = scored.filter(x=>x.s>0).slice(0,6).map(x=>x.r)
    if(!hits.length){ alert('Nessuna ricetta trovata con questi ingredienti'); return }
    renderRecipes(hits)
    $('#recipes')?.scrollIntoView({behavior:'smooth',block:'start'})
  })
}

/* Deleghe click: Ricetta, Video, chiudi modale */
function setupDelegates(){
  document.addEventListener('click', e=>{
    const a = e.target.closest('.btn-recipe')
    if(a){
      e.preventDefault()
      const href = a.dataset.href
      if(href) window.open(href, '_blank', 'noopener')
      return
    }
    const v = e.target.closest('.btn-video')
    if(v){
      e.preventDefault()
      const id = v.dataset.youtubeId
      if(id) openVideoById(id)
      return
    }
    if(e.target.id==='video-close' || e.target.classList.contains('vm-backdrop')){
      e.preventDefault()
      closeVideo()
    }
  })
  window.addEventListener('keydown', e=>{ if(e.key==='Escape') closeVideo() })
}

/* Modale YouTube con watchdog 153 */
let ytWatchdog = null
function openVideoById(id){
  const modal = $('#video-modal')
  const frame = $('#yt-frame')
  if(!modal || !frame){ window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener'); return }

  modal.classList.add('show')
  modal.setAttribute('aria-hidden','false')
  document.body.style.overflow='hidden'

  frame.onload = null
  frame.onerror = null
  frame.src = 'about:blank'
  frame.dataset.watchUrl = `https://www.youtube.com/watch?v=${id}`

  clearTimeout(ytWatchdog)
  ytWatchdog = setTimeout(()=>{
    doYTDirectOpen()
  }, 3000)

  const url = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
  frame.src = url
}

function doYTDirectOpen(){
  const frame = $('#yt-frame')
  const url = frame?.dataset?.watchUrl
  closeVideo()
  if(url) window.open(url,'_blank','noopener')
}

function closeVideo(){
  clearTimeout(ytWatchdog)
  ytWatchdog = null
  const modal = $('#video-modal')
  const frame = $('#yt-frame')
  if(frame) frame.src = 'about:blank'
  if(modal){
    modal.classList.remove('show')
    modal.setAttribute('aria-hidden','true')
  }
  document.body.style.overflow=''
}

/* Boot */
async function init(){
  try{
    const v = $('#app-version')
    if(v) v.textContent = APP_VERSION

    STATE.recipes = await fetchRecipes()
    STATE.filtered = STATE.recipes.slice()

    setupChips()
    setupSearch()
    setupSuggest()
    setupDelegates()

    renderRecipes(STATE.recipes)

    $('#refresh')?.addEventListener('click', async ()=>{
      $('#refresh').disabled = true
      $('#refresh').textContent = 'Aggiorno'
      try{
        STATE.recipes = await fetchRecipes()
        STATE.selectedTags.clear()
        $$('.chip').forEach(c=>c.classList.remove('active'))
        $('.chip[data-tag="tutti"]')?.classList.add('active')
        STATE.search = ''
        const s = $('#search'); if(s) s.value = ''
        applyFilters()
      }finally{
        $('#refresh').disabled = false
        $('#refresh').textContent = 'Aggiorna dati'
      }
    })
  }catch(err){
    console.error(err)
    const host = $('#recipes')
    if(host) host.innerHTML = `<p class="muted">Errore caricamento dati: ${err.message}</p>`
  }
}

document.addEventListener('DOMContentLoaded', init)
