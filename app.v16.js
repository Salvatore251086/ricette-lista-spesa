// app.js
// =========================
// Ricette & Lista Spesa - App principale (module)
// Sicuro contro elementi mancanti e dataset opzionali.
// =========================

// ---------- UTIL ----------
const $ = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
const byId = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function debounce(fn, ms = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// ---------- SELETTORI UI ----------
const el = {
  // tabs
  tabRicette: byId("tabRicette"),
  tabGeneratore: byId("tabGeneratore"),
  tabLista: byId("tabLista"),
  secRicette: byId("ricetteSec"),
  secGen: byId("genSec"),
  secLista: byId("listaSec"),

  // barra filtri
  q: byId("q"),
  filterTime: byId("filterTime"),
  filterDiet: byId("filterDiet"),
  btnReset: byId("btnReset"),
  btnFav: byId("btnFav"),

  // elenco ricette
  quickTags: byId("quickTags"),
  grid: byId("recipesGrid"),
  empty: byId("empty"),
  btnLoadMore: byId("btnLoadMore"),

  // cookie bar
  cookieBar: byId("cookieBar"),
  cookieAccept: byId("cookieAccept"),
  cookieDecline: byId("cookieDecline"),

  // footer anno
  year: byId("year"),

  // share/import stato
  btnShareState: byId("btnShareState"),
  btnLoadState: byId("btnLoadState"),
};

// ---------- STATO ----------
const state = {
  all: [],       // ricette normalizzate
  view: [],      // ricette risultanti dai filtri
  page: 0,
  pageSize: 12,
  onlyFav: false,
  favorites: new Set(JSON.parse(localStorage.getItem("favorites") || "[]")),
};

// ---------- DATA LOADING ----------
async function fetchJsonSafe(url) {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function normText(s = "") {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractYouTubeId(input = "") {
  if (!input) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    }
    if (host.endsWith("youtube.com")) {
      if (url.searchParams.has("v")) {
        const id = url.searchParams.get("v") ?? "";
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
      }
      const parts = url.pathname.split("/").filter(Boolean);
      if ((parts[0] === "shorts" || parts[0] === "embed") && /^[A-Za-z0-9_-]{11}$/.test(parts[1])) {
        return parts[1];
      }
    }
  } catch { /* ignore */ }
  return "";
}

function normalizeRecipe(r, idx) {
  const id = r.id || `r_${idx}_${(r.title || "").slice(0, 32)}`;
  const title = (r.title || r.name || "Ricetta").trim();
  const diet = (r.diet || r.category || r.tipo || "").toLowerCase();
  const time = Number(r.time || r.tempo || r.prep || 0) || 0;
  const tags = Array.from(
    new Set([...(r.tags || []), ...(r.tag || []), diet].filter(Boolean).map((t) => normText(t)))
  );
  const ingredients = Array.isArray(r.ingredients)
    ? r.ingredients
    : (typeof r.ingredients === "string" ? r.ingredients.split(",") : []);
  const text = [title, r.desc || r.description || "", ingredients.join(" "), tags.join(" ")]
    .map(normText)
    .join(" ");

  // video
  const ytId = r.ytId || extractYouTubeId(r.video || "");
  return {
    id,
    title,
    time,
    diet,
    tags,
    url: r.url || r.link || "",
    image: r.image || r.img || "",
    ingredients,
    steps: r.steps || r.procedure || [],
    video: ytId ? `https://www.youtube.com/watch?v=${ytId}` : "",
    ytId,
    _text: text,
  };
}

async function loadAllData() {
  const base = await fetchJsonSafe("assets/json/recipes-it.json");
  const imp = await fetchJsonSafe("import/recipes.json"); // opzionale
  const raw = [...(base || []), ...(imp || [])];
  state.all = raw.map(normalizeRecipe);
}

// ---------- RENDER ----------
function setHidden(node, hidden) {
  if (!node) return;
  node.classList.toggle("hidden", !!hidden);
}

function buildYouTubeEmbedUrl(ytId) {
  return `https://www.youtube-nocookie.com/embed/${ytId}?rel=0&modestbranding=1&playsinline=1`;
}

function videoButton(ytId) {
  const btn = document.createElement("button");
  btn.className = "btn";
  btn.type = "button";
  btn.textContent = "Guarda video";
  if (!ytId) {
    btn.disabled = true;
    btn.title = "Video non disponibile";
    return btn;
  }
  btn.addEventListener("click", () => openVideoModal(ytId));
  return btn;
}

function openVideoModal(ytId) {
  const wrap = document.createElement("div");
  wrap.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px;";
  wrap.setAttribute("role", "dialog");
  wrap.setAttribute("aria-modal", "true");
  wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.remove(); });

  const card = document.createElement("div");
  card.style.cssText = "max-width:900px;width:100%;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 8px 40px rgba(0,0,0,.35)";
  const top = document.createElement("div");
  top.style.cssText = "position:relative;padding-top:56.25%;background:#000;";

  const iframe = document.createElement("iframe");
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
  iframe.referrerPolicy = "origin-when-cross-origin";
  iframe.allowFullscreen = true;
  iframe.title = "Riproduzione video ricetta";
  iframe.src = buildYouTubeEmbedUrl(ytId);
  iframe.style.cssText = "position:absolute;inset:0;border:0;width:100%;height:100%;";

  const bar = document.createElement("div");
  bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;padding:10px 12px;gap:10px;";
  const a = document.createElement("a");
  a.href = `https://www.youtube.com/watch?v=${ytId}`;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "Apri su YouTube";
  const close = document.createElement("button");
  close.className = "btn";
  close.textContent = "Chiudi";
  close.addEventListener("click", () => wrap.remove());

  top.appendChild(iframe);
  bar.append(a, close);
  card.append(top, bar);
  wrap.appendChild(card);
  document.body.appendChild(wrap);
}

