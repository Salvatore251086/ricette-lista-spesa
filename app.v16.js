/* Ricette & Lista Spesa — app core v16
   v20.1 fix: supporto JSON {recipes:[...]} o {items:[...]} o array
*/

(() => {
  "use strict";

  const PATHS = {
    recipes: "assets/json/recipes-it.json",
    videoIndexResolved: "assets/json/video_index.resolved.json",
    videoIndexBase: "assets/json/video_index.json"
  };

  const state = {
    recipes: [],
    videoIndex: [],
    verifyThreshold: 0.25
  };

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  async function fetchJSON(url) {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error(url + " http " + r.status);
    return r.json();
  }

  // Normalizza possibili forme del file ricette
  function normalizeRecipes(data) {
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.recipes)) return data.recipes;
    if (data && Array.isArray(data.items)) return data.items;
    return [];
  }

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
console.warn('recipes shape non riconosciuta');
state.recipes = [];
}
} catch (e) {
console.error('recipes load error:', e);
state.recipes = [];
}
}

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

  function makeVideoMap(rows) {
    const map = new Map();
    for (const r of rows) {
      const key = (r.title || "").trim().toLowerCase();
      if (!key) continue;
      map.set(key, r);
    }
    return map;
  }

  function escapeHTML(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function renderRecipeCards() {
    const grid = $("#cards");
    if (!grid) return;
    grid.innerHTML = "";

    if (!Array.isArray(state.recipes) || state.recipes.length === 0) {
      const empty = document.createElement("div");
      empty.className = "muted";
      empty.style.padding = "12px 16px";
      empty.textContent = "Zero sprechi, più idee in cucina.";
      grid.appendChild(empty);
      return;
    }

    for (const r of state.recipes) {
      const title = r.title || "";
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <div class="card-body">
          <h3 class="card-title">${escapeHTML(title)}</h3>
          <div class="card-actions">
            <a class="btn btn-primary" href="${r.url || "#"}" target="_blank" rel="noopener">Preparazione</a>
            <button class="btn btn-secondary" data-open-video="${escapeHTML(title)}">Guarda</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    }

    $$('[data-open-video]').forEach(btn => {
      btn.addEventListener("click", () => {
        const title = btn.getAttribute("data-open-video") || "";
        const rec = findVideoByTitle(title);
        if (rec && rec.youtubeId) openModal(rec.youtubeId);
        else window.open("https://www.youtube.com/results?search_query=" + encodeURIComponent(title), "_blank", "noopener");
      });
    });
  }

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
        videoTitle: v.title || "",
        confidence: Number(v.confidence || 0)
      });
    }
    return out;
  }

  function getCurrentFilter() {
    const active = document.querySelector('[data-filter].chip--on');
    if (!active) return "all";
    const f = active.getAttribute("data-filter");
    if (f === "verified" || f === "low" || f === "missing" || f === "all") return f;
    return "all";
  }

  function renderVerifyTable() {
    const tbody = $("#ytBody");
    if (!tbody) return;

    const rows = buildVerifyRows();

    const total = rows.length;
    let ok = 0, low = 0, miss = 0;
    for (const r of rows) {
      if (!r.youtubeId) miss++;
      else if (r.confidence >= state.verifyThreshold) ok++;
      else low++;
    }

    const setTxt = (sel, v) => { const el = document.querySelector(sel); if (el) el.textContent = String(v); };
    setTxt("#ytTotal", total);
    setTxt("#ytOk", ok);
    setTxt("#ytLow", low);
    setTxt("#ytMissing", miss);

    const current = getCurrentFilter();
    const filtered = rows.filter(r => {
      if (current === "all") return true;
      if (current === "verified") return r.youtubeId && r.confidence >= state.verifyThreshold;
      if (current === "low") return r.youtubeId && r.confidence < state.verifyThreshold;
      if (current === "missing") return !r.youtubeId;
      return true;
    });

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="muted">Nessun risultato.</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(r => {
      const cls =
        !r.youtubeId ? "row-missing" :
        r.confidence >= state.verifyThreshold ? "row-ok" : "row-low";
      const btn = r.youtubeId
        ? `<button class="btn btn-small" data-watch="${r.youtubeId}">Guarda</button>`
        : `<span class="muted">—</span>`;
      return `
        <tr class="${cls}">
          <td>${escapeHTML(r.title)}</td>
          <td>${r.youtubeId}</td>
          <td>${escapeHTML(r.videoTitle)}</td>
          <td>${escapeHTML(r.channelTitle)}</td>
          <td class="num">${r.confidence.toFixed(3)}</td>
          <td class="actions">${btn}</td>
        </tr>
      `;
    }).join("");

    $$('[data-watch]').forEach(el => {
      el.onclick = () => openModal(el.getAttribute("data-watch") || "");
    });
  }

  function findVideoByTitle(title) {
    const key = (title || "").trim().toLowerCase();
    for (const r of state.videoIndex) {
      if ((r.title || "").trim().toLowerCase() === key) return r;
    }
    return null;
  }

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

    if (closeBtn) closeBtn.onclick = () => {
      modal.removeAttribute("open");
      iframe.src = "";
    };
  }

  window.openModal = openModal;
  window.rls = { rerender: () => renderVerifyTable() };

  function bindFilters() {
    const root = document.querySelector(".audit-filters");
    if (!root) return;
    root.addEventListener("click", e => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      $$("[data-filter]").forEach(b => b.classList.remove("chip--on"));
      btn.classList.add("chip--on");
      renderVerifyTable();
    });
  }

  function bindSearch() {
    const input = $("#q");
    if (!input) return;
    input.addEventListener("input", () => {
      const term = input.value.trim().toLowerCase();
      const cards = $$(".card");
      if (!term) {
        cards.forEach(c => c.style.display = "");
        return;
      }
      cards.forEach(c => {
        const t = (c.querySelector(".card-title")?.textContent || "").toLowerCase();
        c.style.display = t.includes(term) ? "" : "none";
      });
    });
  }

  function bindRefresh() {
    const btn = $("#reloadData");
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
    await Promise.all([loadRecipes(), loadVideoIndex()]);
  }

  async function bootstrap() {
    await loadData();
    renderRecipeCards();
    bindFilters();
    renderVerifyTable();
    bindSearch();
    bindRefresh();
  }

  document.addEventListener("DOMContentLoaded", bootstrap);
})();
