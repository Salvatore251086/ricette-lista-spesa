/* Ricette & Lista Spesa v17 — compat DOM esistente */

const CFG = window.__RLS_CONFIG__ || {
  dataUrl: "assets/json/recipes-it.json",
  placeholderImage: "assets/icons/icon-512.png",
  ytTimeoutMs: 2000
};

let STATE = { recipes: [], activeTags: new Set(), query: "", stream: null };

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindUI();
  await loadData();
  renderRecipes();
  registerSW();
}

/* Utils */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const by = id => document.getElementById(id);
const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

function bindUI() {
  // Ricerca
  on(by("search") || $('[type="search"]'), "input", e => {
    STATE.query = (e.target.value || "").trim().toLowerCase();
    renderRecipes();
  });

  // Aggiorna dati
  on(by("btn-refresh-data") || $('[data-action="refresh"]'), "click", async () => {
    await loadData(true);
    renderRecipes();
  });

  // Chip già presenti in pagina
  attachChipHandlers();

  // Sezione video
  ensureVideoModal();
  on(by("modal-close"), "click", closeModal);
  const backdrop = $('#video-modal .modal-backdrop');
  if (backdrop) on(backdrop, "click", closeModal);

  // Fotocamera
  ensureCameraPanel();
  // Prova più selettori per compatibilità con tuo layout attuale
  on(by("btn-open-camera") || $('button.open-camera') || buttonByText("Apri fotocamera"), "click", openCamera);
  on(by("cam-snap") || buttonByText("Scatta"), "click", snapPhoto);
  on(by("cam-close") || buttonByText("Chiudi camera"), "click", closeCamera);
  on(by("cam-upload") || $('input[type="file"][accept*="image"]'), "change", handleUpload);

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

function buttonByText(txt) {
  const q = txt.toLowerCase();
  return $$("button").find(b => (b.textContent || "").toLowerCase().includes(q)) || null;
}

function attachChipHandlers() {
  // chip container in pagina
  const chips = $$(".chips .chip, .chips button, .chips .btn, .chip");
  if (!chips.length) return;
  chips.forEach(btn => {
    btn.addEventListener("click", () => {
      const label = btn.textContent.trim();
      if (label.toLowerCase() === "tutti") {
        STATE.activeTags.clear();
        chips.forEach(b => b.classList.toggle("active", b.textContent.trim().toLowerCase() === "tutti"));
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
}

/* Render ricette su card già in pagina o crea skeleton */
function renderRecipes() {
  const grid = by("recipes") || $('#cards, #lista, main .grid, .cards');
  if (!grid) return;

  grid.innerHTML = "";

  const q = STATE.query;
  const active = STATE.activeTags;

  const filtered = STATE.recipes.filter(r => {
    const txt = [
      r.title, r.description,
      Array.isArray(r.ingredients) ? r.ingredients.join(" ") : ""
    ].join(" ").toLowerCase();
    const okText = !q || txt.includes(q);
    const okTags = active.size === 0 || [...active].every(t => Array.isArray(r.tags) && r.tags.includes(t));
    return okText && okTags;
  });

  filtered.forEach(r => grid.appendChild(renderCard(r)));
}

function renderCard(r) {
  // se esiste il template usa quello, altrimenti crea una card minimale
  const tpl = by("tpl-recipe-card");
  let card;
  if (tpl && tpl.content) {
    card = tpl.content.cloneNode(true);
  } else {
    card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
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
  }

  const root = card.querySelector ? card : card.firstElementChild; // compat quando è DocumentFragment
  const img = root.querySelector(".thumb");
  const title = root.querySelector(".title");
  const desc = root.querySelector(".desc");
  const tags = root.querySelector(".tags");
  const btnVideo = root.querySelector(".btn-video");
  const btnAdd = root.querySelector(".btn-add");

  const src = r.image && String(r.image).trim() ? r.image : CFG.placeholderImage;
  if (img) {
    img.src = src;
    img.alt = r.title || "Ricetta";
    img.onerror = () => { img.onerror = null; img.src = CFG.placeholderImage; };
  }
  if (title) title.textContent = r.title || "Senza titolo";
  if (desc) desc.textContent = r.description || "";
  if (tags) {
    tags.innerHTML = "";
    (r.tags || []).forEach(t => {
      const s = document.createElement("span");
      s.className = "tag";
      s.textContent = t;
      tags.appendChild(s);
    });
  }
  if (btnVideo) {
    btnVideo.disabled = !r.youtubeId;
    if (r.youtubeId) btnVideo.addEventListener("click", () => openVideo(r.youtubeId));
  }
  if (btnAdd) btnAdd.addEventListener("click", () => alert(`Aggiunta: ${r.title || "Ricetta"}`));

  return card;
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
  iframe.src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0`;
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

/* Fotocamera + OCR */
function ensureCameraPanel() {
  if (by("camera-panel")) return;
  const wrap = document.createElement("div");
  wrap.id = "camera-panel";
  wrap.className = "panel";
  wrap.hidden = true;
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
  const panel = by("camera-panel");
  panel.hidden = false;
  try {
    STATE.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = by("cam-video");
    video.srcObject = STATE.stream;
    await video.play();
  } catch {
    alert("Permesso negato o fotocamera non disponibile");
  }
}

function closeCamera() {
  const panel = by("camera-panel");
  if (panel) panel.hidden = true;
  const video = by("cam-video");
  if (STATE.stream) {
    STATE.stream.getTracks().forEach(t => t.stop());
    STATE.stream = null;
  }
  if (video) video.srcObject = null;
}

async function snapPhoto() {
  const video = by("cam-video");
  if (!video) return;
  const canvas = by("cam-canvas");
  const out = by("ocr-out");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  await runOCR(blob, out);
}

async function handleUpload(ev) {
  const file = ev.target?.files?.[0];
  if (!file) return;
  await runOCR(file, by("ocr-out"));
}

async function runOCR(blob, outEl) {
  if (!outEl) return;
  outEl.value = "OCR in corso...";
  try {
    const { data } = await Tesseract.recognize(blob, "ita");
    outEl.value = data.text.trim();
  } catch {
    outEl.value = "Errore OCR";
  }
}

/* SW */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
