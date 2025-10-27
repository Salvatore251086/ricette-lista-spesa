/* app_v16.js — click robusti, link Ricetta nativi, modale video con fallback */

/* ===== Utils & Stato ===== */
const $  = (s, r=document) => r.querySelector(s)
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s))

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev'
const DATA_URL    = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`

const STATE = {
  recipes: [],
  filtered: [],
  selectedTags: new Set(),
  onlyFav: false,
  search: ''
}

const norm = s => String(s||'')
  .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().trim()

/* ===== Data ===== */
async function fetchRecipes(){
  const res = await fetch(DATA_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()
  return Array.isArray(raw) ? raw : Array.isArray(raw.recipes) ? raw.recipes : []
}

/* Canonico recipe */
function canonRecipe(x){
  if (!x || typeof x !== 'object') return null

  const title =
    x.title || x.titolo || x.name || x.nome || 'Senza titolo'

  const url =
    x.url || x.src || x.link || ''

  const tags = (
    Array.isArray(x.tags) ? x.tags :
    typeof x.tag === 'string' ? x.tag.split(',') :
    Array.isArray(x.categorie) ? x.categorie :
    []
  ).map(t => String(t).trim()).filter(Boolean)

  const image =
    x.image || x.img || 'assets/icons/icon-512.png'

  const time = x.time || x.tempo || null
  const servings = x.servings || x.porzioni || null

  const ytid = getYouTubeId(x)

  return { title, url, tags, image, time, servings, ytid }
}

function getYouTubeId(r){
  const fromStr = s => {
    const m = String(s||'').match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/)
    return m ? m[1] : ''
  }
  if (!r) return ''
  return (
    r.youtubeId || r.ytid || r.videoId ||
    (r.video_url && fromStr(r.video_url)) ||
    (r.video && fromStr(r.video)) ||
    ''
  )
}

/* ===== Render ===== */
function renderRecipes(list){
  const host = $('#recipes')
  if (!host) return

  if (!Array.isArray(list) || !list.length){
    host.innerHTML = `<p class="muted">Nessuna ricetta trovata.</p>`
    return
  }

  const html = list.map(r=>{
    const img = r.image || 'assets/icons/icon-512.png'
    const tagsHtml = (r.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')
    const metaBits = []
    if (r.time) metaBits.push(`${r.time} min`)
    if (r.servings) metaBits.push(`${r.servings} porz.`)
    const meta = metaBits.join(' · ')

    // Link nativo per Ricetta
    const btnSrc = r.url
      ? `<a class="btn green" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>`
      : `<button class="btn" type="button" disabled>Ricetta</button>`

    // Pulsante video
    const btnVideo = r.ytid
      ? `<button class="btn blue btn-video" type="button" data-youtube-id="${r.ytid}">Guarda video</button>`
      : `<button class="btn" type="button" disabled>Guarda video</button>`

    return `
      <article class="card">
        <img class="thumb" loading="lazy" src="${img}" alt="${r.title}">
        <div class="b">
          <h3>${r.title || 'Senza titolo'}</h3>
          <p class="meta">${meta}</p>
          <p class="tags">${tagsHtml}</p>
          <div class="act">
            ${btnSrc}
            ${btnVideo}
          </div>
        </div>
      </article>
    `
  }).join('')

  host.innerHTML = html

  // Binding diretto post-render per sicurezza
  $$('.btn-video', host).forEach(b=>{
    b.addEventListener('click', onVideoClick, { passive: true })
  })
}

/* ===== Filtri & Ricerca ===== */
function applyFilters(){
  const q = norm(STATE.search)
  const needTags = [...STATE.selectedTags].filter(t=>t!=='tutti').map(norm)

  let out = STATE.recipes.slice()

  if (needTags.length){
    out = out.filter(r=>{
      const bag = new Set((r.tags||[]).map(norm))
      for (const t of needTags) if (!bag.has(t)) return false
      return true
    })
  }

  if (STATE.onlyFav) out = out.filter(r => r.favorite)

  if (q){
    out = out.filter(r=>{
      const hay = [
        r.title,
        ...(r.tags||[])
      ].filter(Boolean).map(norm).join(' ')
      return hay.includes(q)
    })
  }

  STATE.filtered = out
  renderRecipes(out)
}

function setupChips(){
  const bar = $('#chipbar')
  if (!bar) return

  bar.addEventListener('click', e=>{
    const chip = e.target.closest('.chip')
    if (!chip) return
    const tag = chip.dataset.tag || norm(chip.textContent)
    if (!tag) return

    if (tag === 'tutti'){
      STATE.selectedTags.clear()
      $$('.chip', bar).forEach(c=>c.classList.remove('active'))
      chip.classList.add('active')
    } else {
      $('.chip[data-tag="tutti"]', bar)?.classList.remove('active')
      chip.classList.toggle('active')
      if (chip.classList.contains('active')) STATE.selectedTags.add(tag)
      else STATE.selectedTags.delete(tag)
    }
    applyFilters()
  })
}

function setupSearch(){
  const el = $('#search')
  if (!el) return
  el.addEventListener('input', ()=>{
    STATE.search = el.value || ''
    applyFilters()
  })
}

function setupOnlyFav(){
  const el = $('#only-fav')
  if (!el) return
  el.addEventListener('change', ()=>{
    STATE.onlyFav = !!el.checked
    applyFilters()
  })
}

/* ===== Suggerisci ricette ===== */
const normalizeWords = str => norm(str).split(/[^a-z0-9]+/i).filter(Boolean)

function suggestRecipes(userText, N=6){
  const words = new Set(normalizeWords(userText))
  if (!words.size) return []

  const scored = STATE.recipes.map(r=>{
    // base: usa solo titolo e tag per non pesare
    const bag = new Set([norm(r.title), ...(r.tags||[]).map(norm)])
    let score = 0
    words.forEach(w=>{ if (bag.has(w)) score++ })
    return { r, score }
  })

  scored.sort((a,b)=> b.score - a.score || norm(a.r.title).localeCompare(norm(b.r.title)))
  return scored.filter(x=>x.score>0).slice(0,N).map(x=>x.r)
}

function setupSuggest(){
  const btn = $('#btn-suggest')
  const ta  = $('#ingredients')
  if (!btn || !ta) return

  btn.addEventListener('click', ()=>{
    const txt = ta.value || ''
    const hits = suggestRecipes(txt, 6)
    if (!hits.length){
      alert('Nessuna ricetta trovata con questo testo')
      return
    }
    renderRecipes(hits)
    $('#recipes')?.scrollIntoView({behavior:'smooth', block:'start'})
  })
}

/* ===== Aggiorna dati ===== */
function setupRefresh(){
  const btn = $('#refresh')
  if (!btn) return
  btn.addEventListener('click', async ()=>{
    btn.disabled = true
    const old = btn.textContent
    btn.textContent = 'Aggiorno…'
    try{
      const raw = await fetchRecipes()
      STATE.recipes = raw.map(canonRecipe).filter(Boolean)
      STATE.selectedTags.clear()
      $$('.chip').forEach(c=>c.classList.remove('active'))
      $('.chip[data-tag="tutti"]')?.classList.add('active')
      STATE.search = ''
      const s = $('#search'); if (s) s.value = ''
      applyFilters()
    }catch(e){
      alert('Aggiornamento fallito: '+e.message)
    }finally{
      btn.disabled = false
      btn.textContent = old
    }
  })
}

/* ===== Video modale con fallback ===== */
let ytWatchdog = null

function onVideoClick(e){
  const btn = e.currentTarget || e.target
  const id = btn?.dataset?.youtubeId
  if (!id) return
  openVideoById(id)
}

function ensureVideoBinding(){
  // delega su #recipes
  $('#recipes')?.addEventListener('click', e=>{
    const btn = e.target.closest('.btn-video')
    if (btn) onVideoClick(e)
  })

  // delega globale come rete di salvataggio
  document.addEventListener('click', e=>{
    const btn = e.target.closest?.('.btn-video')
    if (btn) onVideoClick(e)
  })

  // close
  document.addEventListener('click', e=>{
    if (e.target?.id === 'video-close' || e.target?.classList?.contains('vm-backdrop')) {
      closeVideo()
    }
  })
  window.addEventListener('keydown', e=>{ if (e.key === 'Escape') closeVideo() })
  window.addEventListener('message', onYTMessage, false)
}

function openVideoById(id){
  const modal = $('#video-modal')
  const frame = $('#yt-frame')
  if (!modal || !frame){
    window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener')
    return
  }
  frame.onload = null
  frame.onerror = null
  frame.src = 'about:blank'
  modal.classList.add('show')
  modal.setAttribute('aria-hidden','false')

  const url = 'https://www.youtube-nocookie.com/embed/'+id
    + '?autoplay=1&rel=0&modestbranding=1&playsinline=1'
    + '&enablejsapi=1&origin=' + encodeURIComponent(location.origin)

  clearYTWatchdog()
  ytWatchdog = setTimeout(()=>{
    // nessun segnale dal player
    closeVideo()
    window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener')
  }, 3000)

  frame.setAttribute('data-watch-url', 'https://www.youtube.com/watch?v='+id)
  frame.src = url
}

function closeVideo(){
  clearYTWatchdog()
  const modal = $('#video-modal')
  const frame = $('#yt-frame')
  if (frame) frame.src = 'about:blank'
  if (modal){
    modal.classList.remove('show')
    modal.setAttribute('aria-hidden','true')
  }
}

function onYTMessage(ev){
  const ok = typeof ev.origin === 'string'
    && (ev.origin.includes('youtube-nocookie.com') || ev.origin.includes('youtube.com'))
  if (!ok) return

  let data = ev.data
  if (typeof data === 'string'){ try{ data = JSON.parse(data) }catch{} }
  if (!data || typeof data !== 'object') return

  const evt = data.event
  if (evt === 'onReady' || evt === 'infoDelivery' || evt === 'onStateChange'){
    clearYTWatchdog()
  }
  if (evt === 'onError'){
    const w = $('#yt-frame')?.getAttribute('data-watch-url') || ''
    closeVideo()
    if (w) window.open(w, '_blank', 'noopener')
  }
}

function clearYTWatchdog(){
  if (ytWatchdog){ clearTimeout(ytWatchdog); ytWatchdog = null }
}

/* ===== Boot ===== */
;(async function init(){
  try{
    const raw = await fetchRecipes()
    STATE.recipes = raw.map(canonRecipe).filter(Boolean)
    STATE.filtered = STATE.recipes.slice()

    setupChips()
    setupSearch()
    setupOnlyFav()
    setupSuggest()
    setupRefresh()
    ensureVideoBinding()

    renderRecipes(STATE.recipes)
  }catch(err){
    console.error(err)
    const host = $('#recipes')
    if (host) host.innerHTML = `<p class="muted">Errore nel caricamento dati: ${err.message}</p>`
  }
})()
