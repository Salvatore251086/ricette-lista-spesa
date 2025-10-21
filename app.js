// Evita doppie inizializzazioni se lo script viene caricato due volte
(function () {
  if (window.__APP_INITIALIZED__) return;
  window.__APP_INITIALIZED__ = true;

  // ---- Service Worker "deploy-safe"
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/ricette-lista-spesa/service-worker.js', { scope: '/ricette-lista-spesa/' });
        .then(reg => {
          // console.log('SW registered', reg.scope);
        })
        .catch(err => console.warn('SW registration failed', err));
    });
  }

  // ---- Install prompt PWA (safe)
  const installBtn = document.querySelector('[data-install-app]');
  let deferredPrompt = null;

  // Mostra la CTA solo quando l’evento arriva (evita bottone disabilitato)
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (installBtn) {
      installBtn.hidden = false;
      installBtn.removeAttribute('aria-hidden');
      installBtn.disabled = false;
    }
  }, { once: true });

  // Click su "Installa l’app"
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredPrompt) return;
      try {
        const choice = await deferredPrompt.prompt();
        // opzionale: GA4
        if (typeof gtag === 'function') {
          gtag('event', 'pwa_install_prompt', { outcome: choice.outcome });
        }
      } catch (_) {}
      deferredPrompt = null;
      installBtn.disabled = true;
    });
  }

  // (Opzionale) evento "app già installata"
  window.addEventListener('appinstalled', () => {
    if (typeof gtag === 'function') gtag('event', 'pwa_installed');
  });

  // ---- iOS/Safari fallback (niente beforeinstallprompt)
  (function() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    const iosTip = document.getElementById('ios-install-tip');

    if (isIOS && isSafari) {
      if (iosTip) iosTip.hidden = false;
      if (installBtn) installBtn.hidden = true;
    }
  })();
})();
