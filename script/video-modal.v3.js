// Video Modal v3
(function () {
  const NS = 'videoModal';
  if (window[NS]) return;

  const S = { apiLoaded: false, player: null, currentId: null, timeoutMs: 4000, lastError: null, bound: false };

  function loadYTApiOnce () {
    if (S.apiLoaded) return Promise.resolve();
    return new Promise((resolve) => {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      tag.async = true;
      window.onYouTubeIframeAPIReady = () => { S.apiLoaded = true; resolve(); };
      document.head.appendChild(tag);
    });
  }

  function ensureDom () {
    if (document.getElementById('video-modal')) return;
    const tpl = `
      <div id="video-modal" class="vmodal hidden" aria-hidden="true">
        <div class="vm-backdrop" data-vm-close></div>
        <div class="vm-dialog" role="dialog" aria-label="Video">
          <button class="vm-close" data-vm-close aria-label="Chiudi">×</button>
          <div class="vm-frame"><div id="vm-player"></div></div>
          <div class="vm-actions"><a id="vm-open" target="_blank" rel="noopener">Apri su YouTube</a></div>
        </div>
      </div>
      <style>
        .vmodal.hidden { display: none }
        .vmodal { position: fixed; inset: 0; z-index: 9999; display: grid; place-items: center; background: rgba(0,0,0,.6) }
        .vm-dialog { width: min(920px, 90vw); background: #111; color: #fff; border-radius: 12px; overflow: hidden; position: relative }
        .vm-frame { position: relative; padding-top: 56.25%; background: #000 }
        .vm-frame > #vm-player { position: absolute; inset: 0 }
        .vm-close { position: absolute; top: 8px; right: 12px; font-size: 24px; background: transparent; color: #fff; border: 0; cursor: pointer }
        .vm-actions { display: flex; justify-content: center; gap: 12px; padding: 10px 12px }
        .vm-actions a { color: #0af; text-decoration: underline }
        .vm-backdrop { position: absolute; inset: 0 }
      </style>
    `;
    const wrap = document.createElement('div');
    wrap.innerHTML = tpl;
    document.body.appendChild(wrap);
  }

  function youTubeUrl (id) { return `https://www.youtube.com/watch?v=${id}&utm_source=app`; }
  function youTubeOriginParam () { try { return encodeURIComponent(location.origin); } catch(e) { return ''; } }

  function openInNewTabAndClose (id) {
    const url = youTubeUrl(id);
    try { window.open(url, '_blank', 'noopener'); } catch(e) {}
    api.close();
  }

  function createPlayer (id) {
    return new Promise((resolve) => {
      const el = document.getElementById('vm-player');
      if (!el) return resolve(null);
      const origin = youTubeOriginParam();
      const player = new YT.Player('vm-player', {
        videoId: id,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, origin },
        events: {
          onReady () { resolve(player); },
          onError (ev) {
            S.lastError = { code: ev && ev.data, time: Date.now() };
            if (window.debugTools) console.warn('YT error', S.lastError);
            openInNewTabAndClose(id);
          },
          onStateChange () {}
        }
      });
    });
  }

  function startTimeoutGuard (id) {
    const t = setTimeout(() => {
      if (!S.player) return;
      try {
        const state = S.player.getPlayerState();
        const notPlaying = state !== 1 && state !== 3;
        if (notPlaying) {
          S.lastError = { code: 'timeout', time: Date.now() };
          if (window.debugTools) console.warn('YT timeout guard');
          openInNewTabAndClose(id);
        }
      } catch(e) {
        S.lastError = { code: 'api-state-error', time: Date.now() };
        openInNewTabAndClose(id);
      }
    }, S.timeoutMs);
    return () => clearTimeout(t);
  }

  async function open (opts) {
    const id = normalizeId(opts);
    S.currentId = id;
    ensureDom();
    const modal = document.getElementById('video-modal');
    const a = document.getElementById('vm-open');
    a.href = youTubeUrl(id);
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');

    await loadYTApiOnce();
    S.player = null;
    const clear = startTimeoutGuard(id);
    S.player = await createPlayer(id);
    clear();
  }

  function close () {
    const modal = document.getElementById('video-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
    try { if (S.player && S.player.destroy) S.player.destroy(); } catch(e) {}
    S.player = null;
    S.currentId = null;
  }

  function bindGlobalOnce () {
    if (S.bound) return;
    S.bound = true;
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-video-id], [data-video-url]');
      if (!btn) return;
      e.preventDefault();
      const id = btn.getAttribute('data-video-id');
      const url = btn.getAttribute('data-video-url');
      open({ id, url });
    });
    document.addEventListener('click', e => { if (e.target.matches('[data-vm-close]')) close(); });
  }

  function normalizeId ({ id, url }) {
    if (id) return id;
    if (url) {
      try
