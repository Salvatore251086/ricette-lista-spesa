/* app_v16.js — v16.7: chip AND, video fallback robusto, fotocamera, OCR con CDN fallback */

/* ========== Utils ========== */
const $  = (s, r=document) => r.querySelector(s)
const $$ = (s, r=document) => Array.from(r.querySelectorAll(s))
const APP_VERSION = window.APP_VERSION || 'v16.7'
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(APP_VERSION)}`
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim()

const STATE = {
  recipes: [],
  filtered: [],
  selectedTags: new Set(),
  onlyFav: false,
  search: '',
  ytBlocked: false,
  allTags: [],
  stream: null,
  currentDeviceId: null,
  ocrLibReady: false,
  __ocrCore: null,
  __ocrWorker: null
}

/* ========== Data ========== */
async function fetchRecipes(){
  const res = await fetch(DATA_URL, { cache: 'no-store' })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

/* ========== YouTube ========== */
function getYouTubeId(r){
  if (!r) return ''
  if (r.youtubeId) return String(r.youtubeId).trim()
  if (r.ytid)      return String(r.ytid).trim()
  if (r.videoId)   return String(r.videoId).trim()
  if (r.video){
    const m = String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/)
    if (m) return m[1]
  }
  return ''
}
function checkThumbExists(id){
  return new Promise(resolve=>{
    if (!id) return resolve(false)
    const img = new Image()
    let done = false
    const finish = ok=>{ if(!done){done=true;resolve(ok)} }
    img.onload = ()=>finish(true)
    img.onerror = ()=>finish(false)
    img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`
    setTimeout(()=>finish(true), 800)
  })
}
async function detectYouTubeBlocked(){
  const testFetch = fetch('https://www.youtube.com/generate_204', { mode: 'no-cors' })
    .then(()=>true).catch(()=>false)
  const testImg = new Promise(res=>{
    const i=new Image()
    i.onload = ()=>res(true)
    i.onerror = ()=>res(false)
    i.src='https://i.ytimg.com/generate_204'
    setTimeout(()=>res(false), 1200)
  })
  const settled = await Promise.allSettled([testFetch, testImg])
  const okFetch = settled[0].status==='fulfilled' ? settled[0].value : false
  const okImg   = settled[1].status==='fulfilled' ? settled[1].value : false
  STATE.ytBlocked = !(okFetch || okImg)
}

/* ========== Chip ========== */
function buildChipbar(){
  const bar = $('#chipbar')
  if (!bar) return
  const set = new Set()
  for (const r of STATE.recipes) for (const t of (r.tags||[])) { const v=norm(t); if(v) set.add(v) }
  STATE.allTags = Array.from(set).sort((a,b)=>a.localeCompare(b,'it'))
  bar.innerHTML = [
    `<button class="chip ${STATE.selectedTags.size? '' : 'active'}" data-tag="tutti" type="button">Tutti</button>`,
    ...STATE.allTags.map(t=>`<button class="chip ${STATE.selectedTags.has(t)?'active':''}" data-tag="${t}" type="button">${t}</button>`)
  ].join('')
}

