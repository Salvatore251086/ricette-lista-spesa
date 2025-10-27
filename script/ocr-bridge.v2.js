// Bridge OCR v2, debounce e stato busy
(function(){
  var SELECTORS = { ingredientsTextarea: 'textarea, [data-ingredients-textarea]' }
  var debounceMs = 600
  var timer = 0
  var busy = false

  document.addEventListener('camera:snapshot', function(e){
    const d = e.detail || {}
    const blob = d.blob
    const dataURL = d.dataURL
    preview(dataURL)
    if (typeof window.onCameraSnapshot === 'function'){
      try{ window.onCameraSnapshot(d) }catch(_){}
    }
    if (typeof window.ocrProcess !== 'function') return
    if (busy) return
    clearTimeout(timer)
    timer = setTimeout(function(){ runOCR(blob, dataURL) }, debounceMs)
  })

  async function runOCR(blob, dataURL){
    try{
      busy = true
      setBusy(true)
      let text = ''
      try{ text = await window.ocrProcess(blob) }catch(_){ text = await window.ocrProcess(dataURL) }
      if (text) applyToTextarea(text)
    }catch(_){
      toast('Errore OCR')
    }finally{
      busy = false
      setBusy(false)
    }
  }

  function applyToTextarea(text){
    var area = document.querySelector(SELECTORS.ingredientsTextarea)
    if (!area) return
    var sep = area.value && area.value.trim() ? '\n' : ''
    area.value = area.value + sep + text.trim()
    area.dispatchEvent(new Event('input', { bubbles: true }))
  }

  function preview(dataURL){
    try{
      var frame = document.querySelector('.rls-camera-frame')
      if (!frame) return
      var img = frame.querySelector('#rls-camera-preview')
      if (!img){
        img = document.createElement('img')
        img.id = 'rls-camera-preview'
        img.alt = 'Anteprima scatto'
        img.style.position = 'absolute'
        img.style.inset = '0'
        img.style.width = '100%'
        img.style.height = '100%'
        img.style.objectFit = 'cover'
        frame.appendChild(img)
      }
      img.src = dataURL
    }catch(_){}
  }

  function setBusy(on){
    var b = document.body
    if (!b) return
    if (on) b.setAttribute('data-ocr-busy', '1')
    else b.removeAttribute('data-ocr-busy')
  }

  function toast(msg){
    try{
      var t = document.createElement('div')
      t.textContent = msg
      t.style.position = 'fixed'
      t.style.zIndex = 2147483647
      t.style.left = '50%'
      t.style.top = '10px'
      t.style.transform = 'translateX(-50%)'
      t.style.padding = '8px 12px'
      t.style.background = 'rgba(0,0,0,0.8)'
      t.style.color = '#fff'
      t.style.fontSize = '12px'
      t.style.borderRadius = '8px'
      t.style.pointerEvents = 'none'
      document.body.appendChild(t)
      setTimeout(function(){ t.remove() }, 1200)
    }catch(_){}
  }
})()
