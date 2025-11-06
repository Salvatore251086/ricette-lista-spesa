/* app.v16.js – v17 compatibile con index.html attuale */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const byId = (id) => document.getElementById(id);

  const cfg = (window.APP_CONFIG || {});
  const RECIPES_URL = cfg.recipesUrl || "assets/json/recipes-it.json";
  const VIDEO_URL = cfg.videoIndexUrl || "assets/json/video_index.resolved.json";
  const CACHE_VER = cfg.cacheVersion || "v18";

  /* Safeguard: no error if nodes are missing */
  const el = {
    filters: byId("filters"),
    grid: byId("grid"),
    ytTable: byId("yt-table"),
    ytTbody: byId("yt-table") ? byId("yt-table").querySelector("tbody") : null,
    ytSummary: byId("yt-summary"),
    btnRefresh: byId("btn-refresh"),
  };

  function setText(node, text) {
    if (node) node.textContent = text;
  }
  function setHTML(node, html) {
    if (node) node.innerHTML = html;
  }

  async function jfetch(url) {
    // cache busting semplice
    const sep = url.includes("?") ? "&" : "?";
    const res = await fetch(`${url}${sep}cv=${encodeURIComponent(CACHE_VER)}&ts=${Date.now()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
    return res.json();
  }

  function renderCards(recipes) {
    if (!el.grid) return;
    const items = recipes.slice(0, 24).map(r => {
      const title = r.title || "Ricetta";
      const t = Array.isArray(r.tags) ? r.tags.slice(0, 3) : [];
      const pills = t.map(x => `<span class="pill">${x}</span>`).join("");
      return `
        <article class="card">
          <h3>${title}</h3>
          <div class="tools">${pills}</div>
        </article>`;
    }).join("");
    setHTML(el.grid, items || "");
  }

  function renderFilters(recipes) {
    if (!el.filters) return;
    const tags = new Map();
    recipes.forEach(r => (r.tags || []).forEach(t => tags.set(t, (tags.get(t) || 0) + 1)));
    const top = [...tags.entries()].sort((a,b)=>b[1]-a[1]).slice(0, 12);
    const html = top.map(([t, n]) =>
      `<button class="pill" data-tag="${t}" title="${n} ricette">${t}</button>`
    ).join("");
    setHTML(el.filters, html);
  }

  function renderYTTable(rows) {
    if (!el.ytTbody || !el.ytSummary || !el.ytTable) return;

    const total = rows.length;
    const withId = rows.filter(r => r.youtubeId && r.youtubeId.trim().length === 11);
    const missing = total - withId.length;

    const tr = rows.map(r => {
      const t = r.title || "";
      const id = r.youtubeId || "";
      const vt = r.matchTitle || "";
      const ch = r.channelTitle || "";
      const conf = typeof r.confidence === "number" ? r.confidence.toFixed(3) : "0.000";
      return `
        <tr>
          <td>${t}</td>
          <td>${id}</td>
          <td>${vt}</td>
          <td>${ch}</td>
          <td>${conf}</td>
        </tr>`;
    }).join("");

    setHTML(el.ytTbody, tr || "");
    setText(el.ytSummary, `Righe totali: ${total}. Mancano ID: ${missing}.`);
  }

  async function bootstrap() {
    try {
      setText(el.ytSummary, "Caricamento...");
      const [recipesJson, videoJson] = await Promise.all([
        jfetch(RECIPES_URL),
        jfetch(VIDEO_URL).catch(() => ([])) // se non esiste ancora il file, fallback a array
      ]);

      const recipes = Array.isArray(recipesJson.recipes) ? recipesJson.recipes : [];
      const videoRows = Array.isArray(videoJson) ? videoJson : [];

      renderFilters(recipes);
      renderCards(recipes);
      renderYTTable(videoRows);

      attachEvents(recipes, videoRows);
    } catch (err) {
      console.error(err);
      setText(el.ytSummary, "Errore nel caricamento.");
    }
  }

  function attachEvents(recipes, videoRows) {
    if (el.filters) {
      el.filters.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-tag]");
        if (!btn) return;
        const tag = btn.getAttribute("data-tag");
        const filtered = recipes.filter(r => (r.tags || []).includes(tag));
        renderCards(filtered);
      });
    }

    if (el.btnRefresh) {
      el.btnRefresh.addEventListener("click", async () => {
        try {
          setText(el.ytSummary, "Ricarico dati…");
          const rows = await jfetch(VIDEO_URL).catch(() => ([]));
          renderYTTable(Array.isArray(rows) ? rows : []);
        } catch (e) {
          console.error(e);
          setText(el.ytSummary, "Errore aggiornamento.");
        }
      });
    }
  }

  // Avvio
  bootstrap();
})();
