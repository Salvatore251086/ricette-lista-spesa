// Ricette & Lista Spesa · app.v16.js

// =======================
// Config e chiavi storage
// =======================
const LIST_KEY = 'rls.list';
const USER_RECIPES_KEY = 'rls.user_recipes';
const ALLOWED_YT_CHANNELS = [
  // Inserisci qui gli ID canale reali se usi la validazione server
  'UCj3NcgJQJz0B2s3AqJ4vMwA', // Giallo Zafferano ESEMPIO
  'UC3d5qL6Q9sH9PqO0F6d0kbg', // Benedetta ESEMPIO
  'UCmS4G0rKQ2F0r2m6y0xMari'  // Max Mariola ESEMPIO
];

// =======================
// Helpers DOM e utilità
// =======================
function $(sel, root = document) { return root.querySelector(sel) }

function ensureContainer(id = 'app') {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    const anchor =
      document.querySelector('main') ||
      document.querySelector('#content') ||
      document.body;
    anchor.appendChild(el);
  }
  return el;
}

function html(targetSelOrNode, content) {
  const el = typeof targetSelOrNode === 'string'
    ? document.querySelector(targetSelOrNode)
    : targetSelOrNode;
  const node = el || ensureContainer('app');
  node.innerHTML = content;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, m => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[m]));
}

function totalMinutes(r) {
  if (typeof r.prepTime === 'number' || typeof r.cookTime === 'number') {
    const a = Number(r.prepTime || 0) + Number(r.cookTime || 0);
    return isFinite(a) ? a : 0;
  }
  if (typeof r.time === 'string') {
    const m = r.time.match(/(\d+)\s*min/i);
    return m ? Number(m[1]) : 0;
  }
  if (typeof r.time_min === 'number') return r.time_min;
  return 0;
}

// =======================
// Persistenza lista spesa
// =======================
function loadList() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY)) || [] } catch { return [] }
}
function saveList(items) {
  localStorage.setItem(LIST_KEY, JSON.stringify(items));
}
function addToList(items) {
  const list = loadList();
  items.forEach(it => {
    const name = String(it.name || it.ingredient || '').trim();
    if (!name) return;
    const unit = String(it.unit || '').trim();
    const qty = Number(it.qty ?? it.quantity ?? 1) || 1;
    const idx = list.findIndex(x => x.name.toLowerCase() === name.toLowerCase() && (x.unit || '') === unit);
    if (idx >= 0) list[idx].qty = Number(list[idx].qty || 0) + qty;
    else list.push({ name, qty, unit, checked: false });
  });
  saveList(list);
  return list;
}
function toggleList(name) {
  const list = loadList();
  const i = list.findIndex(x => x.name.toLowerCase() === String(name).toLowerCase());
  if (i >= 0) list[i].checked = !list[i].checked;
  saveList(list);
  return list;
}
function removeFromList(name) {
  const next = loadList().filter(x => x.name.toLowerCase() !== String(name).toLowerCase());
  saveList(next);
  return next;
}
function clearChecked() {
  const next = loadList().filter(x => !x.checked);
  saveList(next);
  return next;
}

// =======================
// Filtri e suggerimenti
// =======================
function filterByTagsAND(recipes, activeTags) {
  if (!activeTags || activeTags.length === 0) return recipes;
  const want = activeTags.map(t => t.toLowerCase());
  return recipes.filter(r => {
    const tags = (r.tags || []).map(t => t.toLowerCase());
    return want.every(t => tags.includes(t));
  });
}

function normalizeToken(s) { return String(s).toLowerCase().trim() }

function suggestRecipes(recipes, inputText) {
  const tokens = String(inputText || '')
    .split(',')
    .map(normalizeToken)
    .filter(Boolean);
  if (tokens.length === 0) return [];
  return recipes
    .map(r => {
      const ingr = (r.ingredients || []).map(i => normalizeToken(i.name));
      const matches = tokens.filter(t => ingr.includes(t)).length;
      const ratio = matches / Math.max(1, ingr.length);
      const score = matches * 2 + ratio;
      return { recipe: r, score, matches };
    })
    .filter(x => x.matches > 0)
    .sort((a, b) => b.score - a.score)
    .map(x => x.recipe);
}

