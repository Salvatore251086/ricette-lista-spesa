// Adatta i tuoi bottoni "Guarda video" alla modale YouTube con fallback
(function () {
  if (!window.videoModal) return; // modale già caricata

  function findVideoIdFrom(el) {
    // 1. data-video-id sul bottone o parent
    const own = el.getAttribute('data-video-id') || el.dataset.videoId;
    if (own) return own;
    const parent = el.closest('[data-video-id]');
    if (parent) return parent.getAttribute('data-video-id');

    // 2. href con youtube
    const a = el.closest('a');
    const href = a && a.getAttribute('href');
    if (href && /youtu(\.be|be\.com)/.test(href)) {
      try {
        const u = new URL(href, location.href);
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1);
        const v = u.searchParams.get('v');
        if (v) return v;
        const m = href.match(/[a-zA-Z0-9_-]{11}/);
        if (m) return m[0];
      } catch(_) {}
    }

    // 3. data-video-url
    const url = el.getAttribute('data-video-url');
    if (url) {
      const m = url.match(/[a-zA-Z0-9_-]{11}/);
      if (m) return m[0];
    }
    return '';
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('button, a');
    if (!btn) return;
    // testi tipici del tuo UI
    const label = (btn.textContent || '').trim().toLowerCase();
    const isWatch = label === 'guarda video' || btn.matches('[data-video-id],[data-video-url]');
    if (!isWatch) return;

    const id = findVideoIdFrom(btn);
    if (!id) return;
    e.preventDefault();
    window.videoModal.open({ id });
  });
})();
