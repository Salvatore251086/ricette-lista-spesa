/* app.v16.js – v17 quality view + modal video */
(() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const byId = (id) => document.getElementById(id);

  const cfg = (window.APP_CONFIG || {});
  const RECIPES_URL = cfg.recipesUrl || "assets/json/recipes-it.json";
  const VIDEO_URL = cfg.videoIndexUrl || "assets/json/video_index.resolved.json";
  const CACHE_VER = cfg.cacheVersion || "v18";
  const MIN_CONF = (cfg.youtube && typeof cfg.youtube.minConfidence === "number")
    ? cfg.youtube.minConfidence : 0.30;

  const el = {
    filters: byId("filters"),
    grid: byId("grid"),
    ytBox: byId("yt-box") || byId("yt-table")?.parentElement || null,
    ytTable: byId("yt-table"),
    ytTbody: byId("yt-table") ? byId("yt-table").querySelector("tbody") : null,
    ytSummary: byId("yt-summary"),
    btnRefresh: byId("btn-refresh"),
  };

  function setText(node, text) { if (node) node.textContent = text; }
  function setHTML(node, html) { if (node) node.innerHTML = html; }

  async function jfetch(url) {
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

  function badge(status) {
    if (status === "ok") return "✅";
    if (status === "low") return "🟡";
    return "❌";
  }

  function statusOf(row) {
    const hasId = row.youtubeId && row.youtubeId.trim().length === 11;
    if (!hasId) return "missing";
    const c = typeof row.confidence === "number" ? row.confidence : 0;
    return c >= MIN_CONF ? "ok" : "low";
  }

  function ensureToolbar() {
    if (!el.ytBox) return { setCounts(){} };
    let bar = byId("yt-toolbar");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "yt-toolbar";
      bar.style.display = "flex";
      bar.style.gap = "8px";
      bar.style.alignItems = "center";
      bar.style.margin = "8px 0";
      bar.innerHTML = `
        <button class="pill" data-filter="all">Tutte</button>
        <button class="pill" data-filter="ok">Verificate</button>
        <button class="pill" data-filter="low">Bassa conf.</button>
        <button class="pill" data-filter="missing">Mancanti</button>
        <span id="yt-counts" style="margin-left:auto;font-size:12px;opacity:.8"></span>
      `;
      el.ytBox.insertBefore(bar, el.ytBox.firstChild);
      bar.addEventListener("click", e => {
        const b = e.target.closest("[data-filter]");
        if (!b) return;
        const f = b.getAttribute("data-filter");
        filterRows(f);
      });
    }
    const countsEl = byId("yt-counts");
    return {
      setCounts: (total, ok, low, miss) => {
        if (countsEl) countsEl.textContent = `Totali ${total} • ✅ ${ok} • 🟡 ${low} • ❌ ${miss}`;
      }
    };
  }

  function renderYTTable(rows) {
    if (!el.ytTbody || !el.ytSummary || !el.ytTable) return;

    const total = rows.length;
    let ok = 0, low = 0, miss = 0;

    const tr = rows.map(r => {
      const s = statusOf(r);
      if (s === "ok") ok++; else if (s === "low") low++; else miss++;
      const t = r.title || "";
      const id = r.youtubeId || "";
      const vt = r.matchTitle || "";
      const ch = r.channelTitle || "";
      const conf = typeof r.confidence === "number" ? r.confidence.toFixed(3) : "0.000";
      const safeTitle = t.replace(/[&<>]/g, "");
      return `
        <tr data-status="${s}" ${id ? `data-yt="${id}"` : ""} class="${s}">
          <td>${badge(s)} ${safeTitle}</td>
          <td>${id}</td>
          <td>${vt || ""}</td>
          <td>${ch || ""}</td>
          <td>${conf}</td>
        </tr>`;
    }).join("");

    setHTML(el.ytTbody, tr || "");
    setText(el.ytSummary, `Righe totali: ${total}. Mancano ID: ${miss}.`);

    // stile minimo per evidenza
    const styleId = "yt-status-style";
    if (!byId(styleId)) {
      const st = document.createElement("style");
      st.id = styleId;
      st.textContent = `
        tr.ok { background: rgba(40,167,69,.06); }
        tr.low { background: rgba(255,193,7,.06); }
        tr.missing { background: rgba(220,53,69,.06); }
        #yt-toolbar .pill { cursor:pointer; }
        #yt-table tbody tr { cursor: pointer; }
      `;
      document.head.appendChild(st);
    }

    // click su riga per aprire video
    el.ytTbody.addEventListener("click", onRowClick);

    // toolbar con conteggi
    ensureToolbar().setCounts(total, ok, low, miss);
  }

  function filterRows(f) {
    if (!el.ytTbody) return;
    const rows = $$("tr", el.ytTbody);
    rows.forEach(r => {
      const s = r.getAttribute("data-status");
      r.style.display = (f === "all" || f === s) ? "" : "none";
    });
  }

  function onRowClick(e) {
    const tr = e.target.closest("tr[data-yt]");
    if (!tr) return;
    const id = tr.getAttribute("data-yt");
    openVideoModal(id);
  }

  function openVideoModal(id) {
    const overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed; inset:0; background:rgba(0,0,0,.6);
      display:flex; align-items:center; justify-content:center; z-index:9999;
    `;
    const box = document.createElement("div");
    box.style.cssText = "background:#000; width:90%; max-width:960px; aspect-ratio:16/9; position:relative;";

    const close = document.createElement("button");
    close.textContent = "Chiudi";
    close.style.cssText = "position:absolute; top:8px; right:8px; z-index:2";
    close.onclick = () => overlay.remove();

    const iframe = document.createElement("iframe");
    iframe.width = "100%";
    iframe.height = "100%";
    iframe.setAttribute("allowfullscreen", "");
    iframe.setAttribute("allow", "accelerometer; autoplay; encrypted-media; picture-in-picture");
    iframe.src = `https://www.youtube-nocookie.com/embed/${id}?rel=0`;

    // fallback in 2000 ms
    const timer = setTimeout(() => {
      const link = document.createElement("a");
      link.href = `https://www.youtube.com/watch?v=${id}`;
      link.target = "_blank";
      link.rel = "noopener";
      link.textContent = "Apri su YouTube";
      link.style.cssText = "position:absolute; bottom:8px; right:8px; color:#fff; text-decoration:underline; z-index:2";
      box.appendChild(link);
    }, 2000);

    iframe.addEventListener("load", () => clearTimeout(timer));

    box.appendChild(close);
    box.appendChild(iframe);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  }

  function attachEvents(recipes) {
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
        } catch {
          setText(el.ytSummary, "Errore aggiornamento.");
        }
      });
    }
  }

  async function bootstrap() {
    try {
      setText(el.ytSummary, "Caricamento...");
      const [recipesJson, videoJson] = await Promise.all([
        jfetch(RECIPES_URL),
        jfetch(VIDEO_URL).catch(() => ([]))
      ]);
      const recipes = Array.isArray(recipesJson.recipes) ? recipesJson.recipes : [];
      const videoRows = Array.isArray(videoJson) ? videoJson : [];
      renderFilters(recipes);
      renderCards(recipes);
      renderYTTable(videoRows);
      attachEvents(recipes);
    } catch (err) {
      console.error(err);
      setText(el.ytSummary, "Errore nel caricamento.");
    }
  }

  bootstrap();
})();