// =======================
// Spesa intelligente base
// =======================
async function loadPromotions() {
  try {
    const r = await fetch('assets/json/promotions.json', { cache: 'no-store' });
    return await r.json();
  } catch {
    return { promotions: [], stores: [] };
  }
}

function bestPriceForIngredient(promos, ingredientName) {
  const name = String(ingredientName || '').toLowerCase();
  const candidates = promos.promotions.filter(p => {
    const aliases = (p.aliases || []).map(x => String(x).toLowerCase());
    return aliases.includes(name);
  });
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.price - b.price);
  const best = candidates[0];
  const store = promos.stores.find(s => s.id === best.store_id);
  return { store: store ? store.name : best.store_id, product: best.product, price: best.price };
}

async function computeSmartCart(neededItems) {
  const promos = await loadPromotions();
  return neededItems.map(n => {
    const best = bestPriceForIngredient(promos, n.name);
    return best ? { ...n, suggestion: best } : { ...n, suggestion: null };
  });
}

// =======================
// YouTube helper
// =======================
function extractYouTubeId(urlOrId) {
  try {
    if (!urlOrId) return '';
    if (urlOrId.length === 11 && !/[^a-zA-Z0-9_-]/.test(urlOrId)) return urlOrId;
    const u = new URL(urlOrId);
    if (u.hostname.includes('youtube.com')) return u.searchParams.get('v') || '';
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
  } catch {}
  return '';
}

function makeYouTube(urlOrId) {
  const id = extractYouTubeId(urlOrId);
  if (!id) return '';
  const src = 'https://www.youtube-nocookie.com/embed/' + id;
  return `<iframe src="${src}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0"></iframe>`;
}

// =======================
// Dataset ricette e merge
// =======================
async function loadJSON(p) { const r = await fetch(p, { cache: 'no-store' }); return r.json() }

function loadUserRecipes() {
  try { return JSON.parse(localStorage.getItem(USER_RECIPES_KEY)) || [] } catch { return [] }
}
function saveUserRecipes(arr) {
  localStorage.setItem(USER_RECIPES_KEY, JSON.stringify(arr));
}
async function loadRecipes() {
  const base = await loadJSON('assets/json/recipes-it.json');
  const user = loadUserRecipes();
  return [...(base.recipes || []), ...user];
}

// =======================
// Inserimento nuova ricetta
// =======================
async function validateYouTubeOnServer(urlOrId) {
  // Funziona solo su Cloudflare Pages
  const url = '/api/validate-youtube?url=' + encodeURIComponent(urlOrId) + '&allowed=' + ALLOWED_YT_CHANNELS.join(',');
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) return { ok: false, reason: 'HTTP ' + r.status };
    const data = await r.json();
    return data;
  } catch { return { ok: false, reason: 'network' } }
}

function downloadJSON(filename, obj) {
  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function addNewRecipeFromForm(formEl) {
  const fd = new FormData(formEl);
  const title = String(fd.get('title') || '').trim();
  const description = String(fd.get('description') || '').trim();
  const sourceUrl = String(fd.get('sourceUrl') || '').trim();
  const youtubeInput = String(fd.get('youtube') || '').trim();
  const servings = Number(fd.get('servings') || 2) || 2;
  const prepTime = Number(fd.get('prepTime') || 0) || 0;
  const cookTime = Number(fd.get('cookTime') || 0) || 0;
  const tags = String(fd.get('tags') || '').split(',').map(s => s.trim()).filter(Boolean);
  const ingredients = String(fd.get('ingredients') || '')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('|').map(s => s.trim());
      return { name: parts[0], quantity: Number(parts[1] || 1) || 1, unit: parts[2] || '' };
    });

  if (!title || ingredients.length === 0) {
    alert('Titolo e almeno un ingrediente sono obbligatori');
    return;
  }

  let youtubeId = '';
  if (youtubeInput) {
    const res = await validateYouTubeOnServer(youtubeInput);
    if (res && res.ok && ALLOWED_YT_CHANNELS.includes(res.channelId)) {
      youtubeId = res.id;
    } else {
      const quick = extractYouTubeId(youtubeInput);
      if (quick) youtubeId = quick;
    }
  }

  const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '-' + Date.now().toString(36);

  const rec = {
    id, title, description,
    image: '',
    servings, prepTime, cookTime,
    difficulty: 'easy',
    category: [],
    ingredients,
    steps: [],
    tags,
    sourceUrl,
    youtubeId
  };

  const current = loadUserRecipes();
  current.push(rec);
  saveUserRecipes(current);

  alert('Ricetta aggiunta in locale. Usa Esporta JSON per aggiornare il dataset');
  renderRecipesView();
}

