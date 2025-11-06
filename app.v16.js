<!-- app.v16.js -->
<script>
/* Ricette & Lista Spesa — app core v16
   Aggiornamenti:
   - Caricamento preferenziale di assets/json/video_index.resolved.json con fallback.
   - Funzioni modale video con YouTube-nocookie e fallback nuova scheda.
   - Pulsanti “Guarda” e azioni helper esposti in window.
   - Hard-reload friendly: nessuna cache su fetch dei JSON. */

(() => {
  "use strict";

  // Config percorsi
  const PATHS = {
    recipes: "assets/json/recipes-it.json",
    videoIndexResolved: "assets/json/video_index.resolved.json",
    videoIndexBase: "assets/json/video_index.json"
  };

  // Stato app
  const state = {
    recipes: [],
    videoIndex: [],
    // soglie e flag UI
    verifyThreshold: 0.25
  };

  // Helper DOM
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Helper fetch JSON senza cache
  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(url + " http " + r.status);
    return r.json();
  }

  // Carica ricette base
  async function loadRecipes() {
    try {
      state.recipes = await fetchJSON(PATHS.recipes);
    } catch (e) {
      console.error("recipes load error:", e);
      state.recipes = [];
    }
  }

  // Carica indice video: preferisci il “resolved”
  async function loadVideoIndex() {
    try {
      state.videoIndex = await fetchJSON(PATHS.videoIndexResolved);
      return;
    } catch {}
    try {
      state.videoIndex = await fetchJSON(PATHS.videoIndexBase);
      return;
    } catch (e) {
      console.error("video index load error:", e);
      state.videoIndex = [];
    }
  }

  // Lookup veloce per titolo → record video
  function makeVideoMap(rows) {
    const map = new Map();
    for (const r of rows) {
      // chiavi previste: title, youtubeId, channelTitle, confidence
      const key = (r.title || "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, r);
    }
    return map;
  }

  // Render cards ricette (sezione principale)
  function renderRecipeCards() {
    const grid = $("#cards");
    if (!grid) return;
    grid.innerHTML = "";
    for (const r of state.recipes) {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-body">
          <h3 class="card-title">${escapeHTML(r.title || "")}</h3>
          <div class="card-actions">
            <a class="btn btn-primary" href="${r.url || "#"}" target="_blank" rel="noopener">Preparazione</a>
            <button class="btn btn-secondary" data-open-video="${escapeHTML(r.title || "")}">Guarda</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    }
    // bind ai bottoni “Guarda”
    $$('[data-open-video]').forEach(btn => {
      btn.addEventListener("click", () => {
        const title = btn.getAttribute("data-open-video") || "";
        const rec = findVideoByTitle(title);
        if (rec && rec.youtubeId) {
          openModal(rec.youtubeId);
        } else {
          // fallback: prova ricerca canale o apri Google come estrema ratio
          window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(title), "_blank", "noopener");
        }
      });
    });
  }

  // Render tabella Verifica YouTube (tbody con id ytBody, badge filtri opzionali)
  function renderVerifyTable() {
    const tbody = $("#ytBody");
    if (!tbody) return;

    const badgeTotal = $("#ytTotal");
    const badgeOk = $("#ytOk");
    const badgeLow = $("#ytLow");
    const badgeMissing = $("#ytMissing");

    const rows = buildVerifyRows();
    // conteggi
    const total = rows.length;
    let ok = 0, low = 0, miss = 0;
    for (const r of rows) {
      if (!r.youtubeId) miss++;
      else if (Number(r.confidence || 0) >= state.verifyThreshold) ok++;
      else low++;
    }

    if (badgeTotal) badgeTotal.textContent = String(total);
    if (badgeOk) badgeOk.textContent = String(ok);
    if (badgeLow) badgeLow.textContent = String(low);
    if (badgeMissing) badgeMissing.textContent = String(miss);

    // filtro attivo dai bottoni audit se presenti
    const currentFilter = getCurrentFilter(); // "all" | "verified" | "low" | "missing"
    const filtered = rows.filter(r => {
      if (currentFilter === "all") return true;
      if (currentFilter === "verified") return r.youtubeId && Number(r.confidence || 0) >= state.verifyThreshold;
      if (currentFilter === "low") return r.youtubeId && Number(r.confidence || 0) < state.verifyThreshold;
      if (currentFilter === "missing") return !r.youtubeId;
      return true;
    });

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="muted">Nessun risultato.</td></tr>`;
      return;
    }

    const html = filtered.map(r => {
      const cls =
        !r.youtubeId ? "row-missing" :
        Number(r.confidence || 0) >= state.verifyThreshold ? "row-ok" : "row-low";
      const conf = Number(r.confidence || 0);
      const safeTitle = escapeHTML(r.title || "");
      const safeVideoTitle = escapeHTML(r.title || "");
      const safeChannel = escapeHTML(r.channelTitle || "");
      const btn = r.youtubeId
        ? `<button class="btn btn-small" data-watch="${r.youtubeId}">Guarda</button>`
        : `<span class="muted">—</span>`;

      return `
        <tr class="${cls}">
          <td>${safeTitle}</td>
          <td>${r.youtubeId || ""}</td>
          <td>${safeVideoTitle}</td>
          <td>${safeChannel}</td>
          <td class="num">${conf.toFixed(3)}</td>
          <td class="actions">${btn}</td>
        </tr>
      `;
    }).join("");

    tbody.innerHTML = html;

    // bind “Guarda”
    $$('[data-watch]').forEach(el => {
      el.onclick = () => openModal(el.getAttribute("data-watch") || "");
    });
  }

  // Costruisce righe unendo ricette e indice video
  function buildVerifyRows() {
    const map = makeVideoMap(state.videoIndex);
    const out = [];
    for (const r of state.recipes) {
      const title = (r.title || "").trim();
      const v = map.get(title.toLowerCase()) || {};
      out.push({
        title,
        youtubeId: v.youtubeId || "",
        channelTitle: v.channelTitle || "",
        confidence: v.confidence || 0
      });
    }
    return out;
  }

  // Legge filtro corrente se presente nella UI audit
  function getCurrentFilter() {
    const active = document.querySelector('[data-filter].active');
    if (!active) return "all";
    const f = active.getAttribute("data-filter");
    if (f === "verified" || f === "low" || f === "missing" || f === "all") return f;
    return "all";
  }

  // Trova record video per titolo ricetta
  function findVideoByTitle(title) {
    const key = (title || "").trim().toLowerCase();
    for (const r of state.videoIndex) {
      if ((r.title || "").trim().toLowerCase() === key) return r;
    }
    return null;
  }

  // Modale video
  function openModal(youtubeId) {
    if (!youtubeId) return;
    const modal = $("#videoModal");
    const iframe = $("#videoFrame");
    const openExternal = $("#openExternal");
    const closeBtn = $("#closeModal");

    if (!modal || !iframe) {
      // fallback
      window.open("https://www.youtube.com/watch?v=" + encodeURIComponent(youtubeId), "_blank", "noopener");
      return;
    }

    // carica NoCookie con policy più stretta possibile
    const src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(youtubeId) + "?autoplay=1&rel=0";
    iframe.src = src;
    if (openExternal) {
      openExternal.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(youtubeId);
    }

    modal.setAttribute("open", "true");

    const onFail = () => {
      // fallback robusto
      modal.removeAttribute("open");
      iframe.src = "";
      window.open("https://www.youtube.com/watch?v=" + encodeURIComponent(youtubeId), "_blank", "noopener");
    };

    // safety timeout
    const t = setTimeout(onFail, 2500);
    iframe.onload = () => clearTimeout(t);
    iframe.onerror = onFail;

    if (closeBtn) {
      closeBtn.onclick = () => {
        modal.removeAttribute("open");
        iframe.src = "";
      };
    }
  }

  // Espone per audit script e per bottoni delle card
  window.openModal = openModal;

  // Safe HTML
  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Dev helper: aggiorna dati via pulsante
  function bindRefresh() {
    const btn = $("#refreshData");
    if (!btn) return;
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      try {
        await loadData();
        renderRecipeCards();
        renderVerifyTable();
      } finally {
        btn.disabled = false;
      }
    });
  }

  async function loadData() {
    await Promise.all([
      loadRecipes(),
      loadVideoIndex()
    ]);
  }

  async function bootstrap() {
    // Bypass cache SW durante test se presente query ?nocache=1
    if (location.search.includes("nocache=1") && "serviceWorker" in navigator) {
      try {
        const regs = await navigator.serviceWorker.getRegistrations();
        for (const r of regs) await r.unregister();
        if (caches && caches.keys) {
          const keys = await caches.keys();
          await Promise.all(keys.map(k => caches.delete(k)));
        }
      } catch {}
    }

    await loadData();
    renderRecipeCards();
    renderVerifyTable();
    bindRefresh();
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
</script>
