/* Ricette & Lista Spesa v17 — filtri, video con fallback, fotocamera con permessi e selezione device */

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
  stream: null,
  devices: [],
  activeDeviceId: null
};

document.addEventListener("DOMContentLoaded", init);

/* Helpers DOM */
const $  = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const by = id => document.getElementById(id);
const on = (el, ev, fn) => { if (el) el.addEventListener(ev, fn); };

async function init() {
  bindUI();
  await loadData();
  renderAll();
  registerSW();
}

/* Bind UI */
function bindUI() {
  on(by("search") || $('[type="search"]'), "input", e => {
    STATE.query = (e.target.value || "").trim().toLowerCase();
    renderRecipes();
  });

  on(by("btn-refresh-data"), "click", async () => {
    await loadData(true);
    renderAll();
  });

  ensureVideoModal();
  on(by("modal-close"), "click", closeModal);
  on($('#video-modal .modal-backdrop'), "click", closeModal);

  ensureCameraPanel();
  on(by("cam-refresh-devices"), "click", enumerateCameras);
  on(by("cam-device"), "change", e => switchCamera(e.target.value));
  // I bottoni di apertura li puoi avere nel layout principale con testo o id, uso delega
  document.body.addEventListener("click", e => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    const txt = (t.textContent || "").toLowerCase();
    if (t.id === "btn-open-camera" || txt.includes("apri fotocamera")) openCamera();
    if (t.id === "cam-snap" || txt === "scatta") snapPhoto();
    if (t.id === "cam-close" || txt.includes("chiudi") && txt.includes("camera")) closeCamera();
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
  STATE.tags = new Set();
  STATE.recipes.forEach(r => (r.tags || []).forEach(t => STATE.tags.add(String(t))));
}

/* Render */
function renderAll() { renderChips(); renderRecipes(); }

function renderChips() {
  const wrap = by("tag-chips");
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
  const grid = by("recipes");
  if (!grid) return;
  grid.innerHTML = "";

  const q = STATE.query, active = STATE.activeTags;

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
    const img  = root.querySelector(".thumb");
    const tit  = root.querySelector(".title");
    const dsc  = root.querySelector(".desc");
    const tgs  = root.querySelector(".tags");
    const bVid = root.querySelector(".btn-video");
    const bAdd = root.querySelector(".btn-add");

    const src = r.image && String(r.image).trim() ? r.image : CFG.placeholderImage;
    if (img) { img.src = src; img.alt = r.title || "Ricetta"; img.onerror = () => { img.onerror = null; img.src = CFG.placeholderImage; }; }
    if (tit) tit.textContent = r.title || "Senza titolo";
    if (dsc) dsc.textContent = r.description || "";
    if (tgs) {
      tgs.innerHTML = "";
      (r.tags || []).forEach(t => { const s = document.createElement("span"); s.className = "tag"; s.textContent = t; tgs.appendChild(s); });
    }
    if (bVid) { bVid.disabled = !r.youtubeId; if (r.youtubeId) bVid.addEventListener("click", () => openVideo(r.youtubeId)); }
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

/* Fotocamera + OCR */
on(by("cam-snap"), "click", snapPhoto);
on(by("cam-upload"), "change", handleUpload);
on(by("cam-close"), "click", closeCamera);

async function openCamera() {
  ensureCameraPanel();
  const panel = by("camera-panel");
  panel.hidden = false;
  setCamStatus("Inizializzazione. Controllo permessi");
  try {
    await requestCameraPermission();
    await enumerateCameras();
    const devId = STATE.activeDeviceId || pickBackOrFront();
    await startStream(devId);
  } catch (e) {
    handleCamError(e);
  }
}

async function switchCamera(deviceId) {
  try {
    await startStream(deviceId);
  } catch (e) {
    handleCamError(e);
  }
}

async function startStream(deviceId) {
  stopStream();
  const constraints = deviceId ? { video: { deviceId: { exact: deviceId } } } : { video: { facingMode: "environment" } };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  const video = by("cam-video");
  video.srcObject = stream;
  await video.play();
  STATE.stream = stream;
  STATE.activeDeviceId = getDeviceIdFromStream(stream);
  setCamStatus("Fotocamera attiva");
}

function closeCamera() {
  stopStream();
  const panel = by("camera-panel");
  if (panel) panel.hidden = true;
  setCamStatus("Fotocamera chiusa");
}

function stopStream() {
  if (STATE.stream) {
    STATE.stream.getTracks().forEach(t => t.stop());
    STATE.stream = null;
  }
  const video = by("cam-video");
  if (video) video.srcObject = null;
}

async function requestCameraPermission() {
  const tmp = await navigator.mediaDevices.getUserMedia({ video: true });
  tmp.getTracks().forEach(t => t.stop());
}

async function enumerateCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  STATE.devices = devices.filter(d => d.kind === "videoinput");
  const sel = by("cam-device");
  if (!sel) return;
  sel.innerHTML = "";
  STATE.devices.forEach(d => {
    const opt = document.createElement("option");
    opt.value = d.deviceId;
    opt.textContent = d.label || "Fotocamera";
    sel.appendChild(opt);
  });
  const active = STATE.activeDeviceId || pickBackOrFront();
  if (active) sel.value = active;
  setCamStatus(STATE.devices.length ? "Dispositivi trovati" : "Nessuna fotocamera trovata");
}

function pickBackOrFront() {
  if (!STATE.devices.length) return null;
  const back = STATE.devices.find(d => (d.label || "").toLowerCase().includes("back"));
  return back ? back.deviceId : STATE.devices[0].deviceId;
}

function getDeviceIdFromStream(stream) {
  const track = stream.getVideoTracks()[0];
  const settings = track.getSettings && track.getSettings();
  return settings && settings.deviceId ? settings.deviceId : null;
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

function handleCamError(e) {
  const name = e && e.name ? e.name : "Error";
  let msg = "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    msg = "Permesso negato. Clicca il lucchetto, consenti Fotocamera, ricarica.";
  } else if (name === "NotFoundError" || name === "OverconstrainedError") {
    msg = "Nessuna fotocamera disponibile. Collega un dispositivo o abilita la camera nelle impostazioni.";
  } else if (name === "NotReadableError") {
    msg = "Fotocamera occupata da un’altra app. Chiudi Teams o Zoom e riprova.";
  } else if (name === "AbortError") {
    msg = "Accesso interrotto. Riprova.";
  } else {
    msg = "Errore camera. Riprova o cambia dispositivo.";
  }
  setCamStatus(msg);
  alert(msg);
}

function setCamStatus(text) {
  const el = by("cam-status");
  if (el) el.textContent = text;
}

/* SW */
function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}
