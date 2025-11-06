// script/yt-audit.v2.js
// Carica l'indice video, espone YTAudit.get/title, isVerified, openVideo, _reload

(function () {
  const PATHS = {
    resolved: 'assets/json/video_index.resolved.json',
    primary:  'assets/json/video_index.json',
    fallback: 'assets/json/video_catalog.primary.json' // facoltativo
  };

  const S = {
    ready: null,
    map: new Map(),   // key: titolo normalizzato, value: best match
  };

  const fold = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  async function fetchJSON(url) {
    const r = await fetch(url + '?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) throw new Error('fetch failed ' + url + ' ' + r.status);
    return r.json();
  }

  function bestOf(list) {
    if (!Array.isArray(list) || !list.length) return null;
    return list
      .slice()
      .sort((a, b) => (Number(b.confidence || 0) - Number(a.confidence || 0)))
      .[0];
  }

  function buildMap(rows) {
    S.map.clear();
    for (const r of rows) {
      // r.title = titolo ricetta, youtubeId, videoTitle, channelTitle, confidence
      if (!r || !r.title) continue;
      const key = fold(r.title);
      const entry = {
        title: r.title || '',
        youtubeId: r.youtubeId || r.youtubeIdRaw || '',
        videoTitle: r.videoTitle || r.matchTitle || '',
        channelTitle: r.channelTitle || r.channel || '',
        confidence: Number(r.confidence || 0)
      };
      const prev = S.map.get(key);
      if (!prev || entry.confidence > prev.confidence) S.map.set(key, entry);
    }
  }

  async function loadIndex() {
    // ordine di priorità: resolved -> primary -> fallback
    let data = null;
    try {
      data = await fetchJSON(PATHS.resolved);
    } catch {}
    if (!data) {
      try {
        data = await fetchJSON(PATHS.primary);
      } catch {}
    }
    if (!data) {
      try {
        data = await fetchJSON(PATHS.fallback);
      } catch {}
    }
    // Normalizza possibili formati
    let rows = [];
    if (Array.isArray(data)) rows = data;
    else if (Array.isArray(data?.rows)) rows = data.rows;
    else if (Array.isArray(data?.items)) rows = data.items;
    buildMap(rows);
  }

  function ensureModal() {
    if (document.getElementById('yt-modal')) return;
    const wrap = document.createElement('div');
    wrap.id = 'yt-modal';
    wrap.style.cssText =
      'position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:9999';
    wrap.innerHTML = `
      <div id="yt-box" style="width:90%;max-width:960px;aspect-ratio:16/9;background:#000;position:relative;border-radius:12px;overflow:hidden">
        <button id="yt-close" aria-label="Chiudi" style="position:absolute;top:8px;right:8px;border:0;border-radius:8px;background:#0008;color:#fff;padding:6px 10px;cursor:pointer">×</button>
        <iframe id="yt-frame" width="100%" height="100%" frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen referrerpolicy="no-referrer"></iframe>
      </div>`;
    document.body.appendChild(wrap);
    document.getElementById('yt-close').onclick = () => closeVideo();
    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) closeVideo();
    });
  }

  function openVideo(id) {
    if (!id) return;
    ensureModal();
    const host = document.getElementById('yt-modal');
    const iframe = document.getElementById('yt-frame');
    // NoCookie, con fallback post-messaggio se onerror non scatta
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
    host.style.display = 'flex';
    // fallback apertura nuova scheda se l’embed non carica in 2s
    let ok = false;
    const probe = setTimeout(() => {
      if (!ok) window.open('https://www.youtube.com/watch?v=' + id, '_blank', 'noopener,noreferrer');
    }, 2000);
    iframe.onload = () => {
      ok = true;
      clearTimeout(probe);
    };
  }

  function closeVideo() {
    const host = document.getElementById('yt-modal');
    const iframe = document.getElementById('yt-frame');
    if (iframe) iframe.src = 'about:blank';
    if (host) host.style.display = 'none';
  }

  // API pubblica
  const API = {
    get: (title) => S.map.get(fold(title)) || null,
    isVerified: (entry, thres) => {
      if (!entry || !entry.youtubeId) return false;
      const t = typeof thres === 'number' ? thres : 0.25;
      return Number(entry.confidence || 0) >= t;
    },
    openVideo,
    _reload: async () => {
      await loadIndex();
      return true;
    }
  };

  // Boot
  S.ready = (async () => {
    await loadIndex();
  })();

  // Espone global
  window.YTAudit = API;
  Object.defineProperty(window.YTAudit, 'ready', {
    get() {
      return S.ready;
    }
  });
})();
