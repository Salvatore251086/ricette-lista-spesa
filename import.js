// import.js v16 — parser client-side con fallback incolla HTML, estrae Recipe JSON

const qs = s => document.querySelector(s)

const ui = {
  year: qs('#year'),
  url: qs('#srcUrl'),
  html: qs('#srcHtml'),
  fetchBtn: qs('#btnFetch'),
  parseBtn: qs('#btnParse'),
  clearBtn: qs('#btnClear'),
  prev: qs('#preview'),
  out: qs('#outJson'),
  copyBtn: qs('#btnCopy')
}

ui.year && (ui.year.textContent = new Date().getFullYear())

ui.fetchBtn.addEventListener('click', tryFetch)
ui.parseBtn.addEventListener('click', runParse)
ui.clearBtn.addEventListener('click', clearAll)
ui.copyBtn.addEventListener('click', copyOut)

function clearAll(){
  ui.url.value = ''
  ui.html.value = ''
  ui.prev.textContent = 'Nessun dato.'
  ui.out.value = ''
}

async function tryFetch(){
  const u = ui.url.value.trim()
  if (!u) { toast('URL mancante'); return }
  try {
    const res = await fetch(u, { mode: 'cors', cache: 'no-store' })
    const txt = await res.text()
    ui.html.value = txt
    toast('Download riuscito')
  } catch {
    toast('Download bloccato. Incolla HTML manualmente.')
  }
}

function runParse(){
  const raw = ui.html.value.trim()
  if (!raw) { toast('HTML mancante'); return }
  const doc = new DOMParser().parseFromString(raw, 'text/html')

  const baseUrl = safeUrl(ui.url.value.trim())
  const candidate = extractRecipeFromJSONLD(doc) || extractRecipeFromMicrodata(doc) || extractRecipeHeuristics(doc)

  const cleaned = normalizeRecipe(candidate, baseUrl)
  ui.prev.innerHTML = previewHtml(cleaned)
  ui.out.value = JSON.stringify(cleaned, null, 2)
}

function safeUrl(s){
  try { return new URL(s) } catch { return null }
}

/* Estrazioni */

function extractRecipeFromJSONLD(doc){
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))
  for (const s of scripts){
    let obj = null
    try { obj = JSON.parse(s.textContent) } catch { continue }
    const nodes = Array.isArray(obj) ? obj : [obj, ...(obj?.graph || obj?.@graph || [])]
    for (const n of nodes){
      if (!n || typeof n !== 'object') continue
      const type = String(n['@type'] || '').toLowerCase()
      if (type.includes('recipe')){
        return {
          title: n.name || '',
          image: pickFirst(n.image),
          url: n.mainEntityOfPage || '',
          ingredients: toArray(n.recipeIngredient),
          steps: toStepsFromLD(n.recipeInstructions),
          time: minutesFromISO(n.totalTime || n.cookTime || n.prepTime),
          servings: n.recipeYield ? parseInt(String(n.recipeYield).match(/\d+/)?.[0] || '0', 10) : undefined,
          video: n.video?.embedUrl || n.video?.contentUrl || n.video?.url || ''
        }
      }
    }
  }
  return null
}

function extractRecipeFromMicrodata(doc){
  const scope = doc.querySelector('[itemtype*="schema.org/Recipe"]')
  if (!scope) return null
  const get = sel => scope.querySelector(sel)?.getAttribute('content') || scope.querySelector(sel)?.textContent || ''
  const ingredients = Array.from(scope.querySelectorAll('[itemprop="recipeIngredient"]')).map(el => el.getAttribute('content') || el.textContent || '')
  const steps = Array.from(scope.querySelectorAll('[itemprop="recipeInstructions"] [itemprop="text"], [itemprop="recipeInstructions"]')).map(el => el.getAttribute('content') || el.textContent || '')
  return {
    title: get('[itemprop="name"]'),
    image: get('[itemprop="image"]'),
    url: get('[itemprop="mainEntityOfPage"]'),
    ingredients,
    steps,
    time: minutesFromISO(get('[itemprop="totalTime"]')),
    servings: parseInt((get('[itemprop="recipeYield"]')||'').match(/\d+/)?.[0] || '0', 10) || undefined,
    video: get('iframe[src*="youtube"], [itemprop="video"] iframe[src], [itemprop="video"] [src]')
  }
}

function extractRecipeHeuristics(doc){
  const title = doc.querySelector('h1')?.textContent?.trim() || doc.title || ''
  const image = doc.querySelector('meta[property="og:image"]')?.content
             || doc.querySelector('img')?.src
             || ''
  const urlMeta = doc.querySelector('link[rel="canonical"]')?.href
  const ingredCandidates = Array.from(doc.querySelectorAll('ul, ol')).map(ul=>{
    const text = Array.from(ul.querySelectorAll('li')).map(li => li.textContent.trim()).filter(Boolean)
    const score = text.filter(t => /g|ml|uova|sale|olio|burro|farina|pomodoro|pasta|pepe|cipoll|aglio/i.test(t)).length
    return {el: ul, text, score}
  }).sort((a,b)=> b.score - a.score)
  const ingredients = ingredCandidates[0]?.text || []

  const stepCandidates = Array.from(doc.querySelectorAll('ol, ul, p')).map(node=>{
    const items = node.tagName === 'P' ? [node.textContent.trim()] : Array.from(node.querySelectorAll('li')).map(li => li.textContent.trim())
    const score = items.filter(t => /cuoci|versa|mescola|aggiungi|soffrigg|tosta|manteca|inforna|lessa|sbatti|taglia/i.test(t)).length
    return {items, score}
  }).sort((a,b)=> b.score - a.score)
  const steps = stepCandidates[0]?.items || []

  const video = doc.querySelector('meta[property="og:video:url"], meta[property="og:video"]')?.content
             || doc.querySelector('iframe[src*="youtube"], iframe[src*="youtu.be"]')?.src
             || ''

  return {
    title, image, url: urlMeta || '', ingredients, steps, video
  }
}

