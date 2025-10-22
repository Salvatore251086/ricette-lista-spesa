// chiave di storage
const KEY = 'rls-lista';

// DOM
const elName = document.getElementById('itemName');
const elQty  = document.getElementById('itemQty');
const elAdd  = document.getElementById('addBtn');
const elClear= document.getElementById('clearBtn');
const elList = document.getElementById('list');

// stato
let items = [];

// util
const save = () => localStorage.setItem(KEY, JSON.stringify(items));
const load = () => {
  try { items = JSON.parse(localStorage.getItem(KEY)) || []; }
  catch { items = []; }
};
const uid = () => Math.random().toString(36).slice(2,9);

// render
function render(){
  elList.innerHTML = '';
  if (!items.length){
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'Lista vuota.';
    elList.appendChild(li);
    return;
  }

  for (const it of items){
    const li = document.createElement('li');
    if (it.done) li.classList.add('done');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = it.done;
    cb.addEventListener('change', () => {
      it.done = cb.checked;
      save(); render();
    });

    const label = document.createElement('label');
    label.className = 'grow';
    label.textContent = it.name;

    const qty = document.createElement('span');
    qty.className = 'qty';
    qty.textContent = `×${it.qty}`;

    const del = document.createElement('button');
    del.className = 'btn btn-ghost';
    del.textContent = 'Rimuovi';
    del.addEventListener('click', () => {
      items = items.filter(x => x.id !== it.id);
      save(); render();
    });

    const actions = document.createElement('div');
    actions.className = 'actions';
    actions.appendChild(del);

    li.appendChild(cb);
    li.appendChild(label);
    li.appendChild(qty);
    li.appendChild(actions);
    elList.appendChild(li);
  }
}

// azioni
function add(){
  const name = elName.value.trim();
  const qty  = Math.max(1, parseInt(elQty.value || '1', 10));
  if(!name) return;

  items.unshift({ id: uid(), name, qty, done:false });
  elName.value = '';
  elQty.value = '1';
  save(); render();
}

function clearAll(){
  if (!items.length) return;
  if (!confirm('Svuotare tutta la lista?')) return;
  items = []; save(); render();
}

// bind
elAdd.addEventListener('click', add);
elName.addEventListener('keydown', e => { if(e.key === 'Enter') add(); });
elClear.addEventListener('click', clearAll);

// init
load(); render();
