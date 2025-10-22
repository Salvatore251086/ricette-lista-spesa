// app.js — patch v9: verifica link + video YouTube
// 1) subito sotto le costanti già presenti
const ALLOWED_RECIPE_DOMAINS = [
  'www.giallozafferano.it',
  'www.fattoincasadabenedetta.it',
  'www.cucchiaio.it',
  'www.misya.info',
  'www.lacucinaitaliana.it',
  'blog.giallozafferano.it',
  'www.youtube.com',
  'youtu.be'
];

// 2) funzioni utili da aggiungere vicino alle utilità
function isYouTubeUrl(u){
  try {
    const url = new URL(u);
    return url.hostname === 'www.youtube.com' || url.hostname === 'youtu.be';
  } catch { return false; }
}
function getYouTubeId(u){
  try {
    const url = new URL(u);
    if (url.hostname === 'youtu.be') return url.pathname.split('/')[1] || '';
    if (url.hostname === 'www.youtube.com'){
      if (url.pathname === '/watch') return url.searchParams.get('v') || '';
      if (url.pathname.startsWith('/shorts/')) return url.pathname.split('/')[2] || '';
      if (url.pathname.startsWith('/embed/')) return url.pathname.split('/')[2] || '';
    }
    return '';
  } catch { return ''; }
}
function normalizeVideo(r){
  // accetta r.video come ID o URL; se manca, prova da r.url
  const v = r.video || '';
  if (typeof v === 'string' && v.trim()){
    return v.includes('http') ? getYouTubeId(v) : v.trim();
  }
  if (r.url && isYouTubeUrl(r.url)) return getYouTubeId(r.url);
  return '';
}
function isLikelyRecipeUrl(u){
  try {
    const url = new URL(u);
    if (!ALLOWED_RECIPE_DOMAINS.includes(url.hostname)) return false;
    if (isYouTubeUrl(u)) return true;
    const p = url.pathname.toLowerCase();
    return /(ricetta|recipe|/ricette/|/recipes/)/.test(p) || p.endsWith('.html');
  } catch { return false; }
}

// 3) sostituisci la funzione cardRecipe con questa versione
function cardRecipe(r){
  const mins = toNumber(r.time);
  const ing = toIngredients(r).slice(0,6).map(escapeHtml).join(', ');
  const tags = toTags(r).slice(0,3).map(t=>`<span class="pill">${escapeHtml(t)}</span>`).join(' ');
  const img = imageSrc(r);
  const shareTxt = encodeURIComponent(`Ricetta: ${r.title}\nIngredienti: ${toIngredients(r).join(', ')}`);
  const shareUrl = `https://wa.me/?text=${shareTxt}`;
  const fav = isFav(r);
  const rid = escapeHtml(r.id || r.title || '');
  const ytId = normalizeVideo(r);
  const hasVideo = !!ytId;
  const hasUrl = !!r.url;
  const verified = hasUrl ? isLikelyRecipeUrl(r.url) : false;

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
  `;
}

// 4) estendi attachCardHandlers aggiungendo la gestione video
// trova la funzione attachCardHandlers e aggiungi questo blocco in coda, senza rimuovere il resto
qsa('.btn.btn-video').forEach(btn=>{
  btn.onclick = e=>{
    const card = e.target.closest('.card');
    const box = card.querySelector('.video-wrap');
    if (!box) return;
    box.classList.toggle('hidden');
    gtagSafe('event','open_video',{id: btn.dataset.yt});
  };
});