function favButton(recipe) {
  const btn = document.createElement("button");
  btn.className = "chip";
  btn.type = "button";
  btn.setAttribute("aria-pressed", state.favorites.has(recipe.id) ? "true" : "false");
  btn.textContent = state.favorites.has(recipe.id) ? "★ Preferito" : "☆ Preferito";

  btn.addEventListener("click", () => {
    if (state.favorites.has(recipe.id)) {
      state.favorites.delete(recipe.id);
    } else {
      state.favorites.add(recipe.id);
    }
    localStorage.setItem("favorites", JSON.stringify([...state.favorites]));
    // aggiorna look
    btn.setAttribute("aria-pressed", state.favorites.has(recipe.id) ? "true" : "false");
    btn.textContent = state.favorites.has(recipe.id) ? "★ Preferito" : "☆ Preferito";
    // se sto guardando solo i preferiti, ricalcolo la vista
    if (state.onlyFav) applyFiltersAndRender(true);
  });

  return btn;
}

function recipeCard(r) {
  const card = document.createElement("div");
  card.className = "card";

  const img = document.createElement("img");
  img.loading = "lazy";
  img.decoding = "async";
  img.src = r.image || "assets/placeholder.svg";
  img.alt = r.title;
  img.style.width = "100%";
  img.style.borderRadius = "10px";
  img.onerror = () => { img.src = "assets/placeholder.svg"; };

  const h3 = document.createElement("h3");
  h3.textContent = r.title;

  const meta = document.createElement("div");
  meta.className = "muted";
  meta.textContent = [
    r.time ? `${r.time} min` : "",
    r.diet ? r.diet : "",
  ].filter(Boolean).join(" • ");

  const tagsWrap = document.createElement("div");
  tagsWrap.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;";
  r.tags.slice(0, 6).forEach((t) => {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = t;
    chip.addEventListener("click", () => {
      if (!el.q) return;
      el.q.value = t;
      applyFiltersAndRender(true);
    });
    tagsWrap.appendChild(chip);
  });

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;";
  const openBtn = document.createElement("a");
  openBtn.className = "btn";
  openBtn.textContent = "Apri ricetta";
  openBtn.href = r.url || "#";
  openBtn.target = "_blank";
  openBtn.rel = "noopener";

  actions.append(openBtn, videoButton(r.ytId), favButton(r));

  card.append(img, h3, meta, tagsWrap, actions);
  return card;
}

