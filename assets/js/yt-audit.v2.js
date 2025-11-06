// Audit UI helper v2
// - Attiva i filtri con classe chip--on
// - Logga quante righe sono nel video_index caricabile
(function () {
  "use strict";

  function onReady(fn){ if (document.readyState !== "loading") fn(); else document.addEventListener("DOMContentLoaded", fn); }

  onReady(async () => {
    try {
      const url = "assets/json/video_index.resolved.json";
      const r = await fetch(url, { cache: "no-store" });
      const rows = r.ok ? await r.json() : [];
      console.log("yt-audit caricato, righe:", rows.length);
    } catch {
      console.warn("yt-audit non caricato, UI ok");
    }

    document.addEventListener("click", e => {
      const btn = e.target.closest("[data-filter]");
      if (!btn) return;
      document.querySelectorAll("[data-filter]").forEach(b => b.classList.remove("chip--on"));
      btn.classList.add("chip--on");
      if (window.rls && typeof window.rls.rerender === "function") window.rls.rerender();
    });
  });
})();
