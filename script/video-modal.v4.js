// Video Modal v4, fallback aggressivo errore 153, monitor postMessage, retry embed
(function(){
  const NS = 'videoModal'
  if (window[NS]) return

  const S = {
    apiLoaded: false,
    player: null,
    frame: null,
    currentId: null,
    timeoutMs: 2500,
    retriedEmbed: false,
    lastError: null,
    bound: false
  }

  function loadYTApiOnce(){
    if (S.apiLoaded) return Promise.resolve()
    return new Promise(res => {
      const t = document.createElement('script')
      t.src = 'https://www.youtube.com/iframe_api'
      t.async = true
      window.onYouTubeIframeAPIReady = function(){ S.apiLoaded = true, res() }
      document.head.appendChild(t)
    })
  }

  function ensureDom(){
    if (document.getElementById('video-modal')) return
    const tpl =
      '<div id="video-modal" class="vmodal hidden" aria-hidden="true">'+
        '<div class="vm-backdrop" data-vm-close></div>'+
        '<div class="vm-dialog" role="dialog" aria-label="Video">'+
          '<button class="vm-close" data-vm-close aria-label="Chiudi">×</button>'+
          '<div class="vm-frame"><div id="vm-player"></div></div>'+
          '<div class="vm-actions"><a id="vm-open" target="_blank" rel="noopener">Apri su YouTube</a></div>'+
        '</div>'+
      '</div>'+
      '<style>'+
        '.vmodal.hidden{display:none} .vmodal{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(0,0,0,.6)}'+
        '.vm-dialog{width:min(920px,90vw);background:#111;color:#fff;border-radius:12px;overflow:hidden;position:relative}'+
        '.vm-frame{position:relative;padding-top:56.25%;background:#000}'+
        '#vm-player{position:absolute;inset:0}'+
        '.vm-close{position:absolute;top:8px;right:12px;font-size:24px;background:transparent;color:#fff;border:0;cursor:pointer}'+
        '.vm-actions{display:flex;justify-content:center;gap:12px;padding:10px 12px} .vm-actions a{color:#0af;text-decoration:underline}'+
        '.vm-backdrop{position:absolute;inset:0}'+
      '</style>'
    const w = document.createElement('div')
    w.innerHTML = tpl
    document.body.appendChild(w)
  }

  function youTubeUrl(id){ return 'https://www.youtube.com/watch?v='+id+'&utm_source=app' }
  function embedUrl(id){
    const o = encodeURIComponent(location.origin || '')
    return 'https://www.youtube.com/embed/'+id+'?autoplay=1&rel=0&modestbranding=1&origin='+o
  }

  function openInNewTabAndClose(id){
    try{ window.open(youTubeUrl(id), '_blank', 'noopener') }catch(_){}
    api.close()
  }

  function setIframeAllow(iframe){
    try{
      iframe.removeAttribute('allowfullscreen')
      iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture')
    }catch(_){}
  }

  function createPlayer(id){
    return new Promise(resolve => {
      const origin = encodeURIComponent(location.origin || '')
      const p = new YT.Player('vm-player', {
        videoId: id,
        playerVars: { autoplay: 1, rel: 0, modestbranding: 1, origin },
        events: {
          onReady(){ resolve(p) },
          onError(ev){
            S.lastError = { code: ev && ev.data, time: Date.now() }
            if (window.debugTools) console.warn('YT onError', S.lastError)
            aggressiveFallback(id)
          }
        }
      })
      setTimeout(function(){
        const iframe = document.querySelector('#vm-player iframe')
        if (iframe) setIframeAllow(iframe)
        S.frame = iframe || null
      }, 0)
    })
  }

  function startGuards(id){
    const guardTimeout = setTimeout(function(){
      try{
        if (!S.player || typeof S.player.getPlayerState !== 'function'){
          if (window.debugTools) console.warn('YT guard no player')
          aggressiveFallback(id)
          return
        }
        const st = S.player.getPlayerState()
        const notActive = st !== 1 && st !== 3
        if (notActive){
          if (window.debugTools) console.warn('YT guard timeout')
          aggressiveFallback(id)
        }
      }catch(_){
        aggressiveFallback(id)
      }
    }, S.timeoutMs)

    const onMsg = function(ev){
      try{
        const d = ev && ev.data
        if (!d) return
        const msg = typeof d === 'string' ? d : JSON.stringify(d)
        if (typeof d === 'object' && d.event === 'onError'){
          if (window.debugTools) console.warn('YT postMessage error', d)
          aggressiveFallback(id)
        } else if (typeof d === 'string' && d.indexOf('onError') !== -1){
          aggressiveFallback(id)
        }
      }catch(_){}
    }
    window.addEventListener('message', onMsg, true)

    return function(){
      clearTimeout(guardTimeout)
      window.removeEventListener('message', onMsg, true)
    }
  }

  function aggressiveFallback(id){
    if (!S.retriedEmbed){
      S.retriedEmbed = true
      if (window.debugTools) console.warn('Retry embed flow')
      try{
        const host = document.getElementById('vm-player')
        host.innerHTML = ''
        const ifr = document.createElement('iframe')
        ifr.src = embedUrl(id)
        ifr.width = '100%'
        ifr.height = '100%'
        ifr.style.position = 'absolute'
        ifr.style.inset = '0'
        ifr.frameBorder = '0'
        setIframeAllow(ifr)
        host.appendChild(ifr)
        S.frame = ifr
        // se ancora blocca, apri nuova scheda dopo breve
        setTimeout(function(){ openInNewTabAndClose(id) }, 1200)
      }catch(_){ openInNewTabAndClose(id) }
      return
    }
    openInNewTabAndClose(id)
  }

  async function open(opts){
    const id = normalizeId(opts)
    if (!id) return
    S.currentId = id
    S.retriedEmbed = false
    ensureDom()
    const modal = document.getElementById('video-modal')
    document.getElementById('vm-open').href = youTubeUrl(id)
    modal.classList.remove('hidden')
    modal.setAttribute('aria-hidden', 'false')

    try{
      await loadYTApiOnce()
      const stopGuards = startGuards(id)
      S.player = null
      S.player = await createPlayer(id)
      stopGuards()
    }catch(_){
      aggressiveFallback(id)
    }
  }

  function close(){
    const modal = document.getElementById('video-modal')
    if (modal){
      modal.classList.add('hidden')
      modal.setAttribute('aria-hidden', 'true')
    }
    try{ if (S.player && S.player.destroy) S.player.destroy() }catch(_){}
    S.player = null
    S.frame = null
    S.currentId = null
  }

  function bindGlobalOnce(){
    if (S.bound) return
    S.bound = true
    document.addEventListener('click', function(e){
      const btn = e.target.closest('[data-video-id],[data-video-url]')
      if (!btn) return
      e.preventDefault()
      open({ id: btn.getAttribute('data-video-id'), url: btn.getAttribute('data-video-url') })
    })
    document.addEventListener('click', function(e){
      if (e.target.matches('[data-vm-close]')) close()
    })
  }

  function normalizeId(params){
    const id = params && params.id
    const url = params && params.url
    if (id) return id
    if (url){
      try{
        const u = new URL(url, location.href)
        if (u.hostname.includes('youtu.be')) return u.pathname.slice(1)
        const v = u.searchParams.get('v')
        if (v) return v
      }catch(_){}
      const m = url.match(/[a-zA-Z0-9_-]{11}/)
      if (m) return m[0]
    }
    return ''
  }

  const api = { open, close }
  window[NS] = api
  bindGlobalOnce()

  if (window.debugTools){
    const prev = window.getAppState
    window.getAppState = function(){
      const extra = prev ? prev() : {}
      return Object.assign({}, extra, { video: { currentId: S.currentId, lastError: S.lastError, retriedEmbed: S.retriedEmbed } })
    }
  }
})()