/* ========== Render ========== */
function renderRecipes(list){
  const host = $('#recipes')
  if (!host) return
  if (!Array.isArray(list) || !list.length){
    host.innerHTML = `<p class="muted">Nessuna ricetta trovata.</p>`
    return
  }
  const html = list.map(r=>{
    const img = r.image || 'assets/icons/icon-512.png'
    const tags = Array.isArray(r.tags)? r.tags: []
    const tagsHtml = tags.map(t=>`<span class="tag" data-tag="${t}">${t}</span>`).join('')
    const yid = getYouTubeId(r)
    const title = (r.title||'Ricetta').replace(/"/g,'&quot;')

    let btnVideo
    if (STATE.ytBlocked || !yid){
      const url = yid ? `https://www.youtube.com/watch?v=${yid}` : `https://www.youtube.com/results?search_query=${encodeURIComponent((r.title||'')+' ricetta')}`
      btnVideo = `<a class="btn btn-video" href="${url}" target="_blank" rel="noopener">Guarda video</a>`
    } else {
      btnVideo = `<button class="btn btn-video" type="button" onclick="window.__openVideo('${yid}','${title}')">Guarda video</button>`
    }

    const btnSrc = r.url
      ? `<a class="btn btn-recipe" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>`
      : `<button class="btn btn-recipe" type="button" disabled>Ricetta</button>`

    const meta = []
    if (r.time) meta.push(`${r.time} min`)
    if (r.servings) meta.push(`${r.servings} porz.`)

    return `
      <article class="recipe-card">
        <img class="thumb" src="${img}" alt="${title}" loading="lazy">
        <div class="body">
          <h3>${title}</h3>
          <p class="meta">${meta.join(' · ')}</p>
          <p class="tags">${tagsHtml}</p>
          <div class="actions">
            ${btnSrc}
            ${btnVideo}
          </div>
        </div>
      </article>
    `
  }).join('')
  host.innerHTML = html
}

/* ========== Filtri ========== */
function applyFilters(){
  const q = norm(STATE.search)
  const need = [...STATE.selectedTags].filter(t=>t!=='tutti').map(norm)
  let out = STATE.recipes

  if (need.length){
    out = out.filter(r=>{
      const bag = new Set((r.tags||[]).map(norm))
      for (const t of need) if (!bag.has(t)) return false
      return true
    })
  }
  if (STATE.onlyFav) out = out.filter(r=>r.favorite)
  if (q){
    out = out.filter(r=>{
      const hay = [r.title, ...(r.tags||[]), ...(r.ingredients||[]).map(i=> i.ref||i.name||i.ingredient)]
        .filter(Boolean).map(norm).join(' ')
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
      buildChipbar()
    } else {
      $('.chip[data-tag="tutti"]', bar)?.classList.remove('active')
      if (STATE.selectedTags.has(tag)) STATE.selectedTags.delete(tag)
      else STATE.selectedTags.add(tag)
      chip.classList.toggle('active')
      if (STATE.selectedTags.size === 0) buildChipbar()
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

/* ========== Suggerisci ========== */
const normalizeWords = str => norm(str).split(/[^a-z0-9]+/i).filter(Boolean)
function suggestRecipes(userText, N=6){
  const words = new Set(normalizeWords(userText))
  if (!words.size) return []
  const scored = STATE.recipes.map(r=>{
    const refs = new Set((r.ingredients||[]).map(i=> norm(i.ref||i.name||i.ingredient)))
    let score = 0
    words.forEach(w=>{ if(refs.has(w)) score++ })
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
    const hits = suggestRecipes(ta.value||'', 6)
    if (!hits.length){
      alert('Nessuna ricetta trovata con questi ingredienti.')
      return
    }
    renderRecipes(hits)
    $('#recipes')?.scrollIntoView({behavior:'smooth', block:'start'})
  })
  ta.addEventListener('keydown', e=>{
    if (e.key==='Enter' && (e.ctrlKey||e.metaKey)){
      e.preventDefault()
      btn.click()
    }
  })
}

/* ========== Aggiorna dati ========== */
function setupRefresh(){
  const btn = $('#refresh')
  if (!btn) return
  btn.addEventListener('click', async ()=>{
    btn.disabled = true
    btn.textContent = 'Aggiorno…'
    try{
      STATE.recipes = await fetchRecipes()
      STATE.selectedTags.clear()
      buildChipbar()
      STATE.search = ''
      if ($('#search')) $('#search').value = ''
      applyFilters()
    }catch(e){
      alert('Aggiornamento fallito: '+e.message)
    }finally{
      btn.disabled = false
      btn.textContent = 'Aggiorna dati'
    }
  })
}

/* ========== Modale video con fallback ========== */
let fb1=null, fb2=null
function clearTimers(){
  if(fb1){clearTimeout(fb1);fb1=null}
  if(fb2){clearTimeout(fb2);fb2=null}
}
window.__openVideo = async function(ytId, title){
  if (STATE.ytBlocked){
    const url = ytId ? `https://www.youtube.com/watch?v=${ytId}` : `https://www.youtube.com/results?search_query=${encodeURIComponent((title||'')+' ricetta')}`
    window.open(url,'_blank','noopener')
    return
  }
  const modal = $('#video-modal')
  const frame = $('#yt-frame')
  const t = title||'Ricetta'
  if (!modal || !frame){
    window.open(`https://www.youtube.com/watch?v=${ytId}`,'_blank','noopener')
    return
  }

  clearTimers()
  frame.src='about:blank'
  modal.setAttribute('aria-hidden','false')
  document.body.classList.add('no-scroll')

  if (!ytId || ytId.length!==11){
    window.__closeVideo()
    window.open(`https://www.youtube.com/results?search_query=${encodeURIComponent(t+' ricetta')}`,'_blank','noopener')
    return
  }
  await checkThumbExists(ytId)

  const onMsg = ev=>{
    const ok = typeof ev.origin==='string' && (ev.origin.includes('youtube-nocookie.com')||ev.origin.includes('youtube.com'))
    if (!ok) return
    let d=ev.data
    if(typeof d==='string'){try{d=JSON.parse(d)}catch{}}
    if(!d||typeof d!=='object') return
    if(d.event==='onReady'||d.event==='onStateChange'||d.event==='infoDelivery') clearTimers()
    if(d.event==='onError') stage3()
  }
  window.addEventListener('message', onMsg, false)
  const stage1 = ()=>{
    frame.src=`https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
    frame.allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
    frame.setAttribute('allowfullscreen','')
  }
  const stage2 = ()=>{
    frame.src=`https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&origin=${encodeURIComponent(location.origin)}`
  }
  const stage3 = ()=>{
    clearTimers()
    window.removeEventListener('message', onMsg, false)
    window.__closeVideo()
    window.open(`https://www.youtube.com/watch?v=${ytId}`,'_blank','noopener')
  }
  fb1=setTimeout(()=>{ stage2(); fb2=setTimeout(stage3,1500) },1500)
  stage1()
}
window.__closeVideo = function(){
  clearTimers()
  const m=$('#video-modal'), f=$('#yt-frame')
  if(f) f.src='about:blank'
  if(m) m.setAttribute('aria-hidden','true')
  document.body.classList.remove('no-scroll')
}
document.addEventListener('click', e=>{
  if(e.target.id==='video-close'||e.target.classList.contains('vm-backdrop')){
    e.preventDefault()
    window.__closeVideo()
  }
})
document.addEventListener('keydown', e=>{ if(e.key==='Escape') window.__closeVideo() })

/* ========== Fotocamera ========== */
function camMsg(t){ const m=$('#cam-msg'); if(m) m.textContent=t||'' }
async function listDevices(){
  const sel=$('#cam-select'); if(!sel) return
  const devs=await navigator.mediaDevices.enumerateDevices()
  const cams=devs.filter(d=>d.kind==='videoinput')
  sel.innerHTML=cams.map(d=>`<option value="${d.deviceId}">${d.label||'Fotocamera'}</option>`).join('')
  sel.disabled = cams.length===0
  if(cams.length) STATE.currentDeviceId=cams[0].deviceId
}
async function openCamera(deviceId){
  const video=$('#cam-video')
  const btnOpen=$('#cam-open')
  const btnShot=$('#cam-shot')
  const btnClose=$('#cam-close')
  const sel=$('#cam-select')
  try{
    if(STATE.stream){ STATE.stream.getTracks().forEach(t=>t.stop()); STATE.stream=null }
    const constraints={audio:false, video:{ deviceId: deviceId?{exact:deviceId}:undefined, facingMode: deviceId?undefined:{ideal:'environment'}, width:{ideal:1280}, height:{ideal:720} }}
    camMsg('Richiesta permesso fotocamera…')
    const stream=await navigator.mediaDevices.getUserMedia(constraints)
    video.srcObject=stream
    await video.play()
    STATE.stream=stream
    camMsg('Fotocamera attiva.')
    btnOpen.disabled=true
    btnShot.disabled=false
    btnClose.disabled=false
    sel.disabled=false
  }catch(err){
    camMsg('Permesso negato o fotocamera non disponibile.')
    console.error(err)
  }
}
function closeCamera(){
  const video=$('#cam-video')
  const btnOpen=$('#cam-open')
  const btnShot=$('#cam-shot')
  const btnClose=$('#cam-close')
  if(STATE.stream){ STATE.stream.getTracks().forEach(t=>t.stop()); STATE.stream=null }
  if(video) video.srcObject=null
  btnOpen.disabled=false
  btnShot.disabled=true
  btnClose.disabled=true
  camMsg('Fotocamera chiusa.')
}
function grabFrameToCanvas(){
  const video=$('#cam-video'), canvas=$('#cam-canvas')
  if(!video||!canvas) return null
  const w=video.videoWidth||1280, h=video.videoHeight||720
  canvas.width=w
  canvas.height=h
  const ctx=canvas.getContext('2d')
  ctx.drawImage(video,0,0,w,h)
  return canvas
}
async function doShot(){
  const canvas=grabFrameToCanvas()
  if(!canvas){ camMsg('Impossibile scattare.'); return }
  const text=await extractTextFromImage(canvas)
  const ta=$('#ingredients')
  if (text && ta){
    const add=text.trim()
    ta.value = ta.value ? ta.value+'\n'+add : add
    camMsg('Testo riconosciuto aggiunto.')
  } else {
    camMsg('Nessun testo trovato.')
  }
}
function bindCameraUI(){
  const btnOpen=$('#cam-open')
  const btnShot=$('#cam-shot')
  const btnClose=$('#cam-close')
  const btnUpload=$('#cam-upload')
  const file=$('#cam-file')
  const sel=$('#cam-select')
  if(!btnOpen) return

  btnOpen.addEventListener('click', ()=> openCamera(STATE.currentDeviceId))
  btnShot.addEventListener('click', doShot)
  btnClose.addEventListener('click', closeCamera)
  btnUpload.addEventListener('click', ()=> file.click())

  file.addEventListener('change', async ()=>{
    const f=file.files&&file.files[0]
    if(!f) return
    const img=new Image()
    img.onload=async ()=>{
      const canvas=$('#cam-canvas')
      const w=img.naturalWidth, h=img.naturalHeight
      canvas.width=w
      canvas.height=h
      const ctx=canvas.getContext('2d')
      ctx.drawImage(img,0,0,w,h)
      const text=await extractTextFromImage(canvas)
      const ta=$('#ingredients')
      if(text && ta){
        const add=text.trim()
        ta.value = ta.value ? ta.value+'\n'+add : add
        camMsg('Testo riconosciuto aggiunto.')
      } else camMsg('Nessun testo trovato.')
    }
    img.onerror=()=> camMsg('Immagine non valida.')
    img.src=URL.createObjectURL(f)
  })

  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices){
    navigator.mediaDevices.addEventListener?.('devicechange', listDevices)
    sel.addEventListener('change', ()=>{
      STATE.currentDeviceId=sel.value||null
      if(STATE.stream) openCamera(STATE.currentDeviceId)
    })
    listDevices()
  } else camMsg('API mediaDevices non disponibile.')
}

/* ========== OCR con CDN fallback ========== */
const TESS = {
  worker: [
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/worker.min.js',
    'https://unpkg.com/tesseract.js@5/dist/worker.min.js'
  ],
  core: [
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core.wasm.js',
    'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.0.0/tesseract-core-simd.wasm.js',
    'https://unpkg.com/tesseract.js-core@5.0.0/tesseract-core.wasm.js',
    'https://unpkg.com/tesseract.js-core@5.0.0/tesseract-core-simd.wasm.js'
  ],
  lang: 'https://tessdata.projectnaptha.com/4.0.0'
}

async function loadTesseractLibOnce(){
  if (window.Tesseract) return true
  const candidates = [
    'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
    'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js'
  ]
  for (const src of candidates){
    try{
      await new Promise((resolve, reject)=>{
        const s = document.createElement('script')
        s.src = src
        s.async = true
        s.onload = resolve
        s.onerror = reject
        document.head.appendChild(s)
      })
      if (window.Tesseract) return true
    }catch(_){}
  }
  return false
}

async function firstReachable(urls){
  for (const u of urls){
    try{
      const r = await fetch(u, { method: 'HEAD', cache: 'no-store', mode: 'cors' })
      if (r.ok) return u
    }catch(_){}
  }
  return null
}

async function ensureOCRLib(){
  if (STATE.ocrLibReady) return true
  camMsg('Carico OCR…')

  const okLib = await loadTesseractLibOnce()
  if (!okLib){
    camMsg('Impossibile caricare OCR.')
    return false
  }

  const corePath   = await firstReachable(TESS.core)
  const workerPath = await firstReachable(TESS.worker)

  if (!corePath || !workerPath){
    camMsg('CDN OCR non disponibile.')
    return false
  }

  STATE.__ocrCore   = corePath
  STATE.__ocrWorker = workerPath
  STATE.ocrLibReady = true
  camMsg('OCR pronto.')
  return true
}

async function extractTextFromImage(canvas){
  const ok = await ensureOCRLib()
  if (!ok) return ''

  camMsg('Riconoscimento in corso…')
  try{
    const res = await Tesseract.recognize(
      canvas,
      'ita',
      {
        workerPath: STATE.__ocrWorker,
        corePath:   STATE.__ocrCore,
        langPath:   TESS.lang,
        logger:     ()=>{}
      }
    )
    const text = res?.data?.text || ''
    return text
  }catch(e){
    console.error(e)
    camMsg('Errore OCR.')
    return ''
  }
}

/* ========== Boot ========== */
;(async function init(){
  try{
    $('#app-version')?.append(' '+APP_VERSION)
    await detectYouTubeBlocked()
    STATE.recipes = await fetchRecipes()
    STATE.filtered = STATE.recipes.slice()

    buildChipbar()
    setupChips()
    setupSearch()
    setupOnlyFav()
    setupSuggest()
    setupRefresh()
    bindCameraUI()

    applyFilters()
  }catch(err){
    console.error(err)
    const host=$('#recipes')
    if(host) host.innerHTML = `<p class="muted">Errore nel caricamento dati: ${err.message}</p>`
  }
})()
