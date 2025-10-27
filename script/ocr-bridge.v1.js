// Bridge OCR: ascolta lo scatto della fotocamera e aggiorna la UI
// Ordine eventi: camera.v2 -> dispatch('camera:snapshot', { blob, dataURL, ... }) -> questo file

(function(){
  // Config, aggiorna i selettori se il markup cambia
  var SELECTORS = {
    ingredientsTextarea: 'textarea, [data-ingredients-textarea]',
    cameraFrame: '.rls-camera-frame' // creato da camera.v2
  };

  // Hook opzionali che puoi definire altrove:
  // 1) window.ocrProcess(blob|dataURL) -> Promise<string>
  // 2) window.onCameraSnapshot(payload) -> void
  // Se ocrProcess non esiste, faccio solo anteprima e log.

  document.addEventListener('camera:snapshot', async function(e){
    try {
      var detail = e.detail || {};
      var blob = detail.blob;
      var dataURL = detail.dataURL;

      // Anteprima rapida nel riquadro camera
      ensurePreview(dataURL);

      // Notifica hook opzionale
      if (typeof window.onCameraSnapshot === 'function') {
        try { window.onCameraSnapshot(detail); } catch(_) {}
      }

      // Se esiste un processore OCR, usalo, altrimenti fermati
      if (typeof window.ocrProcess === 'function') {
        setBusy(true);
        var text = await safeOCR(blob, dataURL);
        applyTextToTextarea(text);
        toast('OCR completato');
      } else {
        toast('Imposta ocrProcess per leggere il testo dall’immagine');
        if (window.debugTools) console.info('[ocr-bridge] dataURL length', dataURL && dataURL.length);
      }
    } catch(err) {
      if (window.debugTools) console.warn('[ocr-bridge] errore', err && err.message);
      toast('Errore OCR. Riprova o usa Carica foto.');
    } finally {
      setBusy(false);
    }
  });

  async function safeOCR(blob, dataURL){
    try {
      // Preferisci Blob. Se fallisce, passa dataURL.
      return await window.ocrProcess(blob);
    } catch(_) {
      if (window.debugTools) console.warn('[ocr-bridge] fallback su dataURL');
      return await window.ocrProcess(dataURL);
    }
  }

  function applyTextToTextarea(text){
    if (!text) return;
    var area = document.querySelector(SELECTORS.ingredientsTextarea);
    if (!area) return;
    // Aggiunge o sostituisce, scegli la modalità
    var sep = area.value && area.value.trim() ? '\n' : '';
    area.value = area.value + sep + text.trim();
    // Trigger evento input per eventuali listener
    var ev = new Event('input', { bubbles: true });
    area.dispatchEvent(ev);
  }

  function ensurePreview(dataURL){
    try {
      var frame = document.querySelector(SELECTORS.cameraFrame);
      if (!frame) return;
      var id = 'rls-camera-preview';
      var img = frame.querySelector('#' + id);
      if (!img) {
        img = document.createElement('img');
        img.id = id;
        img.alt = 'Anteprima scatto';
        img.style.position = 'absolute';
        img.style.inset = '0';
        img.style.width = '100%';
        img.style.height = '100%';
        img.style.objectFit = 'cover';
        frame.appendChild(img);
      }
      img.src = dataURL;
    } catch(_) {}
  }

  function setBusy(on){
    var body = document.body;
    if (!body) return;
    if (on) body.setAttribute('data-ocr-busy', '1');
    else body.removeAttribute('data-ocr-busy');
  }

  // Toast minimale condiviso con debugTools style
  function toast(msg) {
    try {
      var t = document.createElement('div');
      t.textContent = msg;
      t.style.position = 'fixed';
      t.style.zIndex = 2147483647;
      t.style.left = '50%';
      t.style.top = '10px';
      t.style.transform = 'translateX(-50%)';
      t.style.padding = '8px 12px';
      t.style.background = 'rgba(0,0,0,0.8)';
      t.style.color = '#fff';
      t.style.fontSize = '12px';
      t.style.borderRadius = '8px';
      t.style.pointerEvents = 'none';
      document.body.appendChild(t);
      setTimeout(function(){ t.remove(); }, 1500);
    } catch(e) {}
  }

  // Diagnostica integrata
  if (window.debugTools) {
    var prev = window.getAppState;
    window.getAppState = function(){
      var extra = prev ? prev() : {};
      return Object.assign({}, extra, { ocr: { busy: document.body && document.body.hasAttribute('data-ocr-busy') } });
    };
  }
})();
