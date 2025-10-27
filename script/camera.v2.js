// Fotocamera v2, difensiva e idempotente
(function () {
  const S = {
    stream: null,
    videoEl: null,
    canvasEl: null,
    inited: false
  };

  // Selettori resilienti basati sui testi dei tuoi bottoni
  function qBtn(text) {
    const xp = "//button[normalize-space(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'))='" + text + "']";
    const r = document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
    return r || null;
  }

  function ensureNodes() {
    if (S.videoEl && S.canvasEl) return;
    // trova il box nero vicino ai bottoni
    let host = qBtn('apri fotocamera');
    host = host && host.closest('.camera, .webcam, .ocr, .box, div');
    if (!host) host = document.body;

    // crea contenitori se mancano
    let frame = host.querySelector('.rls-camera-frame');
    if (!frame) {
      frame = document.createElement('div');
      frame.className = 'rls-camera-frame';
      frame.style.position = 'relative';
      frame.style.width = '100%';
      frame.style.background = '#000';
      frame.style.aspectRatio = '16/9';
      frame.style.overflow = 'hidden';
      host.querySelector('video,canvas') ? host.querySelector('video,canvas').parentElement.appendChild(frame) : host.appendChild(frame);
    }

    if (!S.videoEl) {
      S.videoEl = document.createElement('video');
      S.videoEl.playsInline = true;
      S.videoEl.autoplay = true;
      S.videoEl.muted = true;
      S.videoEl.style.width = '100%';
      S.videoEl.style.height = '100%';
      S.videoEl.style.objectFit = 'cover';
      frame.appendChild(S.videoEl);
    }
    if (!S.canvasEl) {
      S.canvasEl = document.createElement('canvas');
      S.canvasEl.className = 'rls-snap hidden';
      S.canvasEl.style.display = 'none';
      frame.appendChild(S.canvasEl);
    }
  }

  async function openCamera() {
    try {
      await closeCamera(); // idempotente
      ensureNodes();
      const constraints = {
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      S.stream = stream;
      S.videoEl.srcObject = stream;

      // timeout di avvio
      await Promise.race([
        new Promise(res => S.videoEl.onloadedmetadata = res),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout-start')), 4000))
      ]);
      S.videoEl.play().catch(() => {});
      toggleButtons(true);
      debug('camera open');
    } catch (e) {
      debug('camera error: ' + e.message);
      alert('Fotocamera non disponibile. Usa "Carica foto".');
      dispatch('camera:error', { error: String(e) });
    }
  }

  function toggleButtons(open) {
    const bOpen = qBtn('apri fotocamera');
    const bShot = qBtn('scatta & ocr') || qBtn('scatta') || qBtn('scatta & o.c.r');
    const bClose = qBtn('chiudi camera');
    if (bOpen) bOpen.disabled = open;
    if (bShot) bShot.disabled = !open;
    if (bClose) bClose.disabled = !open;
  }

  async function closeCamera() {
    try {
      if (S.stream) {
        S.stream.getTracks().forEach(t => t.stop());
      }
    } catch(_) {}
    if (S.videoEl) S.videoEl.srcObject = null;
    S.stream = null;
    toggleButtons(false);
    dispatch('camera:closed', {});
  }

  function snapshot() {
    if (!S.videoEl) return;
    const w = S.videoEl.videoWidth || 1280;
    const h = S.videoEl.videoHeight || 720;
    S.canvasEl.width = w;
    S.canvasEl.height = h;
    const ctx = S.canvasEl.getContext('2d');
    ctx.drawImage(S.videoEl, 0, 0, w, h);
    S.canvasEl.toBlob(function (blob) {
      if (!blob) return;
      const dataURL = S.canvasEl.toDataURL('image/jpeg', 0.92);
      // Evento per il tuo OCR
      dispatch('camera:snapshot', { blob, dataURL, width: w, height: h, time: Date.now() });
      debug('snapshot');
    }, 'image/jpeg', 0.92);
  }

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail }));
  }

  function debug(msg) {
    if (window.debugTools) console.info('[camera]', msg);
  }

  function bindOnce() {
    if (S.inited) return;
    S.inited = true;

    document.addEventListener('click', function (e) {
      const b1 = e.target.closest('button');
      if (!b1) return;
      const label = (b1.textContent || '').trim().toLowerCase();

      if (label === 'apri fotocamera') {
        e.preventDefault();
        openCamera();
      } else if (label === 'chiudi camera') {
        e.preventDefault();
        closeCamera();
      } else if (label.startsWith('scatta')) {
        e.preventDefault();
        snapshot();
      }
    });

    // safety: chiudi stream quando si lascia la pagina
    window.addEventListener('pagehide', closeCamera);
    window.addEventListener('beforeunload', closeCamera);
  }

  // Esponi API opzionale
  window.cameraV2 = {
    open: openCamera,
    close: closeCamera,
    snapshot
  };

  // integra diagnostica
  if (window.debugTools) {
    const prev = window.getAppState;
    window.getAppState = function () {
      const extra = prev ? prev() : {};
      return {
        ...extra,
        camera: {
          active: !!S.stream,
          video: !!S.videoEl,
          tracks: S.stream ? S.stream.getTracks().map(t => ({ kind: t.kind, readyState: t.readyState })) : []
        }
      };
    };
  }

  // avvio
  bindOnce();
})();
