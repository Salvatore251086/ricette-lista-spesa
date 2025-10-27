/* Ricette & Lista Spesa v16 stabile */

// Config base
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

// Shim fotocamera, evita errori se UI non presente
window.ensureCameraPanel = window.ensureCameraPanel || function(){};
window.openCamera = window.openCamera || function(){ alert("Fotocamera non attiva"); };
window.closeCamera = window.closeCamera || function(){};
window.snapPhoto = window.snapPhoto || function(){};
window.handleUpload = window.handleUpload || function(){};

// Helpers DOM
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

  // Chip già presenti nel layout
  attachChipHandlers();

  // Modale video
  ensureVideoModal();
  on(by("modal-close"), "click", closeModal);
  const backdrop = $('#video-modal .modal-backdrop');
  if (backdrop) on(backdrop, "click", closeModal);

  // Delega di backup per "Guarda video"
  document.body.addEventListener("click", e => {
    const btn = e.target.closest("button");
    if (!btn) return;
    const txt = (btn.textContent || "").toLowerCase();
    if (btn.classList.contains("btn-video") || txt.includes("guarda video")) {
      let yt = btn.dataset.yt || "";
      if (!yt) {
        const card = btn.closest(".card");
        const titleEl = card ? card.querySelector(".title") : null;
        const title = titleEl ? titleEl.textContent.trim() : (card?.dataset?.title || "");
        if (title) {
          const rec = (STATE.recipes || []).find(r => (r.title || "").trim() === title);
          yt = rec && rec.youtubeId ? rec.youtubeId : "";
        }
      }
      if (yt) openVideo(yt);
      else alert("Nessun video per questa ricetta");
    }
  });
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

/* Dati */
async function loadData(force) {
  const bust = force ? `?v=${Date.now()}` : "";
  const res = await fetch(`${CFG.dataUrl}${bust}`, { cache: "no-store" });
  if (!res.ok) {
    console.error("Errore dati", res.status);
    return;
  }
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
  STATE.tags && [...STATE.tags].sort().forEach(t => {
    wrap.appendChild(mk(t, STATE.activeTags.has(t)));
  });

  attachChipHandlers();
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
    const frag = tpl ? tpl.content.cloneNode(true) : createCardSkeleton();
    const root = frag.querySelector ? frag : frag.firstElementChild;

    const img = root.querySelector(".thumb");
    const tit = root.querySelector(".title");
    const dsc = root.querySelector(".desc");
    const tgs = root.querySelector(".tags");
    const bVid = root.querySelector(".btn-video");
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

    if (bVid) {
      root.dataset.title = r.title || "";
      bVid.dataset.yt = r.youtubeId || "";
      bVid.disabled = !(r.youtubeId && String(r.youtubeId).trim().length);
      if (r.youtubeId) bVid.addEventListener("click", () => openVideo(r.youtubeId));
    }

    if (bAdd) bAdd.addEventListener("click", () => alert(`Aggiunta: ${r.title || "Ricetta"}`));

    grid.appendChild(frag);
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

/* Video */
function ensureVideoModal() {
  if (by("video-modal")) return;
  const wrap = document.createElement("div");
  wrap.id = "video-modal";
  wrap.className = "modal";
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="modal-content">
      <button id="modal-close" class="close" aria-label="Chiudi">×</button>
      <div id="video-container"></div>
      <div id="video-fallback" class="fallback" hidden>
        <p>Problema nel caricare il video.</p>
        <a id="video-open-link" href="#" target="_blank" rel="noopener">Apri su YouTube</a>
      </div>
    </div>
    <div class="modal-backdrop"></div>`;
  document.body.appendChild(wrap);
}

function openVideo(ytId) {
  ensureVideoModal();

  const modal = by("video-modal");
  const container = by("video-container");
  const fallback = by("video-fallback");
  const openLink = by("video-open-link");

  container.innerHTML = "";
  fallback.hidden = true;

  const iframe = document.createElement("iframe");
  iframe.width = "560";
  iframe.height = "315";
  iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=0&rel=0`;
  iframe.title = "Video ricetta";
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.setAttribute("allowfullscreen", "");
  iframe.referrerPolicy = "no-referrer";

  container.appendChild(iframe);
  modal.hidden = false;
  document.body.classList.add("modal-open");

  const t = setTimeout(() => {
    fallback.hidden = false;
    openLink.href = `https://youtu.be/${ytId}`;
  }, CFG.ytTimeoutMs);

  iframe.onload = () => clearTimeout(t);
}

function closeModal() {
  const modal = by("video-modal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  const container = by("video-container");
  if (container) container.innerHTML = "";
}

/* SW */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
