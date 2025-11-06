// assets/js/yt-audit.v2.js
(function () {
  try {
    const T = 0.25; // soglia confidenza visiva
    const state = { rows: [], filter: 'all' };

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => Array.from(document.querySelectorAll(sel));

    function fmt(x) { return typeof x === 'number' ? x.toFixed(3) : (x || '0.000'); }

    function badge(row) {
      if (!row.youtubeId) return 'missing';
      const c = Number(row.confidence || 0);
      if (c >= T) return 'ok';
      if (c > 0) return 'low';
      return 'missing';
    }

    function render() {
      const body = $('#ytBody');
      if (!body) return;
      const rows = state.rows.filter(r => {
        const b = badge(r);
        if (state.filter === 'all') return true;
        if (state.filter === 'verified') return b === 'ok';
        if (state.filter === 'low') return b === 'low';
        if (state.filter === 'missing') return b === 'missing';
        return true;
      });

      if (!rows.length) {
        body.innerHTML = `<tr><td colspan="5" class="muted">Nessun risultato.</td></tr>`;
        return;
      }

      body.innerHTML = rows.map(r => {
        const b = badge(r);
        const cls =
          b === 'ok' ? 'row-ok' :
          b === 'low' ? 'row-low' : 'row-missing';
        const yt = r.youtubeId || '';
        const title = (r.videoTitle || '').replace(/\u0000/g,'').replace(/</g,'&lt;');
        const ch = (r.channelTitle || '').replace(/</g,'&lt;');
        const conf = fmt(Number(r.confidence || 0));
        const btn = yt
          ? `<button class="btn btn-small" data-watch="${yt}">Guarda</button>`
          : `<span class="muted">—</span>`;
        return `<tr class="${cls}">
          <td>${r.recipeTitle}</td>
          <td>${yt}</td>
          <td>${title}</td>
          <td>${ch}</td>
          <td>${conf} ${btn}</td>
        </tr>`;
      }).join('');

      // bind watch
      body.querySelectorAll('[data-watch]').forEach(el => {
        el.onclick = () => openModal(el.dataset.watch);
      });

      // counters
      const total = state.rows.length;
      $('#rowsTotal') && ($('#rowsTotal').textContent = `Righe totali: ${total}`);
    }

    function openModal(id) {
      const dlg = document.getElementById('videoModal');
      const frame = document.getElementById('ytFrame');
      if (!dlg || !frame) return;
      const url = `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`;
      frame.src = url;
      dlg.showModal();
      const ext = document.getElementById('openExternal');
      if (ext) ext.href = `https://youtu.be/${id}`;
    }

    function closeModal() {
      const dlg = document.getElementById('videoModal');
      const frame = document.getElementById('ytFrame');
      if (dlg && dlg.open) dlg.close();
      if (frame) frame.src = '';
    }

    function bindUI() {
      const dlg = document.getElementById('videoModal');
      const closeBtn = document.getElementById('closeModal');
      closeBtn && (closeBtn.onclick = closeModal);
      dlg && dlg.addEventListener('close', closeModal);

      $$('.chip').forEach(chip => {
        chip.onclick = () => {
          $$('.chip').forEach(c => c.classList.remove('chip--on'));
          chip.classList.add('chip--on');
          state.filter = chip.dataset.filter || 'all';
          render();
        };
      });
    }

    async function loadIndex() {
      // prova “risolto”, poi fallback
      const urls = [
        './assets/json/video_index.resolved.json',
        './assets/json/video_index.json'
      ];
      for (const u of urls) {
        try {
          const r = await fetch(`${u}?v=18`, { cache: 'no-store' });
          if (r.ok) {
            const j = await r.json();
            // normalizza in {recipeTitle, youtubeId, videoTitle, channelTitle, confidence}
            state.rows = (j || []).map(x => ({
              recipeTitle: x.title || x.recipeTitle || '',
              youtubeId: x.youtubeId || x.youtubeid || x.ytid || '',
              videoTitle: x.videoTitle || x.title_video || '',
              channelTitle: x.channelTitle || x.channel || '',
              confidence: Number(x.confidence || x.conf || 0)
            }));
            return;
          }
        } catch {}
      }
      state.rows = [];
    }

    document.addEventListener('DOMContentLoaded', async () => {
      bindUI();
      await loadIndex();
      render();
    });

  } catch (err) {
    console.warn('yt-audit disattivato:', err);
  }
})();
