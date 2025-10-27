// script/register-sw.js  v16.1
(function(){
  const SW_URL = new URL("service-worker.js?v=v16.1", location).href;

  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL).then(reg => {
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

  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());

  // helper opzionale
  window.__swBypassOnce = function(){
    sessionStorage.setItem("__bypass_cache", "1");
    location.reload();
  };
})();