function renderPage(reset = false) {
  if (!el.grid || !el.empty || !el.btnLoadMore) return;

  if (reset) {
    el.grid.innerHTML = "";
    state.page = 0;
  }

  const start = state.page * state.pageSize;
  const slice = state.view.slice(start, start + state.pageSize);

  slice.forEach((r) => el.grid.appendChild(recipeCard(r)));

  state.page++;
  const hasMore = state.page * state.pageSize < state.view.length;
  setHidden(el.btnLoadMore, !hasMore);
  setHidden(el.empty, state.view.length > 0);
}

function buildQuickTags() {
  if (!el.quickTags) return;
  const freq = new Map();
  state.all.forEach((r) => r.tags.forEach((t) => freq.set(t, (freq.get(t) || 0) + 1)));
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([t]) => t);
  el.quickTags.innerHTML = "";
  top.forEach((t) => {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.type = "button";
    chip.textContent = t;
    chip.addEventListener("click", () => {
      if (!el.q) return;
      el.q.value = t;
      applyFiltersAndRender(true);
    });
    el.quickTags.appendChild(chip);
  });
}

// ---------- FILTRI ----------
function applyFiltersAndRender(resetPage = true) {
  const q = normText(el.q?.value || "");
  const maxTime = Number(el.filterTime?.value || 0) || 0;
  const diet = (el.filterDiet?.value || "").toLowerCase();

  let out = state.all;

  if (q) {
    out = out.filter((r) => r._text.includes(q));
  }
  if (maxTime > 0) {
    out = out.filter((r) => !r.time || r.time <= maxTime);
  }
  if (diet) {
    out = out.filter((r) => r.diet === diet);
  }
  if (state.onlyFav) {
    out = out.filter((r) => state.favorites.has(r.id));
  }

  state.view = out;
  renderPage(resetPage);
  updateShareUrl();
}

function resetFilters() {
  if (el.q) el.q.value = "";
  if (el.filterTime) el.filterTime.value = "";
  if (el.filterDiet) el.filterDiet.value = "";
  state.onlyFav = false;
  setFavToggle(false);
  applyFiltersAndRender(true);
}

// ---------- SHARE STATO ----------
function encodeStateToQuery() {
  const params = new URLSearchParams();
  if (el.q?.value) params.set("q", el.q.value);
  if (el.filterTime?.value) params.set("t", el.filterTime.value);
  if (el.filterDiet?.value) params.set("d", el.filterDiet.value);
  if (state.onlyFav) params.set("f", "1");
  return params.toString();
}

function updateShareUrl() {
  const qs = encodeStateToQuery();
  const url = qs ? `${location.pathname}?${qs}` : location.pathname;
  history.replaceState(null, "", url);
}

function loadStateFromUrl() {
  const p = new URLSearchParams(location.search);
  if (el.q) el.q.value = p.get("q") || "";
  if (el.filterTime) el.filterTime.value = p.get("t") || "";
  if (el.filterDiet) el.filterDiet.value = p.get("d") || "";
  const f = p.get("f") === "1";
  state.onlyFav = f;
  setFavToggle(f);
}

function copyToClipboard(text) {
  return navigator.clipboard?.writeText(text).catch(() => false);
}

