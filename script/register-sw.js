// Registrazione SW con hard-refresh helper
(function(){
  const SW_URL = "service-worker.js?v=v16.1";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register(SW_URL).then(reg => {
        // Aggiorna subito se trova una nuova versione
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        reg.addEventListener("updatefound", () => {
          const nw = reg.installing;
          if (!nw) return;
          nw.addEventListener("statechange", () => {
            if (nw.state === "installed" && navigator.serviceWorker.controller) {
              nw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      }).catch(console.error);
    });

    // Ricarica client quando il SW prende il controllo
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      location.reload();
    });
  }

  // Helper per sviluppo
  window.__swBypassOnce = function(){
    sessionStorage.setItem("__bypass_cache", "1");
    location.reload();
  };
})();
