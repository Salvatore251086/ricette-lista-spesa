/* Ricette & Lista Spesa v17 — safe binding */

const CFG = window.__RLS_CONFIG__ || {
  dataUrl: "assets/json/recipes-it.json",
  placeholderImage: "assets/icons/icon-512.png",
  ytTimeoutMs: 2000
};

let STATE = { recipes: [], tags: new Set(), activeTags: new Set(), query: "", stream: null };

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindUI();
  await loadData();
  renderAll();
  registerSW();
}

/* Utils */
const $  = s => document.querySelector(s);
const by = id => document.getElementById(id);
const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };
const any = (...sels) => sels.map(s => typeof s === "string" ? $(s) : s).find(Boolean);

/* UI binding sicuro */
function bindUI() {
  on(by("search") || $('[type="search"]'), "input", e => {
    STATE.query = (e.target.value || "").trim().toLowerCase();
    renderRecipes();
  });

  on(by("btn-refresh-data") || any('[data-action="refresh"]','button[id*="refresh"]'),
     "click", async () => { await loadData(true); renderAll(); });

  // Video modal
  ensureVideoModal();
  on(by("modal-close"), "click", closeModal);
  on($('#video-modal .modal-backdrop'), "click", closeModal);

  // Fotocamera
  ensureCameraPanel();
  on(by("btn-open-camera") || any('[data-action="open-camera"]','button.open-camera'), "click", openCamera);
  on(by("cam-snap")       || any('[data-action="snap"]','button.snap-ocr'),          "click", snapPhoto);
  on(by("cam-close")      || any('[data-action="close-camera"]','button.close-camera'), "click", closeCamera);
  on(by("cam-upload")     || $('input[type="file"][accept*="image"]'),               "change", handleUpload);

  // Delega di backup
  document.body.addEventListener("click", e => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const txt = (t.textContent || "").toLowerCase();
    if (txt.includes("apri fotocamera")) openCamera();
    if (txt.includes("scatta")) snapPhoto();
    if (txt.includes("chiudi") && txt.includes("camera")) closeCamera();
  });
}

/* Data */
async function loadData(force) {
  const bust = force ? `?v=${Date.now()}` : "";
  const res = await fetch(`${CFG.dataUrl}${bust}`, { cache: "no-store" });
  if (!res.ok) { console.error("Errore dati", res.status); return; }
  const data = await res.json();
  STATE.recipes = Array.isArray(data) ? data : data.recipes || [];
  STATE.tags = new Set();
  STATE.recipes.forEach(r => (r.tags || []).forEach(t => STATE.tags.add(String(t))));
}

/* Render */
function renderAll() { renderChips(); renderRecipes(); }

