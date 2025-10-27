<script>
// Debug Tools v1.0 — diagnostica rapida + toggler log
(function () {
  // Config base
  var CONFIG = {
    devTapCount: 5,
    devTapWindowMs: 3000,
    cornerSizePx: 24,
    toastMs: 1500
  };

  // Stato interno
  var state = {
    taps: [],
    lastError: null,
    lastRejection: null,
    level: 'warn' // 'all' | 'warn' | 'silent'
  };

  // Esponi versione se non presente
  if (!window.APP_VERSION) window.APP_VERSION = 'dev';

  // Cattura errori
  window.addEventListener('error', function (e) {
    state.lastError = {
      message: e.message,
      source: e.filename,
      line: e.lineno,
      col: e.colno,
      time: Date.now()
    };
  });
  window.addEventListener('unhandledrejection', function (e) {
    state.lastRejection = {
      reason: e.reason && (e.reason.message || e.reason.toString()),
      time: Date.now()
    };
  });

  // Gating console
  var orig = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug ? console.debug.bind(console) : console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
  };

  function applyConsoleLevel(level) {
    state.level = level;
    var muteAll = level === 'silent';
    var muteInfo = level === 'warn' || muteAll;
    console.log = muteInfo ? function(){ } : orig.log;
    console.info = muteInfo ? function(){ } : orig.info;
    console.debug = muteInfo ? function(){ } : orig.debug;
    console.warn = muteAll ? function(){ } : orig.warn;
    console.error = muteAll ? function(){ } : orig.error;
  }
  // Rispetta flag globale se presente
  if (typeof window.__debug === 'boolean') {
    applyConsoleLevel(window.__debug ? 'all' : 'warn');
  } else {
    applyConsoleLevel('warn');
  }

  // Toast minimale
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
      setTimeout(function(){ t.remove(); }, CONFIG.toastMs);
    } catch(e) { /* no-op */ }
  }

  // Bottone invisibile dev
  function installDevCorner() {
    var b = document.createElement('button');
    b.setAttribute('aria-label', 'dev-corner');
    b.style.position = 'fixed';
    b.style.left = '0';
    b.style.top = '0';
    b.style.width = CONFIG.cornerSizePx + 'px';
    b.style.height = CONFIG.cornerSizePx + 'px';
    b.style.opacity = '0.02';
    b.style.border = '0';
    b.style.background = 'transparent';
    b.style.zIndex = 2147483646;
    b.style.cursor = 'default';
    b.addEventListener('click', function () {
      var now = Date.now();
      state.taps = state.taps.filter(function(t){ return now - t < CONFIG.devTapWindowMs; });
      state.taps.push(now);
      if (state.taps.length >= CONFIG.devTapCount) {
        state.taps = [];
        toast('DEV MODE');
        dump(true);
      }
    });
    document.addEventListener('keydown', function(e){
      if (e.ctrlKey && e.shiftKey && e.key === 'D') {
        toast('DEV MODE');
        dump(true);
      }
    });
    document.body.appendChild(b);
  }

  // Raccolta diagnostica
  function getSWStatus() {
    if (!('serviceWorker' in navigator)) return { supported: false };
    var reg = navigator.serviceWorker && navigator.serviceWorker.controller ? 'controlled' : 'uncontrolled';
    return { supported: true, status: reg };
  }

  function getActiveChips() {
    if (typeof window.getActiveChips === 'function') return window.getActiveChips();
    var nodes = document.querySelectorAll('.chip.is-active, [data-chip][aria-pressed="true"]');
    return Array.prototype.map.call(nodes, function(n){ return n.getAttribute('data-chip') || n.textContent.trim(); });
  }

  function getRecipeList() {
    if (typeof window.getRecipeList === 'function') return window.getRecipeList();
    if (Array.isArray(window.__recipes)) return window.__recipes.map(function(r){ return r.id || r.title || 'item'; });
    var cards = document.querySelectorAll('[data-recipe-id]');
    return Array.prototype.map.call(cards, function(c){ return c.getAttribute('data-recipe-id'); });
  }

  function getAppState() {
    var extra = {};
    if (typeof window.getAppState === 'function') {
      try { extra = window.getAppState() || {}; } catch(e){ extra = { getAppStateError: String(e) }; }
    }
    return {
      version: window.APP_VERSION,
      sw: getSWStatus(),
      url: location.href,
      chips: getActiveChips(),
      recipes: getRecipeList(),
      lastError: state.lastError,
      lastRejection: state.lastRejection,
      time: new Date().toISOString(),
      extra: extra
    };
  }

  // Dump
  function dump(verbose) {
    var s = getAppState();
    if (verbose) {
      orig.group ? orig.group('Diagnostica Rapida') : orig.log('Diagnostica Rapida');
      orig.table ? orig.table(s) : orig.log(s);
      orig.groupEnd && orig.groupEnd();
    } else {
      orig.log(s);
    }
    return s;
  }

  // API pubblica
  var api = {
    setLevel: function(level){
      if (level !== 'all' && level !== 'warn' && level !== 'silent') level = 'warn';
      applyConsoleLevel(level);
      window.__debug = (level === 'all');
      return state.level;
    },
    dump: dump,
    selfTest: function(){
      var before = state.level;
      api.setLevel('all');
      console.log('[selfTest] log attivo');
      console.info('[selfTest] info attivo');
      console.debug('[selfTest] debug attivo');
      console.warn('[selfTest] warn attivo');
      console.error('[selfTest] error attivo');
      api.setLevel(before);
      return 'OK';
    }
  };

  // Esporta
  window.debugTools = api;

  // Avvio
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installDevCorner);
  } else {
    installDevCorner();
  }
})();
</script>
