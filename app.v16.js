/* app.v16.js
   Funzioni base per: caricamento ricette, tabella "Verifica YouTube",
   pulsanti Preparazione e Guarda video con modale YouTube NoCookie (+fallback).
   Dipendenza: script/yt-audit.v2.js (caricato in index.html).
*/

(function () {
  // Config percorsi (coerenti con project.config.json)
  const PATHS = {
    recipes: 'assets/json/recipes-it.json'
  };

  // Stato semplice
  const state = {
    recipes: [],
    filtered: []
  };

  // Utility
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const fold = (s) =>
    String(s || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();

  // Carica JSON ricette
  async function loadRecipes() {
    const url = PATHS.recipes + '?t=' + Date.now();
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('recipes fetch failed ' + r.status);
    const data = await r.json();
    // supporta sia array che {recipes:[...]}
    const rows = Array.isArray(data) ? data : Array.isArray(data.recipes) ? data.recipes : [];
    state.recipes = rows.map((x) => ({
      title: x.title || x.name || '',
      url: x.url || x.link || '',
      tags: x.tags || x.categories || []
    }));
    state.filtered = [...state.recipes];
  }

  // Monta chips ricette (facoltativo, non blocca il resto)
  function renderRecipeChips() {
    const host = $('#recipe-chips');
    if (!host) return;
    host.innerHTML = '';
    const pick = state.recipes.slice(0, 12);
    for (const r of pick) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = r.title;
      b.addEventListener('click', () => {
        openRecipe(r.url);
      });
      host.appendChild(b);
    }
  }

  // Ricerca testuale
  function bindSearch() {
    const input = $('#search-input');
    if (!input) return;
    input.addEventListener('input', () => {
      const q = fold(input.value);
      if (!q) {
        state.filtered = [...state.recipes];
      } else {
        state.filtered = state.recipes.filter((r) => fold(r.title).includes(q));
      }
      renderYoutubeAuditTable(state.filtered);
    });
  }

  // Apri pagina preparazione
  function openRecipe(url) {
    if (!url) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // Tabella Verifica YouTube
  async function renderYoutubeAuditTable(recipes) {
    // assicura YTAudit pronto
    if (window.YTAudit && YTAudit.ready) await YTAudit.ready;

    // trova tbody: accetta #yt-audit come <table> o direttamente <tbody id="yt-audit">
    let tbody = null;
    const box = $('#yt-audit') || $('#yt-audit-body') || $('#yt-audit tbody') || $('#yt-audit');
    if (!box) return;
    if (box.tagName === 'TBODY') tbody = box;
    else if (box.tagName === 'TABLE') tbody = $('tbody', box);
    else tbody = $('tbody', box) || $('#yt-audit-body');

    if (!tbody) return;
    tbody.innerHTML = '';

    let okCount = 0,
      lowCount = 0,
      missCount = 0;

    for (const r of recipes) {
      const v = window.YTAudit ? YTAudit.get(r.title) : null;
      const verified = window.YTAudit ? YTAudit.isVerified(v, 0.25) : false;

      if (verified) okCount++;
      else if (v && v.youtubeId) lowCount++;
      else missCount++;

      const tr = document.createElement('tr');
      tr.className = verified ? 'yt-ok' : v && v.youtubeId ? 'yt-low' : 'yt-miss';

      // Titolo ricetta
      const tdTitle = document.createElement('td');
      tdTitle.textContent = r.title || '';
      tr.appendChild(tdTitle);

      // youtubeId
      const tdId = document.createElement('td');
      tdId.textContent = v?.youtubeId || '';
      tr.appendChild(tdId);

      // Titolo video (se presente in indice)
      const tdVt = document.createElement('td');
      tdVt.textContent = v?.videoTitle || v?.matchTitle || '';
      tr.appendChild(tdVt);

      // Canale
      const tdCh = document.createElement('td');
      tdCh.textContent = v?.channelTitle || '';
      tr.appendChild(tdCh);

      // Confidenza
      const tdCf = document.createElement('td');
      tdCf.textContent = (v?.confidence ?? 0).toFixed(3);
      tr.appendChild(tdCf);

      // Azioni
      const tdAct = document.createElement('td');
      tdAct.style.whiteSpace = 'nowrap';

      if (r.url) {
        const bPrep = document.createElement('button');
        bPrep.type = 'button';
        bPrep.className = 'btn btn-recipe';
        bPrep.textContent = 'Preparazione';
        bPrep.addEventListener('click', () => openRecipe(r.url));
        tdAct.appendChild(bPrep);
      }

      if (verified) {
        const bVid = document.createElement('button');
        bVid.type = 'button';
        bVid.className = 'btn btn-video';
        bVid.textContent = 'Guarda video';
        bVid.addEventListener('click', () => {
          if (window.YTAudit) YTAudit.openVideo(v.youtubeId);
          else window.open('https://www.youtube.com/watch?v=' + v.youtubeId, '_blank', 'noopener,noreferrer');
        });
        tdAct.appendChild(bVid);
      }

      tr.appendChild(tdAct);
      tbody.appendChild(tr);
    }

    // contatori
    const elOk = $('#yt-count-ok');
    const elLow = $('#yt-count-low');
    const elMiss = $('#yt-count-miss');
    if (elOk) elOk.textContent = okCount;
    if (elLow) elLow.textContent = lowCount;
    if (elMiss) elMiss.textContent = missCount;
  }

  // Pulsante “Aggiorna dati”
  function bindRefresh() {
    const btn = $('#btn-refresh') || $$('button').find((b) => b.textContent.trim() === 'Aggiorna dati');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        await loadRecipes();
        renderRecipeChips();
        await renderYoutubeAuditTable(state.filtered);
      } finally {
        await wait(200);
        btn.disabled = false;
      }
    });
  }

  // Pulsante “Dev” per forzare ricarica indice video lato client
  function bindDevReloadVideoIndex() {
    const btn = $('#btn-dev') || $$('button').find((b) => b.textContent.trim() === 'Dev');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      try {
        if (window.YTAudit && YTAudit._reload) await YTAudit._reload();
        await renderYoutubeAuditTable(state.filtered);
      } finally {
        await wait(150);
        btn.disabled = false;
      }
    });
  }

  async function bootstrap() {
    try {
      await loadRecipes();
    } catch (e) {
      console.error('Errore caricamento ricette:', e);
      return;
    }
    renderRecipeChips();
    bindSearch();
    bindRefresh();
    bindDevReloadVideoIndex();
    await renderYoutubeAuditTable(state.filtered);
  }

  window.addEventListener('DOMContentLoaded', bootstrap);

  // API opzionali
  window.RLS = {
    refresh: async () => {
      await loadRecipes();
      await renderYoutubeAuditTable(state.filtered);
    },
    renderAuditNow: async () => renderYoutubeAuditTable(state.filtered)
  };
})();
