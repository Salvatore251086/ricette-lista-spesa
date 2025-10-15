/* app.js */
(() => {
  // SW registration già gestita nel blocco in index.html.
  // Qui puoi aggiungere piccoli hook di UI, se ti servono.

  // Esempio: mostra versione SW in console
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) => {
      if (regs[0]) {
        console.log('Service Worker attivo su:', regs[0].scope);
      }
    });
  }
})();