function renderChips() {
  const wrap = by("tag-chips"); if (!wrap) return;
  wrap.innerHTML = "";
  wrap.appendChild(chip("Tutti", () => { STATE.activeTags.clear(); renderAll(); }, STATE.activeTags.size === 0));
  [...STATE.tags].sort().forEach(t => {
    const active = STATE.activeTags.has(t);
    wrap.appendChild(chip(t, () => { active ? STATE.activeTags.delete(t) : STATE.activeTags.add(t); renderRecipes(); }, active));
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
  const grid = by("recipes"); if (!grid) return;
  grid.innerHTML = "";
  const q = STATE.query, active = STATE.activeTags;

  const filtered = STATE.recipes.filter(r => {
    const txt = [
      String(r.title || ""), String(r.description || ""),
      Array.isArray(r.ingredients) ? r.ingredients.join(" ") : ""
    ].join(" ").toLowerCase();
    const matchesText = !q || txt.includes(q);
    const matchesTags = active.size === 0 || [...active].every(t => Array.isArray(r.tags) && r.tags.includes(t));
    return matchesText && matchesTags;
  });

  const tpl = by("tpl-recipe-card");
  filtered.forEach(r => {
    const card = tpl ? tpl.content.cloneNode(true) : createCardSkeleton();
    const img  = card.querySelector(".thumb");
    const tit  = card.querySelector(".title");
    const dsc  = card.querySelector(".desc");
    const tgs  = card.querySelector(".tags");
    const bVid = card.querySelector(".btn-video");
    const bAdd = card.querySelector(".btn-add");

    const src = r.image && String(r.image).trim() ? r.image : CFG.placeholderImage;
    if (img) { img.src = src; img.alt = r.title || "Ricetta"; img.onerror = () => { img.onerror=null; img.src = CFG.placeholderImage; }; }
    if (tit) tit.textContent = r.title || "Senza titolo";
    if (dsc) dsc.textContent = r.description || "";
    if (tgs) {
      tgs.innerHTML = "";
      (r.tags || []).forEach(t => { const s = document.createElement("span"); s.className="tag"; s.textContent=t; tgs.appendChild(s); });
    }
    if (bVid) { bVid.disabled = !r.youtubeId; if (r.youtubeId) bVid.addEventListener("click", () => openVideo(r.youtubeId)); }
    if (bAdd) bAdd.addEventListener("click", () => addToList(r));

    grid.appendChild(card);
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

/* Azioni */
function addToList(r) { alert(`Aggiunta: ${r.title || "Ricetta"}`); }

/* Video */
function ensureVideoModal() {
  if (by("video-modal")) return;
  const wrap = document.createElement("div");
  wrap.id = "video-modal"; wrap.className = "modal"; wrap.hidden = true;
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
  const modal = by("video-modal"), container = by("video-container"),
        fallback = by("video-fallback"), openLink = by("video-open-link");
  container.innerHTML = ""; fallback.hidden = true;

  const iframe = document.createElement("iframe");
  iframe.width = "560"; iframe.height = "315";
  iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0`;
  iframe.title = "Video ricetta";
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.setAttribute("allowfullscreen", "");
  iframe.referrerPolicy = "no-referrer";
  container.appendChild(iframe);

  modal.hidden = false; document.body.classList.add("modal-open");

  const t = setTimeout(() => { fallback.hidden = false; openLink.href = `https://youtu.be/${ytId}`; }, CFG.ytTimeoutMs);
  iframe.onload = () => clearTimeout(t);
}

function closeModal() {
  const modal = by("video-modal"); if (!modal) return;
  modal.hidden = true; document.body.classList.remove("modal-open");
  const container = by("video-container"); if (container) container.innerHTML = "";
}

/* Fotocamera + OCR */
function ensureCameraPanel() {
  if (by("camera-panel")) return;
  const wrap = document.createElement("div");
  wrap.id = "camera-panel"; wrap.className = "panel"; wrap.hidden = true;
  wrap.innerHTML = `
    <div class="panel-content">
      <div class="panel-head">
        <h2>Fotocamera OCR</h2>
        <button id="cam-close" aria-label="Chiudi">×</button>
      </div>
      <video id="cam-video" autoplay playsinline style="width:100%;background:#000;border-radius:10px"></video>
      <div class="panel-actions" style="display:flex;gap:8px;margin:10px 0">
        <button id="cam-snap">Scatta</button>
        <input type="file" id="cam-upload" accept="image/*">
      </div>
      <canvas id="cam-canvas" hidden></canvas>
      <textarea id="ocr-out" placeholder="Testo riconosciuto" style="width:100%;min-height:90px"></textarea>
    </div>
    <div class="modal-backdrop"></div>`;
  document.body.appendChild(wrap);
}

async function openCamera() {
  ensureCameraPanel();
  const panel = by("camera-panel"); panel.hidden = false;
  try {
    STATE.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = by("cam-video"); video.srcObject = STATE.stream; await video.play();
  } catch { alert("Permesso negato o fotocamera non disponibile"); }
}

function closeCamera() {
  const panel = by("camera-panel"); if (panel) panel.hidden = true;
  const video = by("cam-video");
  if (STATE.stream) { STATE.stream.getTracks().forEach(t => t.stop()); STATE.stream = null; }
  if (video) video.srcObject = null;
}

async function snapPhoto() {
  const video = by("cam-video"); if (!video) return;
  const canvas = by("cam-canvas"); const out = by("ocr-out");
  canvas.width = video.videoWidth || 1280; canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d"); ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  await runOCR(blob, out);
}

async function handleUpload(ev) {
  const f = ev.target?.files?.[0]; if (!f) return;
  await runOCR(f, by("ocr-out"));
}

async function runOCR(blob, outEl) {
  if (!outEl) return;
  outEl.value = "OCR in corso...";
  try {
    const { data } = await Tesseract.recognize(blob, "ita");
    outEl.value = data.text.trim();
  } catch { outEl.value = "Errore OCR"; }
}

/* SW */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

window.RLS = { loadData, renderAll };
