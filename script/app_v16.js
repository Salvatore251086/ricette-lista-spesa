/* Ricette & Lista Spesa v16 stabile – ripristino
   - Filtri chip
   - Ricerca testo
   - Modale video con fallback link
   - Shim fotocamera per evitare errori
*/

const CFG = window.__RLS_CONFIG__ || {
  dataUrl: "assets/json/recipes-it.json",
  placeholderImage: "assets/icons/icon-512.png",
  ytTimeoutMs: 2000
};

const STATE = {
  recipes: [],
  tags: new Set(),
  activeTags: new Set(),
  query: ""
};

/* Shim fotocamera: evita errori se il pannello o i bottoni non esistono */
window.ensureCameraPanel = window.ensureCameraPanel || function(){};
window.openCamera       = window.openCamera       || function(){ alert("Fotocamera non attiva in questa versione."); };
window.closeCamera      = window.closeCamera      || function(){};
window.snapPhoto        = window.snapPhoto        || function(){};
window.handleUpload     = window.handleUpload     || function(){};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindUI();
  await loadData();
  renderAll();
  registerSW();
}

/* ---------- UI ---------- */
function $(sel){ return document.querySelector(sel); }
function on(el, ev, fn){ if (el) el.addEventListener(ev, fn); }

function bindUI() {
  on(document.getElementById("search") || document.querySelector('input[type="search"]'), "input", e => {
    STATE.query = (e.target.value || "").trim().toLowerCase();
    renderRecipes();
  });

  on(document.getElementById("btn-refresh-data") || document.querySelector('[data-action="refresh"]'), "click", async () => {
    await loadData(true);
    renderAll();
  });

  ensureVideoModal();
  on(document.getElementById("modal-close"), "click", closeModal);
  const backdrop = document.querySelector("#video-modal .modal-backdrop");
  on(backdrop, "click", closeModal);
}

/* ---------- DATA ---------- */
async function loadData(force) {
  const bust = force ? `?v=${Date.now()}` : "";
  const res = await fetch(`${CFG.dataUrl}${bust}`, { cache: "no-store" });
  if (!res.ok) { console.error("Errore caricamento dati", res.status); return; }
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

/* ---------- RENDER ---------- */
function renderAll() {
  renderChips();
  renderRecipes();
}

function renderChips() {
  const wrap = document.getElementById("tag-chips");
  if (!wrap) return;
  wrap.innerHTML = "";
  wrap.appendChild(chip("Tutti", () => { STATE.activeTags.clear(); renderAll(); }, STATE.activeTags.size === 0));
  [...STATE.tags].sort().forEach(t => {
    const active = STATE.activeTags.has(t);
    wrap.appendChild(chip(t, () => {
      if (STATE.activeTags.has(t)) STATE.activeTags.delete(t); else STATE.activeTags.add(t);
      renderRecipes();
    }, active));
  });
}

function chip(label, onClick, active) {
  const b = document.createElement("button");
  b.className = active ? "chip active" : "chip";
  b.textContent = label;
  b.addEventListener("click", onClick);
  return b;
}

function renderRecipes() {
  const grid = document.getElementById("recipes");
  if (!grid) return;
  grid.innerHTML = "";

  const q = STATE.query;
  const active = STATE.activeTags;

  const filtered = STATE.recipes.filter(r => {
    const text = [
      String(r.title || ""),
      String(r.description || ""),
      Array.isArray(r.ingredients) ? r.ingredients.join(" ") : ""
    ].join(" ").toLowerCase();

    const okText = !q || text.includes(q);
    const okTags = active.size === 0 || [...active].every(t => Array.isArray(r.tags) && r.tags.includes(t));
    return okText && okTags;
  });

  const tpl = document.getElementById("tpl-recipe-card");
  filtered.forEach(r => {
    const frag = tpl ? tpl.content.cloneNode(true) : createCardSkeleton();

    const root = frag.querySelector ? frag : frag.firstElementChild;
    const img  = root.querySelector(".thumb");
    const tit  = root.querySelector(".title");
   
