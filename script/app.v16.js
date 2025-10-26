/* app.v16.js – completo + Generatore antispreco (input + camera/OCR)
   Mantiene: tema scuro, tag, preferiti, video, modale ricetta, URL state, skeleton
*/

const $ = (s,sc=document)=>sc.querySelector(s);
const $$ = (s,sc=document)=>Array.from(sc.querySelectorAll(s));
const ver = (typeof window!=='undefined' && window.APP_VERSION) || 'dev';
const DATA_URL = `assets/json/recipes-it.json?v=${encodeURIComponent(ver)}`;
const LS_FAV = 'rls:favs';
const LS_THEME = 'rls:theme';

const $wrap = $('#recipes');
const $search = $('#search');
const $onlyFav = $('#only-fav');
const $sort = $('#sort');
const $count = $('#result-count');
const $tags = $('#tags');
const $ver = $('#app-version');
if ($ver) $ver.textContent = `v${ver}`;

let RECIPES = [];
let STATE = { q:'', tags:[], fav:false, sort:'relevance' };

/* ===== Tema ===== */
function applyTheme(t){ document.documentElement.setAttribute('data-theme', t); localStorage.setItem(LS_THEME, t); }
function initTheme(){ const saved=localStorage.getItem(LS_THEME); const sysDark=matchMedia?.('(prefers-color-scheme: dark)').matches; applyTheme(saved || (sysDark?'dark':'light')); }
$('#theme-toggle')?.addEventListener('click', ()=>{ const cur=document.documentElement.getAttribute('data-theme')||'light'; applyTheme(cur==='light'?'dark':'light'); });

/* ===== URL state ===== */
function readURLState(){
  const p=new URLSearchParams(location.search);
  STATE.q=p.get('q')||''; STATE.tags=(p.get('tags')||'').split(',').filter(Boolean);
  STATE.fav=p.get('fav')==='1'; STATE.sort=p.get('sort')||'relevance';
  if($search) $search.value=STATE.q;
  if($onlyFav) $onlyFav.checked=STATE.fav;
  if($sort) $sort.value=STATE.sort;
}
function writeURLState(push=false){
  const p=new URLSearchParams();
  if(STATE.q) p.set('q',STATE.q);
  if(STATE.tags.length) p.set('tags',STATE.tags.join(','));
  if(STATE.fav) p.set('fav','1');
  if(STATE.sort!=='relevance') p.set('sort',STATE.sort);
  const url=location.pathname+(p.toString()?`?${p}`:'');
  (push?history.pushState:history.replaceState).call(history, STATE, '', url);
}

/* ===== Preferiti ===== */
function loadFavs(){ try{ return new Set(JSON.parse(localStorage.getItem(LS_FAV)||'[]')); }catch(_){ return new Set(); } }
function saveFavs(s){ localStorage.setItem(LS_FAV, JSON.stringify([...s])); }
let FAVS = loadFavs();

/* ===== Utils ===== */
function getYouTubeId(r){
  if(!r) return '';
  if(r.youtubeId) return String(r.youtubeId).trim();
  if(r.ytid) return String(r.ytid).trim();
  if(r.videoId) return String(r.videoId).trim();
  if(r.video){ const m=String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/); if(m) return m[1]; }
  return '';
}
async function fetchRecipes(){ const res=await fetch(DATA_URL,{cache:'no-store'}); if(!res.ok) throw new Error('HTTP '+res.status); return res.json(); }

/* ===== Skeleton ===== */
function renderSkeleton(n=6){ $wrap.innerHTML=Array.from({length:n}).map(()=>`<div class="sk-card skeleton"></div>`).join(''); }

/* ===== Tag cloud ===== */
function buildTagSet(list){ const m=new Map(); list.forEach(r=>(r.tags||[]).forEach(t=>m.set(t,(m.get(t)||0)+1))); return [...m.entries()].sort((a,b)=>b[1]-a[1]).slice(0,24); }
function renderTagBar(list){
  $tags.innerHTML=buildTagSet(list).map(([t,c])=>{
    const on=STATE.tags.includes(t)?' active':'';
    return `<button class="chip${on}" data-tag="${t}" aria-pressed="${on?'true':'false'}">${t} <span class="muted">· ${c}</span></button>`;
  }).join('');
}

