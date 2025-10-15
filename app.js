// Elementi UI
const $recipes = document.getElementById('recipes');
const $shopping = document.getElementById('shopping');
const $sr = document.getElementById('sr-updates');
const installBtn = document.getElementById('installBtn');
const refreshBtn = document.getElementById('refreshBtn');

// beforeinstallprompt
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.classList.remove('hidden');
});

installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.classList.add('hidden');
});

// Flusso update SW
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', evt => {
    if (evt.data && evt.data.type === 'SW_UPDATED') {
      $sr.textContent = 'Aggiornamento disponibile';
      refreshBtn.classList.remove('hidden');
    }
  });

  refreshBtn?.addEventListener('click', async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return location.reload();
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    } else {
      location.reload();
    }
  });
}

// Render demo, sostituisci con la logica reale
function render() {
  $recipes.innerHTML = '<p>Lista ricette</p>';
  $shopping.innerHTML = '<p>Lista spesa</p>';
}
render();
