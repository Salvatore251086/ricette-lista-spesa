/* Ricette & Lista Spesa v17 – binding tollerante */

const CFG = window.__RLS_CONFIG__ || {
  dataUrl: "assets/json/recipes-it.json",
  placeholderImage: "assets/icons/icon-512.png",
  ytTimeoutMs: 2000
};

let STATE = {
  recipes: [],
  tags: new Set(),
  activeTags: new Set(),
  query: "",
  stream: null
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  safeBindUI();
  await loadData();
  renderAll();
  registerSW();
}

/* --------- UI BINDING TOLLERANTE --------- */
function $(sel) { return document.querySelector(sel); }
function byId(id) { return document.getElementById(id); }
function bindOne(el, evt, fn) { if (el) el.addEventListener(evt, fn); }
function pick(...selectors) { return selectors.map(s => typeof s === "string" ? $(s) : s).find(Boolean); }

function safeBindUI() {
  // Ricerca
  bindOne(byId("search") || $('[type="search"]'), "input", e => {
    STATE.query = (e.target.value || "").trim().toLowerCase();
    renderRecipes();
  });

  // Aggiorna dati
  bindOne(byId("btn-refresh-data") || $('[data-action="refresh"]') || $('button[id*="refresh"]'), "click", async () => {
    await loadData(true);
    renderAll();
  });

  // Video modal close
  bindOne(byId("modal-close") || $('#video-modal .close'), "click", closeModal);
  bindOne($('#video-modal .modal-backdrop'), "click", closeModal);

  // Fotocamera: prova più ID comuni, altrimenti useremo delega
  const openCamBtn  = pick('#btn-open-camera', '[data-action="open-camera"]', 'button[id*="open"][id*="cam"]', 'button.open-camera');
  const snapBtn     = pick('#cam-snap', '[data-action="snap"]', 'button[id*="snap"]', 'button.snap-ocr');
  const closeBtn    = pick('#cam-close', '[data-action="close-camera"]', 'button[id*="close"][id*="cam"]', 'button.close-camera');
  const uploadInput = pick('#cam-upload', 'input[type="file"][accept*="image"]');

  bindOne(openCamBtn, "click", openCamera);
  bindOne(snapBtn, "click", snapPhoto);
  bindOne(closeBtn, "click", closeCamera);
  bindOne(uploadInput, "change", handleUpload);

  // Delega come rete di sicurezza per bottoni con testo
  document.body.addEventListener("click", e => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const txt = (t.textContent || "").toLowerCase();
    if (txt.includes("apri fotocamera")) openCamera();
    else if (txt.includes("scatta")) snapPhoto();
    else if (txt.includes("chiudi") && txt.includes("camera")) closeCamera();
  });
}

/* --------- DATA --------- */
async function loadData(force) {
  const bust = force ? `?v=${Date.now()}` : "";
  const res = await fetch(`${CFG.dataUrl}${bust}`, { cache: "no-store" });
  if (!res.ok) { console.error("Errore caricamento dati", res.status); return; }
  const data = await res.json();
  STATE.recipes = Array.isArray(data) ? data : data.recipes || [];
  collectTags();
}

function collectTags() {
  STATE.tags = new Set();
  STATE.recipes.forEach(r => (r.tags || []).forEach(t => STATE.tags.add(String(t))));
}

/* --------- RENDER --------- */
function renderAll() { renderChips(); renderRecipes(); }