/* Normalizzazione */

function normalizeRecipe(x, baseUrl){
  const url = pickUrl([x.url, metaContent('og:url'), baseUrl?.href])
  const title = x.title || metaContent('og:title') || ''
  const img = pickUrl([x.image, metaContent('og:image')], baseUrl)
  const yt = toYouTubeId(x.video || metaContent('og:video') || '')

  const ingredients = toArray(x.ingredients).map(s => s.trim()).filter(Boolean)
  const steps = toArray(x.steps).map(s => s.trim()).filter(Boolean)

  const out = {
    id: slug(title),
    title: title,
    time: Number.isFinite(x.time) ? x.time : undefined,
    servings: Number.isFinite(x.servings) ? x.servings : undefined,
    tags: [],
    image: img || 'assets/icons/icon-512.png',
    ingredients: normalizeIngredients(ingredients),
    steps: steps,
    url: url || '',
    video: yt || ''
  }

  // rimuovi undefined
  Object.keys(out).forEach(k => out[k] === undefined && delete out[k])
  return out

  function metaContent(name){
    return document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.content || ''
  }
}

function normalizeIngredients(arr){
  return arr.map(line=>{
    // estrae qty e unità rudimentale
    const m = line.match(/^(\d+(?:[.,]\d+)?)\s*(g|gr|grammi|kg|ml|cl|l|uova|pz|fette|spicchio|spicchi|cucchiaini?|cucchiai?)?\s*(.*)$/i)
    if (m){
      const qty = m[1].replace(',','.')
      const unit = (m[2]||'').toLowerCase()
      const name = (m[3]||'').trim()
      return { ref: slug(name).replace(/-/g,' '), qty: isNaN(Number(qty)) ? String(qty) : Number(qty), unit }
    }
    return { ref: slug(line).replace(/-/g,' ') }
  })
}

/* Utilità parsing */

function toArray(x){
  if (!x) return []
  if (Array.isArray(x)) return x
  return [x]
}
function toStepsFromLD(val){
  const arr = toArray(val)
  const out = []
  for (const v of arr){
    if (!v) continue
    if (typeof v === 'string') out.push(v)
    else if (typeof v === 'object'){
      if (v.text) out.push(v.text)
      else if (Array.isArray(v.itemListElement)) out.push(...v.itemListElement.map(i => i.text || '').filter(Boolean))
    }
  }
  return out
}
function pickFirst(v){
  if (!v) return ''
  if (Array.isArray(v)) return v[0] || ''
  if (typeof v === 'object'){
    return v.url || v.contentUrl || v.src || ''
  }
  return String(v)
}
function minutesFromISO(s){
  if (!s) return undefined
  const m = String(s).match(/PT(?:(\d+)H)?(?:(\d+)M)?/i)
  if (!m) return undefined
  const h = parseInt(m[1]||'0',10)
  const mi = parseInt(m[2]||'0',10)
  return h*60 + mi
}
function toYouTubeId(u){
  if (!u) return ''
  try {
    const url = new URL(u)
    if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] || ''
    if (url.hostname === 'www.youtube.com' || url.hostname === 'youtube.com'){
      if (url.pathname === '/watch') return url.searchParams.get('v') || ''
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] || ''
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || ''
    }
    return ''
  } catch { return '' }
}
function slug(s){
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
}

function previewHtml(r){
  const ing = r.ingredients.map(x => typeof x === 'string' ? x : [x.qty, x.unit, x.ref].filter(Boolean).join(' ')).join('<br>')
  const steps = r.steps.map(x => `<li>${escapeHtml(x)}</li>`).join('')
  return `
    <div style="display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap">
      <img src="${escapeAttr(r.image)}" alt="" style="width:120px;height:120px;object-fit:cover;border-radius:10px;border:1px solid #e3ece7">
      <div>
        <strong>${escapeHtml(r.title)}</strong><br>
        <span class="muted">${escapeHtml(r.url || '')}</span>
      </div>
    </div>
    <h3 style="margin:10px 0 6px">Ingredienti</h3>
    <div class="muted">${ing || 'n.d.'}</div>
    <h3 style="margin:10px 0 6px">Passi</h3>
    <ol class="list">${steps || '<li>n.d.</li>'}</ol>
  `
}

/* UI util */

function escapeHtml(s){ return String(s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])) }
function escapeAttr(s){ return escapeHtml(s).replace(/"/g,'&quot;') }
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
