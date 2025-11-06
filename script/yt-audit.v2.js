<script>
/* yt-audit.v2.js
   Carica assets/json/video_index.json o video_index.resolved.json.
   Espone window.YTAudit con:
     - ready() Promise
     - get(title) -> { youtubeId, channelId, channelTitle, confidence } | null
     - isVerified(row, threshold=0.25) -> boolean
     - openVideo(id) -> apre modale o nuova scheda
*/

(function(){
  const state = {
    map: new Map(),
    threshold: 0.25,
    allowed: new Set([
      '@giallozafferano',
      '@fattoincasadabenedetta',
      '@misyaincucina',
      '@lacucinaitaliana',
      '@cucchiaio',
      '@chefmaxmariola'
    ])
  };

  function fold(s){
    return String(s||'')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .toLowerCase().replace(/\s+/g,' ').trim();
  }

  async function load(){
    // prova prima il resolved, poi il base
    const paths = [
      'assets/json/video_index.resolved.json',
      'assets/json/video_index.json'
    ];
    let rows = [];
    for(const p of paths){
      try{
        const r = await fetch(p, { cache:'no-store' });
        if(r.ok){
          rows = await r.json();
          break;
        }
      }catch{}
    }
    // formati possibili: array di righe o {rows:[...]}
    if(!Array.isArray(rows) && rows && Array.isArray(rows.rows)) rows = rows.rows;

    state.map.clear();
    for(const row of rows){
      const key = fold(row.title);
      if(!key) continue;
      state.map.set(key, {
        youtubeId: row.youtubeId || row.id || '',
        channelId: row.channelId || '',
        channelTitle: row.channelTitle || '',
        confidence: Number(row.confidence || 0)
      });
    }
  }

  function get(title){
    return state.map.get(fold(title)) || null;
  }

  function isVerified(row, threshold){
    const th = typeof threshold === 'number' ? threshold : state.threshold;
    if(!row) return false;
    if(!row.youtubeId) return false;
    if(row.confidence < th) return false;
    // opzionale: vincola ad allowlist autore se presente
    if(row.channelTitle){
      const handle = row.channelTitle.startsWith('@') ? row.channelTitle : '@' + row.channelTitle.replace(/\s+/g,'').toLowerCase();
      if(state.allowed.size && ![...state.allowed].some(a => handle.startsWith(a))) {
        return false;
      }
    }
    return true;
  }

  // Modale minimal senza dipendenze
  function ensureModal(){
    if(document.getElementById('yt-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'yt-modal';
    wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;z-index:9999;padding:2rem;';
    wrap.innerHTML = `
      <div id="yt-box" style="width:min(960px,90vw);aspect-ratio:16/9;background:#000;position:relative;">
        <button id="yt-close" title="Chiudi" style="position:absolute;top:8px;right:8px;border:0;background:#0008;color:#fff;font-size:18px;cursor:pointer;padding:6px 10px;border-radius:6px;">×</button>
        <iframe id="yt-frame" width="100%" height="100%" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e => {
      if(e.target.id === 'yt-modal' || e.target.id === 'yt-close') closeModal();
    });
  }
  function openModal(id){
    ensureModal();
    const wrap = document.getElementById('yt-modal');
    const frame = document.getElementById('yt-frame');
    frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1';
    wrap.style.display = 'flex';
  }
  function closeModal(){
    const wrap = document.getElementById('yt-modal');
    const frame = document.getElementById('yt-frame');
    if(frame) frame.src = 'about:blank';
    if(wrap) wrap.style.display = 'none';
  }

  async function openVideo(id){
    // prova modale, poi fallback nuova scheda se non carica
    ensureModal();
    openModal(id);
    let ok = false;
    try{
      // piccolo ping: se entro 2s l'iframe non ha src valido, fallback
      await new Promise(res => setTimeout(res, 2000));
      ok = !!document.getElementById('yt-frame')?.src?.includes(id);
    }catch{}
    if(!ok){
      closeModal();
      window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener,noreferrer');
    }
  }

  window.YTAudit = {
    ready: (async ()=>{ await load(); })(),
    get, isVerified, openVideo,
    _reload: load
  };
})();
</script>
