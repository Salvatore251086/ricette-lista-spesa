/* generator.js
   Logica del generatore ingredienti:
   - vocabolario + normalizzazione + matching
   - UI pill (add/remove)
   - persistenza localStorage
   - API per OCR/integrazioni: ingFromText(text), ingAdd(raw), ingClear()
*/

const LS_KEY = 'rls.ingredients.v1';
const VOCAB_URL = 'assets/icons/json/ingredients-it.json'; // <-- percorso reale nel tuo repo

const els = {
  fileInput:       document.getElementById('fileInput'),
  openCamBtn:      document.getElementById('openCamBtn'),
  video:           document.getElementById('video'),
  snapBtn:         document.getElementById('snapBtn'),
  stopCamBtn:      document.getElementById('stopCamBtn'),
  canvas:          document.getElementById('canvas'),

  preview:         document.getElementById('preview'),
  ocrStatus:       document.getElementById('ocrStatus'),
  ocrOut:          document.getElementById('ocrOut'),

  manualAdd:       document.getElementById('manualAdd'),
  addBtn:          document.getElementById('addBtn'),
  clearBtn:        document.getElementById('clearBtn'),
  list:            document.getElementById('ingredientsList'),
};

const state = {
  set: new Set(),
  vocab: null,
  cameraStream: null,
};

/* -------- Utils -------- */
function normalize(s){
  return (s||'')
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}+/gu,'')
    .replace(/[^a-z0-9\s]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function tokenize(text){
  return normalize(text)
    .split(/[\n,;•·\-]+/).map(t=>t.trim()).filter(Boolean);
}

/* -------- Vocabolario -------- */
async function loadVocabulary(){
  try {
    const res = await fetch(VOCAB_URL, { cache:'no-store' });
    state.vocab = await res.json();
  } catch (e){
    console.warn('Vocabolario non trovato o malformato.', e);
    state.vocab = {};
  }
}
function buildReverseMap(vocab){
  const m = new Map();
  for (const [canonical, synonyms] of Object.entries(vocab)){
    const base = normalize(canonical);
    m.set(base, canonical);
    if (Array.isArray(synonyms)){
      for (const s of synonyms) m.set(normalize(s), canonical);
    }
  }
  return m;
}
function matchTokensToVocab(tokens){
  if (!state.vocab) return [];
  const rev = buildReverseMap(state.vocab);
  const found = [];

  for (const t of tokens){
    const coarse = t.replace(/\b(\d+([.,]\d+)?\s*(g|kg|ml|l|pz|x))\b/g,'').trim();
    const key = normalize(coarse);
    if (!key) continue;

    if (rev.has(key)){
      const canon = rev.get(key);
      if (!found.includes(canon)) found.push(canon);
      continue;
    }
    const parts = key.split(' ');
    let matched = false;
    for (let i=0;i<parts.length && !matched;i++){
      for (let j=parts.length;j>i;j--){
        const sub = parts.slice(i,j).join(' ');
        if (rev.has(sub)){
          const canon = rev.get(sub);
          if (!found.includes(canon)) found.push(canon);
          matched = true;
          break;
        }
      }
    }
  }
  return found;
}

/* -------- Stato + Render -------- */
function render(){
  els.list.innerHTML = '';
  [...state.set].sort().forEach(item=>{
    const li = document.createElement('li');
    li.className = 'pill';
    li.innerHTML = `
      <span>${item}</span>
      <button class="pill-x" title="Rimuovi" aria-label="Rimuovi ${item}">×</button>
    `;
    li.style.display = 'inline-flex';
    li.style.alignItems = 'center';
    li.style.gap = '.4rem';
    li.querySelector('.pill-x').addEventListener('click', ()=>{
      state.set.delete(item);
      persist();
      render();
      announce();
    });
    els.list.appendChild(li);
  });
}
function persist(){
  try { localStorage.setItem(LS_KEY, JSON.stringify([...state.set])); } catch {}
}
function restore(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) JSON.parse(raw).forEach(v=>state.set.add(v));
  } catch {}
}

/* -------- API pubblica -------- */
function addCanonical(list){
  list.forEach(v => state.set.add(v));
  persist(); render(); announce();
}
export function ingAdd(raw){
  const tokens = tokenize(raw);
  const matched = matchTokensToVocab(tokens);
  if (matched.length) addCanonical(matched);
  else {
    const fallback = tokens.join(' ');
    if (fallback) addCanonical([fallback]);
  }
}
export function ingFromText(text){
  const tokens = tokenize(text);
  const matched = matchTokensToVocab(tokens);
  if (matched.length) addCanonical(matched);
}
export function ingClear(){
  state.set.clear(); persist(); render(); announce();
}

/* -------- Annuncio per ricette -------- */
function announce(){
  const detail = [...state.set];
  window.dispatchEvent(new CustomEvent('ingredients:updated',{ detail }));
  window.plausible && plausible('ingredients_updated', { props:{ count: detail.length }});
}

/* -------- UI manuale -------- */
function bindManualUI(){
  els.addBtn?.addEventListener('click', ()=>{
    const raw = (els.manualAdd.value || '').trim();
    if (!raw) return;
    ingAdd(raw);
    els.manualAdd.value = '';
    els.manualAdd.focus();
  });
  els.clearBtn?.addEventListener('click', ingClear);
}

/* -------- File → anteprima (OCR altrove) -------- */
els.fileInput?.addEventListener('change', (e)=>{
  const f = e.target.files?.[0];
  if (!f) return;
  if (els.preview){
    els.preview.src = URL.createObjectURL(f);
    els.preview.style.display = 'block';
  }
  window.plausible && plausible('ocr_file_selected');
});

/* -------- Boot -------- */
(async function init(){
  await loadVocabulary();
  restore();
  render();
  bindManualUI();
})();