function renderChips() {
  const wrap = byId("tag-chips");
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
  const grid = byId("recipes");
  if (!grid) return;
  grid.innerHTML = "";

  const q = STATE.query, active = STATE.activeTags;

  const filtered = STATE.recipes.filter(r => {
    const txt = [
      String(r.title || ""),
      String(r.description || ""),
      Array.isArray(r.ingredients) ? r.ingredients.join(" ") : ""
    ].join(" ").toLowerCase();
    const matchesText = !q || txt.includes(q);
    const matchesTags = active.size === 0 || [...active].every(t => Array.isArray(r.tags) && r.tags.includes(t));
    return matchesText && matchesTags;
  });

  const tpl = byId("tpl-recipe-card");
  filtered.forEach(r => {
    const card = tpl ? tpl.content.cloneNode(true) : document.createElement("article");
    let img = card.querySelector?.(".thumb");
    let title = card.querySelector?.(".title");
    let desc = card.querySelector?.(".desc");
    let tags = card.querySelector?.(".tags");
    let btnVideo = card.querySelector?.(".btn-video");
    let btnAdd = card.querySelector?.(".btn-add");

    if (!tpl) {
      card.className = "card";
      card.innerHTML = `<div class="thumb-wrap"><img class="thumb" alt=""></div>
        <div class="card-body">
          <h3 class="title"></h3><p class="desc"></p><div class="tags"></div>
          <div class="actions"><button class="btn-video">Guarda video</button><button class="btn-add">Aggiungi</button></div>
        </div>`;
      img = card.querySelector(".thumb");
      title = card.querySelector(".title");
      desc = card.querySelector(".desc");
      tags = card.querySelector(".tags");
      btnVideo = card.querySelector(".btn-video");
      btnAdd = card.querySelector(".btn-add");
    }

    const src = r.image && typeof r.image === "string" && r.image.trim() ? r.image : CFG.placeholderImage;
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
        const span = document.createElement("span");
        span.className = "tag";
        span.textContent = t;
        tags.appendChild(span);
      });
    }

    if (btnVideo) {
      if (r.youtubeId) {
        btnVideo.disabled = false;
        btnVideo.addEventListener("click", () => openVideo(r.youtubeId));
      } else btnVideo.disabled = true;
    }

    if (btnAdd) btnAdd.addEventListener("click", () => addToList(r));

    grid.appendChild(card);
  });
}

function addToList(r) {
  alert(`Aggiunta: ${r.title || "Ricetta"}`);
}

/* --------- VIDEO --------- */
function openVideo(ytId) {
  ensureVideoModal();
  const modal = byId("video-modal");
  const container = byId("video-container");
  const fallback = byId("video-fallback");
  const openLink = byId("video-open-link");

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
  const modal = byId("video-modal");
  if (!modal) return;
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  const container = byId("video-container");
  if (container) container.innerHTML = "";
}

function ensureVideoModal() {
  if (byId("video-modal")) return;
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
  bindOne(byId("modal-close"), "click", closeModal);
  bindOne($('#video-modal .modal-backdrop'), "click", closeModal);
}

/* --------- FOTOCAMERA + OCR --------- */
async function openCamera() {
  ensureCameraPanel();
  const panel = byId("camera-panel");
  panel.hidden = false;
  try {
    STATE.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = byId("cam-video");
    video.srcObject = STATE.stream;
    await video.play();
  } catch {
    alert("Permesso negato o fotocamera non disponibile");
  }
}

function closeCamera() {
  const panel = byId("camera-panel");
  if (panel) panel.hidden = true;
  const video = byId("cam-video");
  if (STATE.stream) {
    STATE.stream.getTracks().forEach(t => t.stop());
    STATE.stream = null;
  }
  if (video) video.srcObject = null;
}

async function snapPhoto() {
  const video = byId("cam-video");
  if (!video) return;
  const canvas = byId("cam-canvas");
  const ocrOut = byId("ocr-out");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  await runOCR(blob, ocrOut);
}

async function handleUpload(ev) {
  const file = ev.target?.files?.[0];
  if (!file) return;
  await runOCR(file, byId("ocr-out"));
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

function ensureCameraPanel() {
  if (byId("camera-panel")) return;
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
  bindOne(byId("cam-close"), "click", closeCamera);
  bindOne(byId("cam-snap"), "click", snapPhoto);
  bindOne(byId("cam-upload"), "change", handleUpload);
}

/* --------- SW --------- */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

window.RLS = { loadData, renderAll };
