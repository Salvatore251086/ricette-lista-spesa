/* app.js — logica PWA essenziale + tracking WhatsApp */

// === Config ===
const SCOPE = "/ricette-lista-spesa/";
const SW_URL = `${SCOPE}service-worker.js`;

// 🔁 Sostituisci con l’URL reale del tuo canale WhatsApp
const WHATSAPP_URL = "https://whatsapp.com/channel/+393929328234";

// === Service Worker ===
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(SW_URL, { scope: SCOPE }).catch(console.error);
  });
}

// === Install prompt (Android/desktop Chrome) ===
let deferredPrompt = null;
const installBtn = document.querySelector("#installBtn");

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.hidden = false;
});

if (installBtn) {
  installBtn.addEventListener("click", async () => {
    if (!deferredPrompt) return;
    installBtn.disabled = true;
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      // Plausible (se presente) — traccia install accettata/rifiutata
      if (window.plausible) {
        plausible("pwa_install", { props: { outcome: choice.outcome } });
      }
    } finally {
      deferredPrompt = null;
      installBtn.hidden = true;
    }
  });
}

// === Link/CTA WhatsApp ===
const waLinks = document.querySelectorAll('[data-wa="channel"]');
waLinks.forEach((a) => {
  // Se manca href, impostalo all’URL del canale
  if (!a.getAttribute("href")) a.setAttribute("href", WHATSAPP_URL);
  a.setAttribute("rel", "noopener");
  a.setAttribute("target", "_blank");
  a.addEventListener("click", () => {
    if (window.plausible) plausible("wa_channel_open");
  });
});

// === Fallback tracking utente (facoltativo, leggero) ===
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && window.plausible) {
    // piccolo ping di “heartbeat” light
    plausible("page_visible");
  }
});

