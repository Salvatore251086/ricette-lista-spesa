/* Ricette & Lista Spesa — app core v16 aggiornato finale
   Aggiornamenti:
   - Caricamento preferenziale di assets/json/video_index.resolved.json con fallback
   - Riconoscimento formato recipes-it.json (object.recipes o array diretto)
   - Normalizzazione titoli e matching fuzzy (token + similarità Jaccard)
   - Modale video con YouTube-nocookie + fallback scheda nuova
   - Pulsante “Aggiorna dati” ricarica tutto senza cache
*/

(() => {
  "use strict";

  // Percorsi base
  const PATHS = {
    recipes: "assets/json/recipes-it.json",
    videoIndexResolved: "assets/json/video_index.resolved.json",
    videoIndexBase: "assets/json/video_index.json"
  };

  // Stato
  const state = {
    recipes: [],
    videoIndex: [],
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

  // Normalizza titoli
  function normalizeTitle(s) {
    return String(s || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9 ]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toTokens(s) {
    const stop = new Set([
      "di","de","da","del","della","al","alla","allo","con","e","ed","in","su","per","la","le","lo",
      "gli","il","i","dei","delle","degli","una","uno","un","ai","agli","alle"
    ]);
    return normalizeTitle(s).split(" ").filter(w => w && !stop.has(w));
  }

  function jaccard(aTokens, bTokens) {
    const A = new Set(aTokens);
    const B = new Set(bTokens);
    let inter = 0;
    for (const t of A) if (B.has(t)) inter++;
    const uni = A.size + B.size - inter;
    return uni ? inter / uni : 0;
  }

  // Carica ricette
  async function loadRecipes() {
    try {
      const data = await fetchJSON(PATHS.recipes);
      if (Array.isArray(data)) {
        state.recipes = data;
      } else if (data && Array.isArray(data.recipes)) {
        state.recipes = data.recipes;
      } else if (data && Array.isArray(data.items)) {
        state.recipes = data.items;
      } else {
        console.warn("Formato recipes-it.json non riconosciuto:", data);
        state.recipes = [];
      }
    } catch (e) {
      console.error("recipes load error:", e);
      state.recipes = [];
    }
  }

  // Carica indice video
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

  // Mappa video
  function makeVideoMap(rows) {
    const byKey = new Map();
    const all = [];
    for (const r of rows) {
      const key = normalizeTitle(r.title || "");
      const tokens = toTokens(r.title || "");
      const rec = {
        title: r.title || "",
        youtubeId: r.youtubeId || "",
        channelTitle: r.channelTitle || "",
        confidence: Number(r.confidence || 0),
        _key: key,
        _tokens: tokens
      };
      if (key && !byKey.has(key)) byKey.set(key, rec);
      all.push(rec);
    }
    return { byKey, all };
  }

  // Costruisce righe di verifica
  function buildVerifyRows() {
    const { byKey, all } = makeVideoMap(state.videoIndex);
    const out = [];
    for (const r of state.recipes) {
      const title = r.title || r.name || "";
      const key = normalizeTitle(title);
      const tokens = toTokens(title);

      let best = byKey.get(key);
      let bestScore = 0;

      if (!best) {
        for (const v of all) {
          const s = jaccard(tokens, v._tokens);
          if (s > bestScore) {
            bestScore = s;
            best = v;
          }
        }
      }

      const conf = best
        ? (best.confidence ? Number(best.confidence) : Number(bestScore))
        : 0;

      out.push({
        title,
        youtubeId: best && conf >= state.verifyThreshold ? best.youtubeId : "",
        channelTitle: best ? best.channelTitle : "",
        confidence: conf
      });
    }
    return out;
  }

  // Legge filtro attivo
  function getCurrentFilter() {
    const active = document.querySelector('[data-filter].active');
    if (!active) return "all";
    const f = active.getAttribute("data-filter");
    if (["verified","low","missing","all"].includes(f)) return f;
    return "all";
  }

  // Safe HTML
  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Trova video per titolo
  function findVideoByTitle(title) {
    const key = normalizeTitle(title);
    for (const r of state.videoIndex) {
      if (normalizeTitle(r.title) === key) return r;
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
      window.open("https://www.youtube.com/watch?v=" + encodeURIComponent(youtubeId), "_blank", "noopener");
      return;
    }

    const src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(youtubeId) + "?autoplay=1&rel=0";
    iframe.src = src;
    if (openExternal) openExternal.href = "https://www.youtube.com/watch?v=" + encodeURIComponent(youtubeId);
    modal.setAttribute("open", "true");

    const onFail = () => {
      modal.removeAttribute("open");
      iframe.src = "";
      window.open("https://www.youtube.com/watch?v=" + encodeURIComponent(youtubeId), "_blank", "noopener");
    };

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

  window.openModal = openModal;

  // Render cards
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
    $$('[data-open-video]').forEach(btn => {
      btn.addEventListener("click", () => {
        const title = btn.getAttribute("data-open-video") || "";
        const rec = findVideoByTitle(title);
        if (rec && rec.youtubeId) {
          openModal(rec.youtubeId);
        } else {
          window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(title), "_blank", "noopener");
        }
      });
    });
  }

  // Render tabella verifica
  function renderVerifyTable() {
    const tbody = $("#ytBody");
    if (!tbody) return;

    const badgeTotal = $("#ytTotal");
    const badgeOk = $("#ytOk");
    const badgeLow = $("#ytLow");
    const badgeMissing = $("#ytMissing");

    const rows = buildVerifyRows();
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

    const currentFilter = getCurrentFilter();
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

    $$('[data-watch]').forEach(el => {
      el.onclick = () => openModal(el.getAttribute("data-watch") || "");
    });
  }

  // Refresh manuale
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
