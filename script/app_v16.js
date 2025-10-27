/* Ricette & Lista Spesa v16 stabile — video in nuova scheda */

// Config
const CFG = window.__RLS_CONFIG__ || {
  dataUrl: "assets/json/recipes-it.json",
  placeholderImage: "assets/icons/icon-512.png",
  ytTimeoutMs: 2000
};

// Stato
const STATE = {
  recipes: [],
  tags: new Set(),
  activeTags: new Set(),
  query: ""
};

// Shim fotocamera
window.ensureCameraPanel = window.ensureCameraPanel || function(){};
window.openCamera = window.openCamera || function(){ alert("Fotocamera non attiva"); };
window.closeCamera = window.closeCamera || function(){};
window.snapPhoto = window.snapPhoto || function(){};
window.handleUpload = window.handleUpload || function(){};

// Helpers
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const by = id => document.getElementById(id);
const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

// Boot
document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindUI();
  await loadData();
  renderAll();
  registerSW();
}

/* UI */
function bindUI() {
  on(by("search") || $('[type="search"]'), "input", e => {
    STATE.query = (e.target.value || "").trim().toLowerCase();
    renderRecipes();
  });

  on(by("btn-refresh-data"), "click", async () => {
    await loadData(true);
    renderAll();
  });

  attachChipHandlers();
}

/* Dati */
async function loadData(force) {
  const bust = force ? `?v=${Date.now()}` : "";
  const res = await fetch(`${CFG.dataUrl}${bust}`, { cache: "no-store" });
  if (!res.ok) { console.error("Errore dati", res.status); return; }
  const data = await res.json();
  const list = Array.isArray(data) ? data : data.recipes || [];
  STATE.recipes = list.map(r => ({
    title: r.title || r.nome || "",
    description: r.description || r.desc || "",
    image: r.image || r.img || "",
    tags: r.tags || r.etichetti || [],
    ingredients: r.ingredients || r.ingredienti || [],
    youtubeId: r.youtubeId || r.yt || ""
  }));

  STATE.tags = new Set();
  STATE.recipes.forEach(r => (r.tags || []).forEach(t => STATE.tags.add(String(t))));
}

/* Render */
function renderAll() {
  renderChips();
  renderRecipes();
}

function renderChips() {
  const wrap = by("tag-chips");
  if (!wrap) return;
  wrap.innerHTML = "";

  const mk = (label, active) => {
    const b = document.createElement("button");
    b.className = active ? "chip active" : "chip";
    b.textContent = label;
    return b;
  };

  wrap.appendChild(mk("Tutti", STATE.activeTags.size === 0));
  [...STATE.tags].sort().forEach(t => wrap.appendChild(mk(t, STATE.activeTags.has(t))));
  attachChipHandlers();
}

function attachChipHandlers() {
  const chips = $$(".chips .chip, .chips button, .chip");
  if (!chips.length) return;
  chips.forEach(btn => {
    btn.addEventListener("click", () => {
      const label = (btn.textContent || "").trim();
      const isAll = label.toLowerCase() === "tutti";
      if (isAll) {
        STATE.activeTags.clear();
        chips.forEach(b => b.classList.toggle("active", (b.textContent || "").trim().toLowerCase() === "tutti"));
        renderRecipes();
        return;
      }
      if (STATE.activeTags.has(label)) STATE.activeTags.delete(label);
      else STATE.activeTags.add(label);
      btn.classList.toggle("active");
      renderRecipes();
    });
  });
}

function renderRecipes() {
  const grid = by("recipes");
  if (!grid) return;
  grid.innerHTML = "";

  const q = STATE.query;
  const active = STATE.activeTags;

  const filtered = STATE.recipes.filter(r => {
    const txt = [
      String(r.title || ""),
      String(r.description || ""),
      Array.isArray(r.ingredients) ? r.ingredients.join(" ") : ""
    ].join(" ").toLowerCase();
    const okText = !q || txt.includes(q);
    const okTags = active.size === 0 || [...active].every(t => Array.isArray(r.tags) && r.tags.includes(t));
    return okText && okTags;
  });

  const tpl = by("tpl-recipe-card");

  filtered.forEach(r => {
    const fragOrEl = tpl ? tpl.content.cloneNode(true) : createCardSkeleton();
    const root = tpl ? fragOrEl.firstElementChild : fragOrEl;

    const img = root.querySelector(".thumb");
    const tit = root.querySelector(".title");
    const dsc = root.querySelector(".desc");
    const tgs = root.querySelector(".tags");
    let bVid = root.querySelector(".btn-video");
    const bAdd = root.querySelector(".btn-add");

    const src = r.image && String(r.image).trim() ? r.image : CFG.placeholderImage;
    if (img) {
      img.src = src;
      img.alt = r.title || "Ricetta";
      img.onerror = () => { img.onerror = null; img.src = CFG.placeholderImage; };
    }
    if (tit) tit.textContent = r.title || "Senza titolo";
    if (dsc) dsc.textContent = r.description || "";
    if (tgs) {
      tgs.innerHTML = "";
      (r.tags || []).forEach(t => {
        const s = document.createElement("span");
        s.className = "tag";
        s.textContent = t;
        tgs.appendChild(s);
      });
    }

    // Video, comportamento garantito
    const url = r.youtubeId && String(r.youtubeId).trim().length
      ? `https://youtu.be/${r.youtubeId}`
      : `https://www.youtube.com/results?search_query=${encodeURIComponent((r.title || "") + " ricetta")}`;

    if (bVid) {
      // trasforma in <a> per evitare handler JS rotti
      const a = document.createElement("a");
      a.textContent = bVid.textContent || "Guarda video";
      a.className = bVid.className || "btn-video";
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      bVid.replaceWith(a);
    } else {
      // se nel template non c'è, aggiungi il link
      const actions = root.querySelector(".actions") || root;
      const a = document.createElement("a");
      a.textContent = "Guarda video";
      a.className = "btn-video";
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      actions.appendChild(a);
    }

    if (bAdd) bAdd.addEventListener("click", () => alert(`Aggiunta: ${r.title || "Ricetta"}`));

    grid.appendChild(root);
  });
}

function createCardSkeleton() {
  const art = document.createElement("article");
  art.className = "card";
  art.innerHTML = `
    <div class="thumb-wrap"><img class="thumb" alt=""></div>
    <div class="card-body">
      <h3 class="title"></h3>
      <p class="desc"></p>
      <div class="tags"></div>
      <div class="actions">
        <button class="btn-video">Guarda video</button>
        <button class="btn-add">Aggiungi alla lista</button>
      </div>
    </div>`;
  return art;
}

/* SW */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