// ---------- TABS ----------
function showTab(name) {
  if (!el.secRicette || !el.secGen || !el.secLista) return;
  const isRic = name === "ricette";
  const isGen = name === "gen";
  const isList = name === "lista";

  el.secRicette.classList.toggle("hidden", !isRic);
  el.secGen.classList.toggle("hidden", !isGen);
  el.secLista.classList.toggle("hidden", !isList);

  el.tabRicette?.setAttribute("aria-pressed", isRic ? "true" : "false");
  el.tabGeneratore?.setAttribute("aria-pressed", isGen ? "true" : "false");
  el.tabLista?.setAttribute("aria-pressed", isList ? "true" : "false");
}

// ---------- COOKIE BAR ----------
function initCookieBar() {
  if (!el.cookieBar || !el.cookieAccept || !el.cookieDecline) return;
  const consent = localStorage.getItem("cookie:consent");
  if (consent) {
    el.cookieBar.style.display = "none";
    return;
  }
  el.cookieAccept.addEventListener("click", () => {
    localStorage.setItem("cookie:consent", "accepted");
    el.cookieBar.style.display = "none";
  });
  el.cookieDecline.addEventListener("click", () => {
    localStorage.setItem("cookie:consent", "declined");
    el.cookieBar.style.display = "none";
  });
}

// ---------- HANDLERS ----------
function setFavToggle(on) {
  if (!el.btnFav) return;
  el.btnFav.setAttribute("aria-pressed", on ? "true" : "false");
  el.btnFav.classList.toggle("chip--active", !!on);
  el.btnFav.textContent = on ? "Solo preferiti ✓" : "Solo preferiti";
}

function bindHandlers() {
  // tabs
  el.tabRicette?.addEventListener("click", () => showTab("ricette"));
  el.tabGeneratore?.addEventListener("click", () => showTab("gen"));
  el.tabLista?.addEventListener("click", () => showTab("lista"));

  // filtri
  el.q?.addEventListener("input", debounce(() => applyFiltersAndRender(true), 150));
  el.filterTime?.addEventListener("change", () => applyFiltersAndRender(true));
  el.filterDiet?.addEventListener("change", () => applyFiltersAndRender(true));
  el.btnReset?.addEventListener("click", resetFilters);

  // preferiti toggle
  el.btnFav?.addEventListener("click", () => {
    state.onlyFav = !state.onlyFav;
    setFavToggle(state.onlyFav);
    applyFiltersAndRender(true);
  });

  // load more
  el.btnLoadMore?.addEventListener("click", () => renderPage(false));

  // share / load stato
  el.btnShareState?.addEventListener("click", async () => {
    const qs = encodeStateToQuery();
    const url = qs ? `${location.origin}${location.pathname}?${qs}` : location.href;
    await copyToClipboard(url);
    alert("Link copiato negli appunti.");
  });
  el.btnLoadState?.addEventListener("click", () => {
    const u = prompt("Incolla un link stato generato dall'app:");
    if (!u) return;
    try {
      const url = new URL(u);
      location.href = `${location.pathname}${url.search}`;
    } catch {
      alert("Link non valido.");
    }
  });
}

// ---------- BOOTSTRAP ----------
async function bootstrap() {
  try {
    if (el.year) el.year.textContent = new Date().getFullYear();
    initCookieBar();
    bindHandlers();
    loadStateFromUrl();
    showTab("ricette");

    await loadAllData();
    buildQuickTags();
    applyFiltersAndRender(true);
  } catch (err) {
    console.error("Errore bootstrap:", err);
    // mostra un fallback visivo gentile
    if (el.grid && el.empty) {
      el.grid.innerHTML = "";
      el.empty.textContent = "Si è verificato un errore nel caricamento delle ricette.";
      setHidden(el.empty, false);
    }
  }
}

// avvio dopo DOM pronto
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}

// ---------- FACOLTATIVO: registra SW se presente ----------
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    // non forzare errori se il file non esiste
    fetch("service-worker.js", { method: "HEAD" })
      .then((r) => {
        if (r.ok) navigator.serviceWorker.register("service-worker.js");
      })
      .catch(() => {});
  });
}
