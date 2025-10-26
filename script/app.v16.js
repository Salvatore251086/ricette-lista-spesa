/* app.v16.js — build vdev5
   - Chip bar robusta (serve #chips + data-tag)
   - Suggeritore con sinonimi e match parziali
   - Bottone “Aggiorna dati”
   - Video modale con fallback
*/
/* ------------------ Video modale (robusta con doppio host + timeout) ------------------ */
(() => {
  const $ = (s, r=document) => r.querySelector(s);

  let wired = false;
  let inFlight = false;

  function buildUrl(host, id) {
    const params = new URLSearchParams({
      autoplay: '1',
      rel: '0',
      modestbranding: '1',
      playsinline: '1',
      enablejsapi: '1',
      origin: location.origin
    });
    return `https://${host}/embed/${id}?${params.toString()}`;
  }

  function ensureFrameAttrs(frame) {
    // Massima permissività necessaria a evitare 153 dovuti ad autoplay/pip
    frame.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    frame.setAttribute('allowfullscreen', '');
    // Referrer meno “rigido” del no-referrer (evita certi 153/204)
    frame.setAttribute('referrerpolicy', 'origin-when-cross-origin');
  }

  function openInNewTab(id) {
    window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener');
  }

  function showModal() {
    const modal = $('#video-modal');
    if (!modal) return false;
    modal.classList.add('show');
    modal.style.display = 'flex';
    document.body.classList.add('no-scroll');
    return true;
  }

  function hideModal() {
    const modal = $('#video-modal');
    const frame = $('#yt-frame');
    if (frame) frame.src = 'about:blank';
    if (modal) {
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
    document.body.classList.remove('no-scroll');
    inFlight = false;
  }

  async function tryLoadIntoFrame(url, frame, timeoutMs = 1500) {
    return new Promise((resolve, reject) => {
      let done = false;
      const onOk = () => { if (!done) { done = true; cleanup(); resolve(true); } };
      const onErr = () => { if (!done) { done = true; cleanup(); resolve(false); } };

      function cleanup() {
        frame.removeEventListener('load', onOk);
        frame.removeEventListener('error', onErr);
        clearTimeout(tid);
      }

      frame.addEventListener('load', onOk, { once: true });
      frame.addEventListener('error', onErr, { once: true });

      const tid = setTimeout(onErr, timeoutMs);
      frame.src = url;
    });
  }

  async function openVideoById(id) {
    if (inFlight) return; // evita doppi click
    inFlight = true;

    const modal = $('#video-modal');
    const frame = $('#yt-frame');

    if (!modal || !frame) {
      inFlight = false;
      return openInNewTab(id);
    }

    ensureFrameAttrs(frame);
    frame.src = 'about:blank';

    // Mostra subito la modale (gesto utente attivo)
    if (!showModal()) {
      inFlight = false;
      return openInNewTab(id);
    }

    // Strategia a due tentativi: nocookie -> youtube
    const hosts = ['www.youtube-nocookie.com', 'www.youtube.com'];
    for (const host of hosts) {
      const ok = await tryLoadIntoFrame(buildUrl(host, id), frame, 1600);
      if (ok) { inFlight = false; return; } // 🎉 caricato
      // pulisco e provo l’host successivo
      frame.src = 'about:blank';
      await new Promise(r => setTimeout(r, 120)); // micro-pausa
    }

    // Se arrivo qui, entrambe le prove non sono andate: fallback tab
    hideModal();
    openInNewTab(id);
    inFlight = false;
  }

  function bind() {
    if (wired) return;
    wired = true;

    // Click delegato sui bottoni video
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-video');
      if (!btn) return;
      const id = btn.dataset.youtubeId || btn.getAttribute('data-youtube-id') || '';
      if (!id) return;
      e.preventDefault();
      openVideoById(id);
    }, true);

    // Chiudi con backdrop, X o ESC
    document.addEventListener('click', (e) => {
      if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')) {
        e.preventDefault();
        hideModal();
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideModal();
    });
  }

  // Esporta per eventuali test manuali: openVideoById('XXXXXXXXXXX')
  window.openVideoById = openVideoById;
  window.bindVideoButtons = bind;

  // Avvia subito
  if (document.readyState !== 'loading') bind();
  else document.addEventListener('DOMContentLoaded', bind);
})();

  /* Sinonimi/espansioni leggere per il suggeritore */
  const SYN = {
    // pasta
    'pasta': ['spaghetti','spaghetto','penne','rigatoni','maccheroni','fusilli','farfalle'],
    'spaghetti': ['pasta','spaghetto'],
    // oli
    'olio': ['olio evo','extravergine','evo','olio extravergine'],
    // aglio/peperoncino
    'aglio': ['spicchio aglio','spicchi aglio'],
    'peperoncino': ['peperoncini','chili','diavolicchio'],
    // tonno
    'tonno': ['scatoletta tonno','tonno in scatola'],
    // riso
    'riso': ['riso carnaroli','riso arborio','carnaroli','arborio'],
    // pomodoro
    'pomodoro': ['pomodori','passata','pelati','polpa di pomodoro'],
  };

  function expandTerm(t) {
    const base = norm(t);
    const bag  = new Set([base]);
    (SYN[base] || []).forEach(x => bag.add(norm(x)));
    return bag;
  }

  /* ===== Data ===== */
  async function fetchRecipes(){
    const res = await fetch(DATA_URL, { cache:'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  /* ===== YouTube helper ===== */
  function getYouTubeId(r){
    if (!r) return '';
    if (r.youtubeId) return String(r.youtubeId).trim();
    if (r.ytid)      return String(r.ytid).trim();
    if (r.videoId)   return String(r.videoId).trim();
    if (r.video){
      const m = String(r.video).match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
      if (m) return m[1];
    }
    return '';
  }

  /* ===== Render ===== */
  function renderRecipes(list){
    const host = $('#recipes');
    if (!host) return;

    if (!Array.isArray(list) || !list.length){
      host.innerHTML = `<p class="muted">Nessuna ricetta trovata.</p>`;
      return;
    }

    host.innerHTML = list.map(r => {
      const img  = r.image || 'assets/icons/icon-512.png';
      const tags = Array.isArray(r.tags) ? r.tags : [];
      const tagsHtml = tags.map(t => `<span class="tag">${t}</span>`).join(' ');
      const yid  = getYouTubeId(r);

      const btnVideo = yid
        ? `<button class="btn btn-video" data-youtube-id="${yid}" aria-label="Guarda video ${r.title}">Guarda video</button>`
        : `<button class="btn btn-video" disabled title="Video non disponibile">Guarda video</button>`;

      const btnRicetta = r.url
        ? `<a class="btn btn-ghost" href="${r.url}" target="_blank" rel="noopener">Ricetta</a>`
        : '';

      return `
        <article class="recipe-card">
          <img class="thumb" src="${img}" alt="${r.title||''}" loading="lazy">
          <div class="body">
            <h3>${r.title || 'Senza titolo'}</h3>
            <p class="meta">
              ${r.time ? `${r.time} min` : ''}${r.servings ? ` · ${r.servings} porz.` : ''}
            </p>
            <p class="tags">${tagsHtml}</p>
            <div class="actions">
              ${btnRicetta}
              ${btnVideo}
            </div>
          </div>
        </article>
      `;
    }).join('');
  }

  /* ===== Filtri ===== */
  function applyFilters(){
    const base  = STATE.recipes;
    const needs = [...STATE.selectedTags].filter(t => t !== 'tutti').map(norm);
    const q     = norm(STATE.search);

    let out = base;

    if (needs.length){
      out = out.filter(r => {
        const bag = new Set((r.tags||[]).map(norm));
        for (const t of needs) if (!bag.has(t)) return false;
        return true;
      });
    }

    if (STATE.onlyFav){
      out = out.filter(r => r.favorite);
    }

    if (q){
      out = out.filter(r => {
        const hay = [
          r.title,
          ...(r.tags||[]),
          ...(r.ingredients||[]).map(i => i.ref || i.name || i.ingredient)
        ].filter(Boolean).map(norm).join(' ');
        return hay.includes(q);
      });
    }

    STATE.filtered = out;
    renderRecipes(out);
  }

  /* ===== Chip Bar ===== */
  function setupChips(){
    const bar = $('#chips');           // contenitore certo
    if (!bar) return;                  // se manca, niente chip

    // (opzionale) assicura data-tag dal testo se manca
    $$('.chip,[data-tag]', bar).forEach(el => {
      if (!el.dataset.tag) el.dataset.tag = norm(el.textContent);
    });

    bar.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip,[data-tag]');
      if (!chip) return;
      const tag = norm(chip.dataset.tag || chip.textContent);
      if (!tag) return;

      if (['tutti','tutto','all'].includes(tag)){
        STATE.selectedTags.clear();
        $$('.chip.active,[data-tag].active', bar).forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
      } else {
        $$('.chip[data-tag="tutti"].active, .chip[data-tag="tutto"].active, .chip[data-tag="all"].active', bar)
          .forEach(c => c.classList.remove('active'));
        chip.classList.toggle('active');
        if (chip.classList.contains('active')) STATE.selectedTags.add(tag);
        else STATE.selectedTags.delete(tag);
      }

      applyFilters();
    });
  }

  /* ===== Search & Solo preferiti ===== */
  function setupSearch(){
    const inp = $('#search');
    if (!inp) return;
    inp.addEventListener('input', () => {
      STATE.search = inp.value || '';
      applyFilters();
    });
  }

  function setupOnlyFav(){
    const sw = $('#only-fav');
    if (!sw) return;
    sw.addEventListener('change', () => {
      STATE.onlyFav = !!sw.checked;
      applyFilters();
    });
  }

  /* ===== Aggiorna dati ===== */
  function setupRefresh(){
    const btn = $('#btn-refresh');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      const oldTxt = btn.textContent;
      btn.textContent = 'Aggiorno…';
      try{
        STATE.recipes  = await fetchRecipes();     // refetch
        STATE.filtered = STATE.recipes.slice();
        // NON tocchiamo selectedTags/search/onlyFav → restano applicati
        applyFilters();
      }catch(err){
        alert('Errore aggiornamento: ' + err.message);
      }finally{
        btn.disabled = false;
        btn.textContent = oldTxt;
      }
    });
  }

  /* ===== Suggerisci ricette ===== */
  const tokenize = str => norm(str).split(/[^a-z0-9]+/).filter(Boolean);

  function suggestRecipes(text, N=6){
    const raw   = tokenize(text);
    if (!raw.length) return [];

    // espandi con sinonimi e crea set parole-cercate
    const wanted = new Set();
    raw.forEach(t => expandTerm(t).forEach(w => wanted.add(w)));

    function scoreRecipe(r){
      const words = new Set();

      // ingredienti
      (r.ingredients || []).forEach(i => {
        const w = tokenize(i.ref || i.name || i.ingredient);
        w.forEach(x => words.add(x));
      });
      // titolo
      tokenize(r.title).forEach(x => words.add(x));
      // tag
      (r.tags || []).forEach(t => tokenize(t).forEach(x => words.add(x)));

      let s = 0;

      // match esatto
      wanted.forEach(w => { if (words.has(w)) s += 2; });

      // match parziale (prefisso di almeno 4 char)
      wanted.forEach(w => {
        if (w.length < 4) return;
        for (const x of words) {
          if (x.startsWith(w) || w.startsWith(x)) { s += 1; break; }
        }
      });

      return s;
    }

    const scored = STATE.recipes
      .map(r => ({ r, s: scoreRecipe(r) }))
      .filter(x => x.s > 0)
      .sort((a,b) => b.s - a.s || norm(a.r.title).localeCompare(norm(b.r.title)))
      .slice(0, N)
      .map(x => x.r);

    return scored;
  }

  function setupSuggest(){
    const ta  = $('#ai-ingredients');
    const btn = $('#btn-suggest');
    if (!ta || !btn) return;

    const run = () => {
      const hits = suggestRecipes(ta.value || '', 6);
      if (!hits.length){
        alert('Nessuna ricetta trovata con questi ingredienti. Prova parole semplici (es. "pasta, aglio, olio").');
        return;
      }
      renderRecipes(hits);
      $('#recipes')?.scrollIntoView({ behavior:'smooth', block:'start' });
    };

    btn.addEventListener('click', run);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(); }
    });
  }

  /* ===== Modale Video ===== */
  function openVideoById(id){
    const modal = $('#video-modal');
    const frame = $('#yt-frame');
    if (!modal || !frame){
      window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener');
      return;
    }

    frame.src = 'about:blank';
    modal.classList.add('show');
    modal.style.display = 'flex';
    document.body.classList.add('no-scroll');

    const url = 'https://www.youtube-nocookie.com/embed/' + id +
      '?autoplay=1&rel=0&modestbranding=1&playsinline=1&origin=' + encodeURIComponent(location.origin);

    let loaded = false;
    const to = setTimeout(() => {
      if (!loaded){
        closeVideo();
        window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener');
      }
    }, 2000);

    frame.onload  = () => { loaded = true; clearTimeout(to); };
    frame.onerror = () => { clearTimeout(to); closeVideo(); window.open('https://www.youtube.com/watch?v='+id, '_blank', 'noopener'); };
    frame.src = url;
  }
  window.openVideoById = openVideoById;

  function closeVideo(){
    const modal = $('#video-modal');
    const frame = $('#yt-frame');
    if (frame) frame.src = 'about:blank';
    if (modal){
      modal.classList.remove('show');
      modal.style.display = 'none';
    }
    document.body.classList.remove('no-scroll');
  }

  function setupVideo(){
    document.addEventListener('click', (e) => {
      const btn = e.target.closest('.btn-video');
      if (!btn) return;
      e.preventDefault();
      const id = btn.dataset.youtubeId || '';
      if (id) openVideoById(id);
    });

    document.addEventListener('click', (e) => {
      if (e.target.id === 'video-close' || e.target.classList.contains('vm-backdrop')){
        e.preventDefault();
        closeVideo();
      }
    });

    window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeVideo(); });
  }

  /* ===== Boot ===== */
  (async function init(){
    try {
      const ver = $('#app-version');
      if (ver) ver.textContent = `v${APP_VERSION}`;

      STATE.recipes  = await fetchRecipes();
      STATE.filtered = STATE.recipes.slice();

      setupChips();
      setupSearch();
      setupOnlyFav();
      setupRefresh();
      setupSuggest();
      setupVideo();

      applyFilters();
    } catch (err) {
      const host = $('#recipes');
      if (host) host.innerHTML = `<p class="error">Errore nel caricamento dati: ${err.message}</p>`;
    }
  })();
})();