function exportMergedRecipes() {
  loadJSON('assets/json/recipes-it.json').then(base => {
    const user = loadUserRecipes();
    const merged = { ...base, recipes: [ ...(base.recipes || []), ...user ] };
    downloadJSON('recipes-it.updated.json', merged);
  });
}

// =======================
// Rendering
// =======================
function renderTags(tags) {
  return (tags || []).map(t => `<span class="pill">${esc(t)}</span>`).join(' ');
}

function renderRecipeCard(r) {
  return `
    <article class="card">
      <div class="thumb">${r.image ? `<img src="${esc(r.image)}" alt="">` : ''}</div>
      <div class="body">
        <div class="title3">${esc(r.title)}</div>
        <div class="meta">${totalMinutes(r)} min totali</div>
        <div class="tags">${renderTags(r.tags)}</div>
        <div class="actions">
          <button class="btn btn-green" data-action="add-list" data-id="${esc(r.id)}">Aggiungi alla lista</button>
          ${r.youtubeId ? `<button class="btn btn-blue" data-action="watch" data-yt="${esc(r.youtubeId)}">Video</button>` : `<button class="btn btn-blue" disabled>Video</button>`}
          ${r.sourceUrl ? `<a class="btn" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">Preparazione</a>` : ''}
        </div>
      </div>
    </article>
  `;
}

async function renderRecipesView() {
  const app = ensureContainer('app');
  const all = await loadRecipes();
  html(app, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:8px">
      <h2 style="margin:0">Ricette</h2>
      <button id="btn-new-recipe" class="btn">Nuova ricetta</button>
      <button id="btn-export-recipes" class="btn">Esporta JSON aggiornato</button>
    </div>
    <section class="grid" id="grid"></section>
  `);
  const grid = $('#grid');
  html(grid, all.map(renderRecipeCard).join(''));

  grid.addEventListener('click', ev => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'add-list') {
      const r = all.find(x => x.id === btn.dataset.id);
      if (!r) return;
      addToList((r.ingredients || []).map(i => ({ name: i.name, qty: i.quantity || i.qty || 1, unit: i.unit || '' })));
      alert('Ingredienti aggiunti');
    }
    if (action === 'watch') {
      const id = btn.dataset.yt;
      const holder = document.createElement('div');
      holder.innerHTML = makeYouTube(id);
      document.body.appendChild(holder);
      setTimeout(() => {
        const iframe = holder.querySelector('iframe');
        if (!iframe || !iframe.contentWindow) window.open('https://www.youtube.com/watch?v=' + id, '_blank');
      }, 2000);
    }
  });

  $('#btn-new-recipe').onclick = () => renderAddRecipeView();
  $('#btn-export-recipes').onclick = exportMergedRecipes;
}

async function renderListView() {
  const app = ensureContainer('app');
  const list = loadList();
  const smart = await computeSmartCart(list);
  html(app, `
    <h2>Lista</h2>
    <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button id="btn-clear-checked" class="btn">Rimuovi spuntati</button>
      <button id="btn-refresh-list" class="btn">Ricarica</button>
    </div>
    <div id="list"></div>
  `);

  const listEl = $('#list');
  function rowHTML(i) {
    const sug = i.suggestion
      ? `<div class="meta">Offerta migliore: ${esc(i.suggestion.store)} · ${esc(i.suggestion.product)} · €${Number(i.suggestion.price).toFixed(2)}</div>`
      : `<div class="meta">Nessuna offerta</div>`;
    return `
      <article class="card" data-name="${esc(i.name)}">
        <div class="body">
          <div><strong>${esc(i.name)}</strong> · ${Number(i.qty).toString()} ${esc(i.unit || '')}</div>
          ${sug}
          <div class="actions">
            <button class="btn" data-action="toggle">Comprato/Non comprato</button>
            <button class="btn" data-action="remove">Rimuovi</button>
          </div>
        </div>
      </article>
    `;
  }
  html(listEl, smart.map(rowHTML).join(''));

  listEl.addEventListener('click', ev => {
    const btn = ev.target.closest('button'); if (!btn) return;
    const row = ev.target.closest('.card'); const name = row?.getAttribute('data-name'); if (!name) return;
    const action = btn.getAttribute('data-action');
    if (action === 'toggle') { toggleList(name); renderListView() }
    if (action === 'remove') { removeFromList(name); renderListView() }
  });

  $('#btn-clear-checked').onclick = () => { clearChecked(); renderListView() };
  $('#btn-refresh-list').onclick = () => renderListView();
}

