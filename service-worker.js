// Evita doppie inizializzazioni se lo script viene caricato due volte
if (window.__APP_INITIALIZED__) {
  // già inizializzato
} else {
  window.__APP_INITIALIZED__ = true;

  // ---- Service Worker “deploy-safe”
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/ricette-lista-spesa/sw.js')
        .catch(err => console.warn('SW registration failed', err));
    });
  }

  // ---- Install prompt PWA
  const installBtn = document.querySelector('[data-install-app]');
  let deferredPrompt = null;

  // Abilito il bottone solo quando il browser emette l’evento corretto
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) installBtn.disabled = false;
  }, { once: true });

  // Click su “Installa l’app”
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      try {
        deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;

        // Tracciamento opzionale con GA4
        if (typeof gtag === 'function') {
          gtag('event', 'pwa_install_prompt', { outcome: choice.outcome });
        }
      } catch (_) {
        /* no-op */
      } finally {
        deferredPrompt = null;
        installBtn.disabled = true;
      }
    });
  }

  // (Opzionale) evento quando l’app viene installata
  window.addEventListener('appinstalled', () => {
    if (typeof gtag === 'function') gtag('event', 'pwa_installed');
  });
}
