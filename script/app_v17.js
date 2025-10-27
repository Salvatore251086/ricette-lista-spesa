/* Ricette & Lista Spesa v17 */

const CFG = window.__RLS_CONFIG__;
let STATE = {
  recipes: [],
  tags: new Set(),
  activeTags: new Set(),
  query: "",
  stream: null
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  wireUI();
  await loadData();
  renderAll();
  registerSW();
}

function wireUI() {
  const search = document.getElementById("search");
  search.addEventListener("input", e => {
    STATE.query = e.target.value.trim().toLowerCase();
    renderRecipes();
  });

  document.getElementById("btn-refresh-data").addEventListener("click", async () => {
    await loadData(true);
    renderAll();
  });

  document.getElementById("btn-open-camera").addEventListener("click", openCamera);
  document.getElementById("cam-close").addEventListener("click", closeCamera);
  document.getElementById("cam-snap").addEventListener("click", snapPhoto);
  document.getElementById("cam-upload").addEventListener("change", handleUpload);

  document.getElementById("modal-close").addEventListener("click", closeModal);
  document.querySelector("#video-modal .modal-backdrop").addEventListener("click", closeModal);
}

async function loadData(force) {
  const bust = force ? `?v=${Date.now()}` : "";
  const url = `${CFG.dataUrl}${bust}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    console.error("Errore caricamento dati", res.status);
    return;
  }
  const data = await res.json();
  STATE.recipes = Array.isArray(data) ? data : data.recipes || [];
  collectTags();
}

function collectTags() {
  STATE.tags = new Set();
  STATE.recipes.forEach(r => {
    (r.tags || []).forEach(t => STATE.tags.add(String(t)));
  });
}

function renderAll() {
  renderChips();
  renderRecipes();
}

function renderChips() {
  const wrap = document.getElementById("tag-chips");
  wrap.innerHTML = "";
  const all = chip("Tutti", () => {
    STATE.activeTags.clear();
    renderAll();
  }, STATE.activeTags.size === 0);
  wrap.appendChild(all);

  [...STATE.tags].sort().forEach(t => {
    const active = STATE.activeTags.has(t);
    const el = chip(t, () => {
      if (STATE.activeTags.has(t)) STATE.activeTags.delete(t);
      else STATE.activeTags.add(t);
      renderRecipes();
    }, active);
    wrap.appendChild(el);
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
  grid.innerHTML = "";

  const q = STATE.query;
  const active = STATE.activeTags;

  const filtered = STATE.recipes.filter(r => {
    const matchesText =
      !q ||
      (String(r.title || "").toLowerCase().includes(q)) ||
      (String(r.description || "").toLowerCase().includes(q)) ||
      (Array.isArray(r.ingredients) && r.ingredients.join(" ").toLowerCase().includes(q));

    const matchesTags =
      active.size === 0 ||
      [...active].every(t => Array.isArray(r.tags) && r.tags.includes(t));

    return matchesText && matchesTags;
  });

  const tpl = document.getElementById("tpl-recipe-card");
  filtered.forEach(r => {
    const card = tpl.content.cloneNode(true);
    const img = card.querySelector(".thumb");
    const title = card.querySelector(".title");
    const desc = card.querySelector(".desc");
    const tags = card.querySelector(".tags");
    const btnVideo = card.querySelector(".btn-video");
    const btnAdd = card.querySelector(".btn-add");

    const src = r.image && typeof r.image === "string" && r.image.trim().length > 0
      ? r.image
      : CFG.placeholderImage;

    img.src = src;
    img.alt = r.title || "Ricetta";
    img.onerror = () => {
      img.onerror = null;
      img.src = CFG.placeholderImage;
    };

    title.textContent = r.title || "Senza titolo";
    desc.textContent = r.description || "";

    tags.innerHTML = "";
    (r.tags || []).forEach(t => {
      const span = document.createElement("span");
      span.className = "tag";
      span.textContent = t;
      tags.appendChild(span);
    });

    if (r.youtubeId) {
      btnVideo.dataset.videoId = r.youtubeId;
      btnVideo.disabled = false;
      btnVideo.addEventListener("click", () => openVideo(r.youtubeId));
    } else {
      btnVideo.disabled = true;
    }

    btnAdd.addEventListener("click", () => addToList(r));

    grid.appendChild(card);
  });
}

function addToList(r) {
  alert(`Aggiunta: ${r.title || "Ricetta"}`);
}

function openVideo(ytId) {
  const modal = document.getElementById("video-modal");
  const container = document.getElementById("video-container");
  const fallback = document.getElementById("video-fallback");
  const openLink = document.getElementById("video-open-link");

  container.innerHTML = "";
  fallback.hidden = true;

  const src = `https://www.youtube-nocookie.com/embed/${ytId}?autoplay=1&rel=0`;
  const iframe = document.createElement("iframe");
  iframe.width = "560";
  iframe.height = "315";
  iframe.src = src;
  iframe.title = "Video ricetta";
  iframe.allow = "autoplay; encrypted-media; picture-in-picture";
  iframe.setAttribute("allowfullscreen", "");
  iframe.referrerPolicy = "no-referrer";

  container.appendChild(iframe);
  modal.hidden = false;
  document.body.classList.add("modal-open");

  const timeout = setTimeout(() => {
    fallback.hidden = false;
    openLink.href = `https://youtu.be/${ytId}`;
  }, CFG.ytTimeoutMs);

  iframe.onload = () => {
    clearTimeout(timeout);
  };
}

function closeModal() {
  const modal = document.getElementById("video-modal");
  const container = document.getElementById("video-container");
  modal.hidden = true;
  document.body.classList.remove("modal-open");
  container.innerHTML = "";
}

async function openCamera() {
  const panel = document.getElementById("camera-panel");
  panel.hidden = false;
  try {
    STATE.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
    const video = document.getElementById("cam-video");
    video.srcObject = STATE.stream;
    await video.play();
  } catch (e) {
    alert("Permesso negato o fotocamera non disponibile");
  }
}

function closeCamera() {
  const panel = document.getElementById("camera-panel");
  panel.hidden = true;
  const video = document.getElementById("cam-video");
  if (STATE.stream) {
    STATE.stream.getTracks().forEach(t => t.stop());
    STATE.stream = null;
  }
  video.srcObject = null;
}

async function snapPhoto() {
  const video = document.getElementById("cam-video");
  const canvas = document.getElementById("cam-canvas");
  const ocrOut = document.getElementById("ocr-out");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise(r => canvas.toBlob(r, "image/png"));
  await runOCR(blob, ocrOut);
}

async function handleUpload(ev) {
  const file = ev.target.files[0];
  if (!file) return;
  const ocrOut = document.getElementById("ocr-out");
  await runOCR(file, ocrOut);
}

async function runOCR(blob, outEl) {
  outEl.value = "OCR in corso...";
  try {
    const { data } = await Tesseract.recognize(blob, "ita");
    outEl.value = data.text.trim();
  } catch (e) {
    outEl.value = "Errore OCR";
  }
}

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  navigator.serviceWorker.register("service-worker.js").catch(() => {});
}

window.RLS = { loadData, renderAll };