function renderAddRecipeView() {
  const app = ensureContainer('app');
  html(app, `
    <h2>Nuova ricetta</h2>
    <form id="form-recipe" style="display:grid;gap:10px;max-width:640px">
      <input name="title" placeholder="Titolo" required />
      <textarea name="description" placeholder="Descrizione"></textarea>
      <textarea name="ingredients" placeholder="Ingredienti, uno per riga. Formato: nome | qty | unit"></textarea>
      <input name="tags" placeholder="Tag separati da virgola" />
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <input name="servings" type="number" min="1" value="2" placeholder="Porzioni" />
        <input name="prepTime" type="number" min="0" value="0" placeholder="Prep min" />
        <input name="cookTime" type="number" min="0" value="0" placeholder="Cottura min" />
      </div>
      <input name="sourceUrl" placeholder="Link preparazione" />
      <input name="youtube" placeholder="URL o ID YouTube" />
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button type="submit" class="btn btn-green">Salva in locale</button>
        <button type="button" id="back" class="btn">Annulla</button>
      </div>
      <p style="font-size:12px;color:#555">Il video viene validato su canali consentiti quando l’app è su Cloudflare Pages. In locale e su GitHub Pages viene accettato un ID valido.</p>
    </form>
  `);
  $('#form-recipe').onsubmit = async ev => { ev.preventDefault(); await addNewRecipeFromForm(ev.target) };
  $('#back').onclick = () => renderRecipesView();
}

async function renderSmartView() {
  const app = ensureContainer('app');
  const list = loadList();
  const smart = await computeSmartCart(list);
  html(app, `
    <h2>Spesa smart</h2>
    <div class="grid">
      ${smart.map(i => `
        <article class="card">
          <div class="body">
            <div><strong>${esc(i.name)}</strong> · ${Number(i.qty).toString()} ${esc(i.unit || '')}</div>
            ${i.suggestion
              ? `<div class="meta">Vai da <strong>${esc(i.suggestion.store)}</strong> · ${esc(i.suggestion.product)} · €${Number(i.suggestion.price).toFixed(2)}</div>`
              : `<div class="meta">Nessuna offerta</div>`}
          </div>
        </article>
      `).join('')}
    </div>
  `);
}

function renderPlansView() {
  const app = ensureContainer('app');
  html(app, `
    <h2>Piani</h2>
    <table>
      <thead><tr><th>Funzione</th><th>Demo</th><th>Starter</th><th>Premium</th></tr></thead>
      <tbody>
        <tr><td>Ricette complete</td><td>20</td><td>Tutte</td><td>Tutte</td></tr>
        <tr><td>Filtri multi tag AND</td><td>No</td><td>Sì</td><td>Sì</td></tr>
        <tr><td>Suggerisci ricette</td><td>No</td><td>Sì</td><td>Sì</td></tr>
        <tr><td>OCR</td><td>No</td><td>Base</td><td>Avanzato</td></tr>
        <tr><td>Spesa intelligente</td><td>No</td><td>Base</td><td>Pro</td></tr>
        <tr><td>Piani pasto</td><td>No</td><td>No</td><td>Sì</td></tr>
        <tr><td>Benessere stile Fit Hub Pro</td><td>No</td><td>No</td><td>Sì</td></tr>
      </tbody>
    </table>
  `);
}

// =======================
// Bootstrap
// =======================
function wireNav() {
  $('#btn-refresh')?.addEventListener('click', () => location.reload());
  // Collega qui eventuali bottoni custom se presenti nel tuo header
}
async function bootstrap() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('service-worker.js') } catch {}
  }
  ensureContainer('app');
  wireNav();
  await renderRecipesView();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
