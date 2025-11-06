<script>
/* RLS - YouTube Audit v2 */
(function () {
  'use strict';

  const THRESHOLD = 0.25;          // soglia confidenza visiva
  const SRC = 'assets/json/video_index.resolved.json';

  // helpers
  const $  = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  function fmt(x) {
    if (typeof x === 'number') return x.toFixed(3);
    const n = Number(x || 0);
    return isFinite(n) ? n.toFixed(3) : '';
  }

  function badgeOf(row) {
    if (!row.youtubeId) return 'missing';
    const c = Number(row.confidence || 0);
    if (c >= THRESHOLD) return 'ok';
    if (c > 0) return 'low';
    return 'missing';
  }

  function rowHtml(r, idx) {
    const badge = badgeOf(r);
    const cl =
      badge === 'ok' ? 'row-ok' :
      badge === 'low' ? 'row-low' : 'row-missing';

    const title = String(r.title || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const vtitle = String(r.vtitle || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const channel = String(r.channelTitle || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const conf = fmt(Number(r.confidence || 0));

    const yt = String(r.youtubeId || '');

    const watchBtn = yt
      ? `<button class="btn btn-small" data-watch="${yt}">Guarda</button>`
      : `<span class="muted">—</span>`;

    return `
      <tr class="${cl}" data-badge="${badge}">
        <td class="col-title">
          <span class="dot ${cl}"></span>
          ${title}
        </td>
        <td class="mono">${yt}</td>
        <td>${vtitle}</td>
        <td>${channel}</td>
        <td class="mono">${conf}</td>
        <td>${watchBtn}</td>
      </tr>
    `;
  }

  function bindWatchHandlers() {
    $$('[data-watch]').forEach(el => {
      el.onclick = (e) => {
        const id = el.dataset.watch;
        // Preferisci la modale se presente
        if (typeof window.openVideoModal === 'function') {
          window.openVideoModal(id);
        } else {
          const url = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1`;
          window.open(url, '_blank', 'noopener,noreferrer');
        }
      };
    });
  }

  // Stato UI
  let rows = [];
  let filter = 'all'; // all | verified | low | missing

  function applyFilter() {
    const tbody = $('#ytBody');
    if (!tbody) return;

    const toShow = rows.filter(r => {
      const b = badgeOf(r);
      if (filter === 'all') return true;
      if (filter === 'verified') return b === 'ok';
      if (filter === 'low') return b === 'low';
      if (filter === 'missing') return b === 'missing';
      return true;
    });

    if (toShow.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Nessun risultato.</td></tr>`;
    } else {
      tbody.innerHTML = toShow.map(rowHtml).join('');
    }

    // contatori badge se presenti
    const total = rows.length;
    const v = rows.filter(r => badgeOf(r) === 'ok').length;
    const l = rows.filter(r => badgeOf(r) === 'low').length;
    const m = rows.filter(r => badgeOf(r) === 'missing').length;

    const badgeTotal = $('#badgeTotal');
    const badgeVerified = $('#badgeVerified');
    const badgeLow = $('#badgeLow');
    const badgeMissing = $('#badgeMissing');
    if (badgeTotal)   badgeTotal.textContent = String(total);
    if (badgeVerified) badgeVerified.textContent = String(v);
    if (badgeLow)      badgeLow.textContent = String(l);
    if (badgeMissing)  badgeMissing.textContent = String(m);

    // evidenzia filtro attivo
    $$('.yt-filter').forEach(b => b.classList.remove('active'));
    const active = document.querySelector(`.yt-filter[data-filter="${filter}"]`);
    if (active) active.classList.add('active');

    bindWatchHandlers();
  }

  function bindFilters() {
    $$('.yt-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        filter = btn.dataset.filter || 'all';
        applyFilter();
      });
    });
  }

  async function loadData() {
    try {
      const res = await fetch(SRC, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // normalizza chiavi in input
      rows = (Array.isArray(data) ? data : data.rows || [])
        .map(r => ({
          title: r.title || r.titolo || '',
          youtubeId: r.youtubeId || r.youtubeld || r.yt || '',
          vtitle: r.videoTitle || r.titoloVideo || r.titolo_video || '',
          channelTitle: r.channel || r.channelTitle || '',
          confidence: Number(r.confidence || r.conf || 0)
        }));
      applyFilter();
      console.log('yt-audit caricato, righe:', rows.length);
    } catch (err) {
      console.warn('yt-audit non caricato, UI ok', err);
      // Mostra tabella vuota ma funzionante
      rows = [];
      applyFilter();
    }
  }

  // Boot
  document.addEventListener('DOMContentLoaded', () => {
    bindFilters();
    loadData();
  });
})();
</script>
