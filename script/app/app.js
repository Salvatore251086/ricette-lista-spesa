/* app_v16.js v16.8 — titoli ripristinati, bottoni attivi, modale video + fotocamera base */

const $  = (s, r=document) => r.querySelector(s)
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s))

const APP_VERSION = (typeof window !== 'undefined' && window.APP_VERSION) || 'dev'
const DATA_URL    = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`

const STATE = { recipes: [], filtered: [], selectedTags:new Set(), onlyFav:false, search:'' }

const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()

/* ===================== DATA ===================== */
async function fetchRecipes(){
  const res = await fetch(DATA_URL,{cache:'no-store'})
  if(!res.ok) throw new Error(`HTTP ${res.status}`)
  const raw = await res.json()
  const arr = Array.isArray(raw) ? raw : Array.isArray(raw.recipes) ? raw.recipes : []
  return arr
}

function pickTitle(x){
  const aliases = [
    'title','titolo','name','nome','Title','Nome','recipe','ricetta','nome_ricetta','recipe_name','label','tit'
  ]
  for(const k of aliases){
    if(x[k] && String(x[k]).trim()) return String(x[k]).trim()
  }
  // fallback da url o slug
  const u = x.url || x.src || x.link || ''
  if(u){
    try{
      const last = decodeURIComponent(u.split('/').filter(Boolean).pop()||'').replace(/[-_]/g,' ').replace(/\.\w+$/,'').trim()
      if(last) return cap(last)
    }catch{}
  }
  // ultimo fallback
  return 'Senza titolo'
}
const cap = s => s.replace(/\b\w/g,m=>m.toUpperCase())

function getYouTubeId(r){
  const fromStr = s => {
    const m = String(s||'').match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/)
    return m ? m[1] : ''
  }
  if (!r) return ''
  return r.youtubeId || r.ytid || r.videoId || fromStr(r.video_url) || fromStr(r.video) || ''
}

function canonRecipe(x){
  if(!x || typeof x!=='object') return null
  return {
    title: pickTitle(x),
    url:   x.url || x.src || x.link || '',
    tags:  (Array.isArray(x.tags)?x.tags :
            typeof x.tag==='string'?x.tag.split(',') :
            Array.isArray(x.categorie)?x.categorie : []).map(t=>String(t).trim()).filter(Boolean),
    image: x.image || x.img || 'assets/icons/icon-512.png',
    time:  x.time || x.tempo || null,
    servings: x.servings || x.porzioni || null,
    ytid:  getYouTubeId(x)
  }
}

/* ===================== RENDER ===================== */
function renderRecipes(list){
  const host = $('#recipes')
  if(!host) return
  if(!Array.isArray(list) || !list.length){
    host.innerHTML = `<p class="muted">Nessuna ricetta trovata.</p>`
    return
  }
  const html = list.map(r=>{
    const meta = [r.time?`${r.time} min`:null, r.servings?`${r.servings} porz.`:null].filter(Boolean).join(' · ')
    const btnSrc = r.url
      ? `<a class="btn green" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>`
      : `<button class="btn" type="button" disabled>Ricetta</button>`
    const btnVideo = r.ytid
      ? `<button class="btn blue btn-video" type="button" data-youtube-id="${r.ytid}">Guarda video</button>`
      : `<button class="btn" type="button" disabled>Guarda video</button>`
    const tags = (r.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('')
    return `
      <article class="card">
        <img class="thumb" loading="lazy" src="${r.image}" alt="${r.title}">
        <div class="b">
          <h3>${r.title}</h3>
          <p class="meta">${meta}</p>
          <p class="tags">${tags}</p>
          <div class="act">${btnSrc}${btnVideo}</div>
        </div>
      </article>
    `
  }).join('')
  host.innerHTML = html
}

/* ===================== FILTRI ===================== */
function applyFilters(){
  const q = norm(STATE.search)
  const needTags = [...STATE.selectedTags].filter(t=>t!=='tutti').map(norm)
  let out = STATE.recipes.slice()

  if(needTags.length){
    out = out.filter(r=>{
      const bag = new Set((r.tags||[]).map(norm))
      for(const t of needTags) if(!bag.has(t)) return false
      return true
    })
  }
  if(STATE.onlyFav) out = out.filter(r=>r.favorite)
  if(q){
    out = out.filter(r=>{
      const hay = [r.title, ...(r.tags||[])].filter(Boolean).map(norm).join(' ')
      return hay.includes(q)
    })
  }
  STATE.filtered = out
  renderRecipes(out)
}

function setupChips(){
  const bar = $('#chipbar'); if(!bar) return
  bar.addEventListener('click', e=>{
    const chip = e.target.closest('.chip'); if(!chip) return
    const tag = chip.dataset.tag || norm(chip.textContent); if(!tag) return
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
  const el = $('#search'); if(!el) return
  el.addEventListener('input', ()=>{ STATE.search = el.value||''; applyFilters() })
}
function setupOnlyFav(){
  const el = $('#only-fav'); if(!el) return
  el.addEventListener('change', ()=>{ STATE.onlyFav = !!el.checked; applyFilters() })
}

/* ===================== SUGGERISCI ===================== */
const normalizeWords = str => norm(str).split(/[^a-z0-9]+/i).filter(Boolean)
function suggestRecipes(txt, N=6){
  const words = new Set(normalizeWords(txt)); if(!words.size) return []
  const scored = STATE.recipes.map(r=>{
    const bag = new Set([norm(r.title), ...(r.tags||[]).map(norm)])
    let score=0; words.forEach(w=>{ if(bag.has(w)) score++ })
    return {r, score}
  })
  scored.sort((a,b)=> b.score-a.score || norm(a.r.title).localeCompare(norm(b.r.title)))
  return scored.filter(x=>x.score>0).slice(0,N).map(x=>x.r)
}
function setupSuggest(){
  const btn = $('#btn-suggest'), ta = $('#ingredients'); if(!btn||!ta) return
  btn.addEventListener('click', ()=>{
    const hits = suggestRecipes(ta.value||'', 6)
    if(!hits.length){ alert('Nessuna ricetta trovata con questo testo'); return }
    renderRecipes(hits)
    $('#recipes')?.scrollIntoView({behavior:'smooth',block:'start'})
  })
}

/* ===================== REFRESH ===================== */
function setupRefresh(){
  const btn = $('#refresh'); if(!btn) return
  btn.addEventListener('click', async ()=>{
    btn.disabled=true; const old=btn.textContent; btn.textContent='Aggiorno…'
    try{
      const raw = await fetchRecipes()
      STATE.recipes = raw.map(canonRecipe).filter(Boolean)
      STATE.selectedTags.clear()
      $$('.chip').forEach(c=>c.classList.remove('active'))
      $('.chip[data-tag="tutti"]')?.classList.add('active')
      STATE.search = ''; const s=$('#search'); if(s) s.value=''
      applyFilters()
    }catch(e){ alert('Aggiornamento fallito: '+e.message) }
    finally{ btn.disabled=false; btn.textContent=old }
  })
}

/* ===================== VIDEO ===================== */
let ytWatchdog=null
function ensureVideoBinding(){
  document.addEventListener('click', e=>{
    const b = e.target.closest?.('.btn-video'); if(!b) return
    const id = b.dataset.youtubeId; if(!id) return
    openVideoById(id)
  })
  document.addEventListener('click', e=>{
    if(e.target?.id==='video-close' || e.target?.classList?.contains('vm-backdrop')) closeVideo()
  })
  window.addEventListener('keydown', e=>{ if(e.key==='Escape') closeVideo() })
  window.addEventListener('message', onYTMessage, false)
}
function openVideoById(id){
  const modal=$('#video-modal'), frame=$('#yt-frame')
  if(!modal||!frame){ window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener'); return }
  modal.classList.add('show'); modal.setAttribute('aria-hidden','false')
  frame.src='about:blank'
  const url='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin='+encodeURIComponent(location.origin)
  frame.setAttribute('data-watch-url','https://www.youtube.com/watch?v='+id)
  clearYTWatchdog()
  ytWatchdog=setTimeout(()=>{ closeVideo(); window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener') },3000)
  frame.src=url
}
function closeVideo(){
  clearYTWatchdog()
  const modal=$('#video-modal'), frame=$('#yt-frame')
  if(frame) frame.src='about:blank'
  if(modal){ modal.classList.remove('show'); modal.setAttribute('aria-hidden','true') }
}
function onYTMessage(ev){
  const ok = typeof ev.origin==='string' && (ev.origin.includes('youtube-nocookie.com')||ev.origin.includes('youtube.com'))
  if(!ok) return
  let d=ev.data; if(typeof d==='string'){ try{ d=JSON.parse(d) }catch{} }
  if(!d||typeof d!=='object') return
  if(['onReady','infoDelivery','onStateChange'].includes(d.event)) clearYTWatchdog()
  if(d.event==='onError'){ const w=$('#yt-frame')?.getAttribute('data-watch-url')||''; closeVideo(); if(w) window.open(w,'_blank','noopener') }
}
function clearYTWatchdog(){ if(ytWatchdog){ clearTimeout(ytWatchdog); ytWatchdog=null } }

/* ===================== CAMERA LIGHT ===================== */
let camStream=null
async function listCams(){
  const sel = $('#cam-dev'); if(!sel) return
  sel.innerHTML=''
  try{
    const devs = await navigator.mediaDevices.enumerateDevices()
    const cams = devs.filter(d=>d.kind==='videoinput')
    cams.forEach((d,i)=>{
      const o=document.createElement('option'); o.value=d.deviceId; o.textContent=d.label||`Camera ${i+1}`
      sel.appendChild(o)
    })
  }catch{}
}
async function openCamera(){
  const vid = $('#cam-video'); const sel=$('#cam-dev')
  const opts = { video: sel?.value ? {deviceId:{exact:sel.value}} : { facingMode:'environment' }, audio:false }
  camStream = await navigator.mediaDevices.getUserMedia(opts)
  vid.srcObject = camStream; await vid.play()
  $('#cam-shot').disabled=false; $('#cam-close').disabled=false
}
function closeCamera(){
  if(camStream){ camStream.getTracks().forEach(t=>t.stop()); camStream=null }
  const vid=$('#cam-video'); if(vid){ vid.pause(); vid.srcObject=null }
  $('#cam-shot').disabled=true; $('#cam-close').disabled=true
}
function shotFrame(){
  const vid=$('#cam-video'), can=$('#cam-canvas'); if(!vid||!can) return
  const ctx=can.getContext('2d'); ctx.drawImage(vid,0,0,can.width,can.height)
  // placeholder OCR: copia un testo fittizio nel box ingredienti
  const ta=$('#ingredients'); if(ta) ta.value=(ta.value?ta.value+'\n':'')+'pasta, aglio, olio'
}
function handleFile(e){
  const f=e.target.files?.[0]; if(!f) return
  const img=new Image(); img.onload=()=>{
    const can=$('#cam-canvas'), ctx=can.getContext('2d')
    // fit
    const r=Math.min(can.width/img.width, can.height/img.height)
    const w=img.width*r, h=img.height*r
    ctx.fillStyle='#000'; ctx.fillRect(0,0,can.width,can.height)
    ctx.drawImage(img,(can.width-w)/2,(can.height-h)/2,w,h)
  }
  img.src=URL.createObjectURL(f)
}
function setupCameraUI(){
  if(!navigator.mediaDevices?.getUserMedia) return
  listCams()
  $('#cam-open')?.addEventListener('click', async ()=>{
    try{ await openCamera() }catch(e){ alert('Permesso negato o dispositivo non disponibile') }
  })
  $('#cam-close')?.addEventListener('click', closeCamera)
  $('#cam-shot')?.addEventListener('click', shotFrame)
  $('#cam-file')?.addEventListener('change', handleFile)
  $('#cam-dev')?.addEventListener('change', async ()=>{ if(camStream) { closeCamera(); await openCamera() } })
}

/* ===================== BOOT ===================== */
;(async function init(){
  try{
    $('#app-version')?.append('v'+APP_VERSION)
    const raw = await fetchRecipes()
    STATE.recipes = raw.map(canonRecipe).filter(Boolean)
    STATE.filtered = STATE.recipes.slice()

    setupChips(); setupSearch(); setupOnlyFav(); setupSuggest(); setupRefresh()
    ensureVideoBinding()
    setupCameraUI()

    renderRecipes(STATE.recipes)
  }catch(err){
    console.error(err)
    $('#recipes').innerHTML = `<p class="muted">Errore nel caricamento dati: ${err.message}</p>`
  }
})()
