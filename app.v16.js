// Ricette & Lista Spesa · App core aggiornato

// 1) Persistenza lista spesa con dedupe
const LIST_KEY = 'rls.list';

function loadList() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY)) || []; } catch(e) { return []; }
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
    if (idx >= 0) {
      list[idx].qty = Number(list[idx].qty || 0) + qty;
    } else {
      list.push({ name, qty, unit, checked: false });
    }
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

// 2) Filtri a chip con logica AND
function filterByTagsAND(recipes, activeTags) {
  if (!activeTags || activeTags.length === 0) return recipes;
  const want = activeTags.map(t => t.toLowerCase());
  return recipes.filter(r => {
    const tags = (r.tags || []).map(t => t.toLowerCase());
    return want.every(t => tags.includes(t));
  });
}

// 3) Suggerisci ricette con punteggio
function normalizeToken(s) { return String(s).toLowerCase().trim(); }

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

// 4) Spesa intelligente base
async function loadPromotions() {
  try {
    const r = await fetch('assets/json/promotions.json', { cache: 'no-store' });
    return await r.json();
  } catch(e) {
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
  return {
    store: store ? store.name : best.store_id,
    product: best.product,
    price: best.price
  };
}

async function computeSmartCart(neededItems) {
  const promos = await loadPromotions();
  return neededItems.map(n => {
    const best = bestPriceForIngredient(promos, n.name);
    return best ? { ...n, suggestion: best } : { ...n, suggestion: null };
  });
}

// 5) YouTube helper con fallback
function makeYouTube(urlOrId) {
  let id = '';
  try {
    id = urlOrId.length === 11 ? urlOrId : new URL(urlOrId).searchParams.get('v') || '';
  } catch { id = ''; }
  if (!id) return '';
  const src = 'https://www.youtube-nocookie.com/embed/' + id;
  const iframe = `<iframe src="${src}" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0"></iframe>`;
  // Fallback onerror via timeout lato UI quando si inserisce nel DOM
  return iframe;
}

// 6) Data loaders
async function loadJSON(p) {
  const r = await fetch(p, { cache: 'no-store' });
  return r.json();
}

async function loadRecipes() {
  const data = await loadJSON('assets/json/recipes-it.json');
  return data.recipes || [];
}

// 7) Rendering UI
function el(sel) { return document.querySelector(sel); }
function html(target, content) { target.innerHTML = content; }
function esc(s) { return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function renderTags(tags) {
  return (tags || []).map(t => `<span class="badge">${esc(t)}</span>`).join('');
}

function renderRecipeCard(r) {
  const tags = renderTags(r.tags);
  return `
    <div class="card">
      <h3>${esc(r.title)}</h3>
      <div>${Number(r.time_min || r.cookTime || 0)} min</div>
      <div>${tags}</div>
      <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">
        <button data-action="add-list" data-id="${esc(r.id)}">Aggiungi alla lista</button>
        ${r.youtubeId ? `<button data-action="watch" data-id="${esc(r.youtubeId)}">Guarda video</button>` : ''}
      </div>
    </div>
  `;
}

async function renderRecipesView() {
  const app = el('#app');
  const all = await loadRecipes();
  html(app, `<h2>Ricette</h2><div class="grid" id="grid"></div>`);
  const grid = el('#grid');
  html(grid, all.map(renderRecipeCard).join(''));

  grid.addEventListener('click', ev => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'add-list') {
      const id = btn.getAttribute('data-id');
      const r = all.find(x => x.id === id);
      if (!r) return;
      addToList((r.ingredients || []).map(i => ({ name: i.name, qty: i.qty || i.quantity || 1, unit: i.unit || '' })));
      alert('Ingredienti aggiunti alla lista');
    }
    if (action === 'watch') {
      const id = btn.getAttribute('data-id');
      const container = document.createElement('div');
      container.innerHTML = makeYouTube(id);
      document.body.appendChild(container);
      // Fallback
      setTimeout(() => {
        const iframe = container.querySelector('iframe');
        if (!iframe || !iframe.contentWindow) {
          window.open('https://www.youtube.com/watch?v=' + id, '_blank');
        }
      }, 2000);
    }
  });
}

async function renderListView() {
  const app = el('#app');
  const list = loadList();
  const smart = await computeSmartCart(list);

  html(app, `
    <h2>Lista</h2>
    <div style="margin-bottom:10px;display:flex;gap:8px;flex-wrap:wrap">
      <button id="btn-clear-checked">Rimuovi spuntati</button>
      <button id="btn-refresh-list">Ricarica</button>
    </div>
    <div id="list"></div>
  `);

  const listEl = el('#list');
  function rowHTML(i) {
    const sug = i.suggestion
      ? `<div style="font-size:12px;color:#555">Offerta migliore: ${esc(i.suggestion.store)} · ${esc(i.suggestion.product)} · €${Number(i.suggestion.price).toFixed(2)}</div>`
      : `<div style="font-size:12px;color:#888">Nessuna offerta trovata</div>`;
    return `
      <div class="card" data-name="${esc(i.name)}">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
          <div>
            <div><strong>${esc(i.name)}</strong> · ${Number(i.qty).toString()} ${esc(i.unit || '')}</div>
            ${sug}
          </div>
          <div style="display:flex;gap:8px">
            <button data-action="toggle">${i.checked ? 'Non comprato' : 'Comprato'}</button>
            <button data-action="remove">Rimuovi</button>
          </div>
        </div>
      </div>
    `;
  }
  html(listEl, smart.map(rowHTML).join(''));

  listEl.addEventListener('click', ev => {
    const btn = ev.target.closest('button');
    if (!btn) return;
    const row = ev.target.closest('.card');
    const name = row?.getAttribute('data-name');
    if (!name) return;
    const action = btn.getAttribute('data-action');
    if (action === 'toggle') {
      toggleList(name);
      renderListView();
    }
    if (action === 'remove') {
      removeFromList(name);
      renderListView();
    }
  });

  el('#btn-clear-checked').onclick = () => { clearChecked(); renderListView(); };
  el('#btn-refresh-list').onclick = () => renderListView();
}

async function renderSmartView() {
  const app = el('#app');
  const list = loadList();
  const smart = await computeSmartCart(list);
  html(app, `
    <h2>Spesa smart</h2>
    <div class="grid">
      ${smart.map(i => `
        <div class="card">
          <div><strong>${esc(i.name)}</strong> · ${Number(i.qty).toString()} ${esc(i.unit || '')}</div>
          ${i.suggestion
            ? `<div style="margin-top:6px">Vai da <strong>${esc(i.suggestion.store)}</strong><br>${esc(i.suggestion.product)} · €${Number(i.suggestion.price).toFixed(2)}</div>`
            : `<div style="margin-top:6px;color:#888">Nessuna offerta trovata</div>`}
        </div>
      `).join('')}
    </div>
  `);
}

function renderPlansView() {
  const app = el('#app');
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

// 8) Navigazione e bootstrap
async function bootstrap() {
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('service-worker.js'); } catch {}
  }
  el('#nav-recipes')?.addEventListener('click', renderRecipesView);
  el('#nav-lista')?.addEventListener('click', renderListView);
  el('#nav-spesa')?.addEventListener('click', renderSmartView);
  el('#nav-piani')?.addEventListener('click', renderPlansView);
  el('#btn-refresh')?.addEventListener('click', () => location.reload());

  // Vista iniziale
  await renderRecipesView();
}

bootstrap();
