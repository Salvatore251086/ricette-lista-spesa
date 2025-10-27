// Fotocamera v3, permessi, stop tracce affidabile, drag&drop immagine
(function(){
  const S = { stream: null, videoEl: null, canvas: null, inited: false }

  function qBtn(text){
    const xp = "//button[normalize-space(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'))='"+text+"']"
    return document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || null
  }

  async function checkPermission(){
    try{
      if (!navigator.permissions || !navigator.mediaDevices) return 'unknown'
      const p = await navigator.permissions.query({ name: 'camera' })
      return p && p.state || 'unknown'
    }catch(_){ return 'unknown' }
  }

  function ensureNodes(){
    if (S.videoEl && S.canvas) return
    let host = qBtn('apri fotocamera')
    host = host && host.closest('div') || document.body

    let frame = host.querySelector('.rls-camera-frame')
    if (!frame){
      frame = document.createElement('div')
      frame.className = 'rls-camera-frame'
      frame.style.position = 'relative'
      frame.style.width = '100%'
      frame.style.background = '#000'
      frame.style.aspectRatio = '16/9'
      frame.style.overflow = 'hidden'
      host.appendChild(frame)
    }

    if (!S.videoEl){
      S.videoEl = document.createElement('video')
      S.videoEl.playsInline = true
      S.videoEl.autoplay = true
      S.videoEl.muted = true
      S.videoEl.style.width = '100%'
      S.videoEl.style.height = '100%'
      S.videoEl.style.objectFit = 'cover'
      frame.appendChild(S.videoEl)
    }

    if (!S.canvas){
      S.canvas = document.createElement('canvas')
      S.canvas.style.display = 'none'
      frame.appendChild(S.canvas)
    }

    // drag&drop immagine
    frame.addEventListener('dragover', function(e){ e.preventDefault() })
    frame.addEventListener('drop', function(e){
      e.preventDefault()
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
      if (f && f.type.indexOf('image') === 0){
        const r = new FileReader()
        r.onload = function(){
          const dataURL = r.result
          fetch(dataURL)
            .then(res => res.blob())
            .then(blob => dispatchSnapshot(blob, dataURL))
        }
        r.readAsDataURL(f)
      }
    })
  }

  async function openCamera(){
    try{
      await closeCamera()
      ensureNodes()
      const perm = await checkPermission()
      if (perm === 'denied'){
        alert('Accesso alla fotocamera negato. Concedi il permesso dalle impostazioni del browser')
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
      S.stream = stream
      S.videoEl.srcObject = stream

      await Promise.race([
        new Promise(res => S.videoEl.onloadedmetadata = res),
        new Promise((_, rej) => setTimeout(function(){ rej(new Error('timeout-start')) }, 3000))
      ])
      S.videoEl.play().catch(function(){})

      toggleButtons(true)
      if (window.debugTools) console.info('[camera] open')
    }catch(e){
      if (window.debugTools) console.warn('[camera] error', e && e.message)
      alert('Fotocamera non disponibile. Usa Carica foto')
      document.dispatchEvent(new CustomEvent('camera:error', { detail: { error: String(e) } }))
    }
  }

  function snapshot(){
    if (!S.videoEl) return
    const w = S.videoEl.videoWidth || 1280
    const h = S.videoEl.videoHeight || 720
    S.canvas.width = w
    S.canvas.height = h
    const ctx = S.canvas.getContext('2d')
    ctx.drawImage(S.videoEl, 0, 0, w, h)
    S.canvas.toBlob(function(blob){
      if (!blob) return
      const dataURL = S.canvas.toDataURL('image/jpeg', 0.92)
      dispatchSnapshot(blob, dataURL)
    }, 'image/jpeg', 0.92)
  }

  function dispatchSnapshot(blob, dataURL){
    document.dispatchEvent(new CustomEvent('camera:snapshot', { detail: { blob: blob, dataURL: dataURL, time: Date.now() } }))
  }

  async function closeCamera(){
    try{
      if (S.stream){
        S.stream.getTracks().forEach(function(t){ try{ t.stop() }catch(_){}})
      }
    }catch(_){}
    if (S.videoEl) S.videoEl.srcObject = null
    S.stream = null
    toggleButtons(false)
    document.dispatchEvent(new CustomEvent('camera:closed'))
  }

  function toggleButtons(open){
    const bOpen = qBtn('apri fotocamera')
    const bShot = qBtn('scatta & ocr') || qBtn('scatta')
    const bClose = qBtn('chiudi camera')
    if (bOpen) bOpen.disabled = open
    if (bShot) bShot.disabled = !open
    if (bClose) bClose.disabled = !open
  }

  function bindOnce(){
    if (S.inited) return
    S.inited = true
    document.addEventListener('click', function(e){
      const b = e.target.closest('button')
      if (!b) return
      const label = (b.textContent || '').trim().toLowerCase()
      if (label === 'apri fotocamera'){ e.preventDefault(), openCamera() }
      else if (label === 'chiudi camera'){ e.preventDefault(), closeCamera() }
      else if (label.indexOf('scatta') === 0){ e.preventDefault(), snapshot() }
    })
    window.addEventListener('pagehide', closeCamera)
    window.addEventListener('beforeunload', closeCamera)
  }

  window.cameraV3 = { open: openCamera, close: closeCamera, snapshot: snapshot }
  bindOnce()
})()