/* ===== Filtri/Sort ===== */
function filterSort(list){
  let out=list;
  if(STATE.q){
    const q=STATE.q.toLowerCase();
    out=out.filter(r=>{
      const hay=[r.title,...(r.tags||[]),...(r.ingredients||[]).map(i=>i.ref||'')].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }
  if(STATE.tags.length){ out=out.filter(r=>(r.tags||[]).some(t=>STATE.tags.includes(t))); }
  if(STATE.fav){ out=out.filter(r=>FAVS.has(r.id)); }
  if(STATE.sort==='time'){ out=[...out].sort((a,b)=>(a.time||999)-(b.time||999)); }
  else if(STATE.sort==='title'){ out=[...out].sort((a,b)=>String(a.title).localeCompare(String(b.title),'it')); }
  return out;
}

/* ===== Render cards ===== */
function renderRecipes(list){
  const data=filterSort(list);
  $count.textContent=`${data.length} risultati`;
  if(!data.length){ $wrap.innerHTML=`<div style="grid-column:1/-1;padding:20px" class="muted">Nessun risultato.</div>`; return; }
  $wrap.innerHTML=data.map(r=>{
    const yid=getYouTubeId(r); const favOn=FAVS.has(r.id)?'1':'0';
    const tagsHtml=(r.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('');
    const meta=[r.time?`${r.time} min`:null, r.servings?`${r.servings} porz.`:null].filter(Boolean).join(' · ');
    return `
      <article class="card" data-id="${r.id}">
        <img src="${r.image||'assets/icons/icon-512.png'}" alt="${r.title||''}" loading="lazy">
        <div class="body" style="flex:1;min-width:0">
          <h3>${r.title||''}</h3>
          <p class="meta">${meta}</p>
          <div class="tags">${tagsHtml}</div>
          <div class="actions">
            <button class="fav" title="Preferito" aria-pressed="${favOn==='1'?'true':'false'}" data-fav="${r.id}" data-on="${favOn}">${favOn==='1'?'★':'☆'}</button>
            ${r.url? `<a class="btn btn-recipe" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>` : `<button class="btn btn-recipe" data-open-recipe="${r.id}">Ricetta</button>`}
            ${yid? `<button class="btn btn-video" data-youtube-id="${yid}">Guarda video</button>` : `<button class="btn" disabled>Guarda video</button>`}
          </div>
        </div>
      </article>`;
  }).join('');
}

/* ===== Interazioni cards/tag ===== */
function bindInteractions(){
  $wrap.addEventListener('click', (e)=>{
    const fav=e.target.closest('[data-fav]'); if(!fav) return;
    const id=fav.dataset.fav;
    if(FAVS.has(id)){ FAVS.delete(id); fav.dataset.on='0'; fav.textContent='☆'; fav.setAttribute('aria-pressed','false'); }
    else{ FAVS.add(id); fav.dataset.on='1'; fav.textContent='★'; fav.setAttribute('aria-pressed','true'); }
    saveFavs(FAVS); if(STATE.fav) renderRecipes(RECIPES);
  });

  document.addEventListener('click',(e)=>{
    const btn=e.target.closest('.btn-video'); if(!btn) return; e.preventDefault();
    const id=btn.dataset.youtubeId||''; if(id) openVideo(id);
  });

  document.addEventListener('click',(e)=>{
    const btn=e.target.closest('[data-open-recipe]'); if(!btn) return;
    const id=btn.getAttribute('data-open-recipe'); const rec=RECIPES.find(x=>x.id===id);
    if(rec) openRecipe(rec);
  });

  $tags.addEventListener('click',(e)=>{
    const chip=e.target.closest('.chip'); if(!chip) return;
    const t=chip.dataset.tag;
    if(STATE.tags.includes(t)) STATE.tags=STATE.tags.filter(x=>x!==t); else STATE.tags.push(t);
    renderTagBar(RECIPES); renderRecipes(RECIPES); writeURLState();
  });
}

/* ===== Header ===== */
function bindHeader(){
  $search?.addEventListener('input', ()=>{ STATE.q=$search.value.trim(); renderRecipes(RECIPES); writeURLState(); });
  $onlyFav?.addEventListener('change', ()=>{ STATE.fav=$onlyFav.checked; renderRecipes(RECIPES); writeURLState(); });
  $sort?.addEventListener('change', ()=>{ STATE.sort=$sort.value; renderRecipes(RECIPES); writeURLState(); });
  const $refresh=$('#refresh');
  $refresh?.addEventListener('click', async ()=>{
    $refresh.disabled=true; $refresh.textContent='Aggiorno…';
    try{ RECIPES=await fetchRecipes(); renderTagBar(RECIPES); renderRecipes(RECIPES); }
    catch(e){ alert('Errore aggiornamento: '+e.message); }
    $refresh.disabled=false; $refresh.textContent='Aggiorna dati';
  });
}

/* ===== Modale Video ===== */
const $vm=$('#video-modal'), $vf=$('#yt-frame');
function openVideo(id){
  if(!$vm||!$vf){ window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener'); return; }
  $vf.src='about:blank'; $vm.style.display='flex';
  const url='https://www.youtube-nocookie.com/embed/'+id+'?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin='+encodeURIComponent(location.origin);
  let ok=false; const t=setTimeout(()=>{ if(!ok){ closeVideo(); window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener'); } },2000);
  $vf.onload=()=>{ ok=true; clearTimeout(t); }; $vf.onerror=()=>{ if(!ok){ clearTimeout(t); closeVideo(); window.open('https://www.youtube.com/watch?v='+id,'_blank','noopener'); } };
  $vf.src=url;
}
function closeVideo(){ if($vf) $vf.src='about:blank'; if($vm) $vm.style.display='none'; }
document.addEventListener('click',(e)=>{ if(e.target===$vm) closeVideo(); });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeVideo(); });

/* ===== Modale Ricetta ===== */
const $rm=$('#recipe-modal'), $rmBody=$('#rm-body'), $rmTitle=$('#rm-title'), $rmCopy=$('#rm-copy'), $rmPrint=$('#rm-print');
$('#rm-close')?.addEventListener('click', ()=> closeRecipe());
let CURRENT_RECIPE=null;

function formatIngredients(rec){
  return (rec.ingredients||[]).map(i=>{
    const qty=[i.qty,i.unit].filter(Boolean).join(' '); return `• ${qty?qty+' ':''}${i.ref||''}`.trim();
  }).join('\n');
}
function openRecipe(rec){
  CURRENT_RECIPE=rec;
  if(!$rm||!$rmBody||!$rmTitle){ if(rec.url) window.open(rec.url,'_blank','noopener'); return; }
  $rmTitle.textContent=rec.title||'Ricetta';
  const ing=(rec.ingredients||[]).map(i=>{
    const qty=[i.qty,i.unit].filter(Boolean).join(' '); return `<li>${qty?`<strong>${qty}</strong> `:''}${i.ref||''}</li>`;
  }).join('');
  const steps=(rec.steps||[]).map(s=>`<li>${s}</li>`).join('');
  const meta=[rec.time?`${rec.time} min`:null,rec.servings?`${rec.servings} porz.`:null].filter(Boolean).join(' · ');
  $rmBody.innerHTML=`<p class="muted">${meta}</p><h5>Ingredienti</h5><ul>${ing||'<li class="muted">N/D</li>'}</ul><h5>Passi</h5><ol>${steps||'<li class="muted">N/D</li>'}</ol>${rec.url?`<p style="margin-top:12px"><a class="btn" href="${rec.url}" target="_blank" rel="noopener">Apri fonte originale</a></p>`:''}`;
  $rm.style.display='flex';
}
function closeRecipe(){ CURRENT_RECIPE=null; if($rm) $rm.style.display='none'; if($rmBody) $rmBody.innerHTML=''; }
document.addEventListener('click',(e)=>{ if(e.target===$rm) closeRecipe(); });
document.addEventListener('keydown',(e)=>{ if(e.key==='Escape') closeRecipe(); });
$rmCopy?.addEventListener('click', async ()=>{ if(!CURRENT_RECIPE) return; try{ await navigator.clipboard.writeText(`${CURRENT_RECIPE.title||'Ricetta'}\n\nIngredienti:\n${formatIngredients(CURRENT_RECIPE)}`); alert('Ingredienti copiati.'); }catch(_){ alert('Permesso copia negato.'); }});
$rmPrint?.addEventListener('click', ()=>{ if(!CURRENT_RECIPE) return; window.print(); });

/* =======================================================================
   GENERATORE ANTISPRECO (input + OCR fotocamera)
   ======================================================================= */
const $genInput = $('#gen-input');
const $genRun   = $('#gen-run');
const $genStatus= $('#gen-status');
const $genCam   = $('#gen-camera');
const $genCap   = $('#gen-capture');
const $genStop  = $('#gen-stop');
const $v        = $('#gen-video');
const $c        = $('#gen-canvas');
let genStream   = null;

function norm(s){ return String(s||'').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu,'').replace(/[^a-z0-9\s\-]/g,' ').replace(/\s+/g,' ').trim(); }
function tokenizeIngredients(text){
  // accetta "pasta, olio" o linee separate; rimuove quantità/numero/emoji
  return norm(text).split(/[,;\n]/).map(t=>t.replace(/\b(\d+([.,]\d+)?\s*(g|kg|ml|l|pz|x)?)\b/gi,'').trim()).filter(Boolean);
}
function scoreRecipe(rec, wanted){
  const pool = new Set([...(rec.ingredients||[]).map(i=>norm(i.ref||''))]);
  let hit = 0;
  for(const w of wanted){ for(const p of pool){ if(p.includes(w) || w.includes(p)){ hit++; break; } } }
  const time = rec.time || 999;
  return {id:rec.id, hit, time, rec};
}
function suggestRecipes(freeText, topN=6){
  const wanted = tokenizeIngredients(freeText);
  if(!wanted.length) return [];
  const scored = RECIPES.map(r => scoreRecipe(r, wanted)).filter(s=>s.hit>0);
  scored.sort((a,b)=> (b.hit-a.hit) || (a.time-b.time));
  return scored.slice(0, topN).map(s=>s.rec);
}

/* Camera helpers */
async function openCamera(){
  if(!navigator.mediaDevices?.getUserMedia) throw new Error('Fotocamera non supportata');
  genStream = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});
  $v.srcObject = genStream; await $v.play();
}
function closeCamera(){
  if(genStream){ genStream.getTracks().forEach(t=>t.stop()); genStream=null; }
  if($v){ $v.pause(); $v.srcObject=null; }
}
function captureFrameToCanvas(){
  if(!$v || !$c) return null;
  const w=$v.videoWidth, h=$v.videoHeight; if(!w||!h) return null;
  $c.width = w; $c.height=h; const ctx=$c.getContext('2d'); ctx.drawImage($v,0,0,w,h); return $c;
}
async function ocrCanvasText(canvas){
  if(!window.Tesseract) throw new Error('OCR non disponibile');
  const { data:{ text } } = await Tesseract.recognize(canvas, 'ita+eng', { logger:m=>{} });
  return text||'';
}

/* Bind generatore */
$genRun?.addEventListener('click', ()=>{
  const txt=$genInput.value||'';
  const recs=suggestRecipes(txt, 8);
  if(!recs.length){ $genStatus.textContent='Nessuna ricetta trovata con questi ingredienti.'; renderRecipes(RECIPES); return; }
  $genStatus.textContent=`Suggerite ${recs.length} ricette in base agli ingredienti.`;
  // render parziale: mostro solo i suggerimenti (senza alterare dataset globale)
  const backup = STATE;
  const html = recs.map(r=>{
    const yid=getYouTubeId(r); const favOn=FAVS.has(r.id)?'1':'0';
    const tagsHtml=(r.tags||[]).map(t=>`<span class="tag">${t}</span>`).join('');
    const meta=[r.time?`${r.time} min`:null,r.servings?`${r.servings} porz.`:null].filter(Boolean).join(' · ');
    return `
      <article class="card" data-id="${r.id}">
        <img src="${r.image||'assets/icons/icon-512.png'}" alt="${r.title||''}" loading="lazy">
        <div class="body" style="flex:1;min-width:0">
          <h3>${r.title||''}</h3>
          <p class="meta">${meta}</p>
          <div class="tags">${tagsHtml}</div>
          <div class="actions">
            <button class="fav" title="Preferito" aria-pressed="${favOn==='1'?'true':'false'}" data-fav="${r.id}" data-on="${favOn}">${favOn==='1'?'★':'☆'}</button>
            ${r.url? `<a class="btn btn-recipe" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>` : `<button class="btn btn-recipe" data-open-recipe="${r.id}">Ricetta</button>`}
            ${yid? `<button class="btn btn-video" data-youtube-id="${yid}">Guarda video</button>` : `<button class="btn" disabled>Guarda video</button>`}
          </div>
        </div>
      </article>`;
  }).join('');
  $wrap.innerHTML = html;
});
$genCam?.addEventListener('click', async ()=>{
  try{ $genStatus.textContent='Apro fotocamera…'; await openCamera(); $genStatus.textContent='Fotocamera attiva.'; }
  catch(e){ $genStatus.textContent='Errore: '+e.message; }
});
$genStop?.addEventListener('click', ()=>{ closeCamera(); $genStatus.textContent='Fotocamera chiusa.'; });
$genCap?.addEventListener('click', async ()=>{
  try{
    if(!genStream) await openCamera();
    const canvas=captureFrameToCanvas(); if(!canvas) throw new Error('Immagine non disponibile');
    $genStatus.textContent='Lettura OCR…';
    const text=await ocrCanvasText(canvas);
    const cleaned=text.replace(/\s{2,}/g,' ').trim();
    if(cleaned){
      // aggiunge in coda al textarea, separando con virgola
      const cur=$genInput.value.trim();
      $genInput.value = cur ? (cur.replace(/[,\s]*$/,'') + ', ' + cleaned) : cleaned;
      $genStatus.textContent='Testo riconosciuto aggiunto.';
    } else {
      $genStatus.textContent='Nessun testo riconosciuto.';
    }
  }catch(e){ $genStatus.textContent='Errore OCR: '+e.message; }
});

/* ===== Boot ===== */
(async function init(){
  try{
    initTheme(); readURLState(); bindHeader(); bindInteractions();
    renderSkeleton(6);
    RECIPES = await fetchRecipes();
    renderTagBar(RECIPES); renderRecipes(RECIPES); writeURLState(false);
  }catch(err){
    $wrap.innerHTML = `<div style="grid-column:1/-1;padding:20px">Errore: ${err.message}</div>`;
    console.error(err);
  }
})();

/* ===== Service Worker (GitHub Pages) ===== */
if ('serviceWorker' in navigator && location.hostname.endsWith('github.io')){
  window.addEventListener('load', async ()=>{
    try{
      const swUrl = `service-worker.js?v=${encodeURIComponent(ver)}`;
      const reg = await navigator.serviceWorker.register(swUrl);
      reg.addEventListener('updatefound', ()=>{
        const nw = reg.installing; if(!nw) return;
        nw.addEventListener('statechange', ()=>{
          if (nw.state==='installed' && navigator.serviceWorker.controller){
            setTimeout(()=>location.reload(), 400);
          }
        });
      });
    }catch(e){ console.warn('[SW]', e); }
  });
}
