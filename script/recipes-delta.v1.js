// Badge delta ricette e mini changelog giornaliero
(function(){
  const KEY = 'rls:recipes:baseline:yyyy-mm-dd'
  const LIST_KEY = 'rls:recipes:list:today'

  function todayKey(){
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth()+1).padStart(2,'0')
    const dd = String(d.getDate()).padStart(2,'0')
    return KEY.replace('yyyy', y).replace('mm', m).replace('dd', dd)
  }

  function readCurrentList(){
    // prova varie fonti
    if (Array.isArray(window.__recipes)) return window.__recipes.map(r => r.id || r.title || '').filter(Boolean)
    const cards = document.querySelectorAll('[data-recipe-id]')
    return Array.prototype.map.call(cards, function(c){ return c.getAttribute('data-recipe-id') }).filter(Boolean)
  }

  function ensureBadge(){
    const btn = findAggiornaDatiButton()
    if (!btn) return null
    let b = btn.parentElement.querySelector('.rls-delta-badge')
    if (!b){
      b = document.createElement('span')
      b.className = 'rls-delta-badge'
      b.textContent = '0'
      b.style.marginLeft = '8px'
      b.style.background = '#0a84ff'
      b.style.color = '#fff'
      b.style.fontSize = '11px'
      b.style.padding = '2px 6px'
      b.style.borderRadius = '999px'
      b.style.display = 'none'
      btn.parentElement.appendChild(b)
    }
    return b
  }

  function findAggiornaDatiButton(){
    const xp = "//button[normalize-space(translate(., 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'))='aggiorna dati']"
    return document.evaluate(xp, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue || null
  }

  function showChangelog(newOnes){
    if (!newOnes.length) return
    let box = document.getElementById('rls-changelog-today')
    if (!box){
      box = document.createElement('div')
      box.id = 'rls-changelog-today'
      box.style.margin = '8px 0'
      box.style.fontSize = '12px'
      box.style.color = '#333'
      const btn = findAggiornaDatiButton()
      if (btn && btn.parentElement) btn.parentElement.appendChild(box)
      else document.body.appendChild(box)
    }
    box.innerHTML = 'Nuove ricette oggi: '+ newOnes.length + ' · ' + newOnes.slice(0,5).join(', ')
  }

  function computeDelta(){
    const key = todayKey()
    const baseline = JSON.parse(localStorage.getItem(key) || '[]')
    const current = readCurrentList()
    const setBase = new Set(baseline)
    const newOnes = current.filter(id => !setBase.has(id))
    localStorage.setItem(LIST_KEY, JSON.stringify(current))
    const badge = ensureBadge()
    if (badge){
      if (newOnes.length > 0){
        badge.textContent = String(newOnes.length)
        badge.style.display = ''
      } else {
        badge.style.display = 'none'
      }
    }
    showChangelog(newOnes.map(String))
  }

  function ensureBaselineAtMidnight(){
    const key = todayKey()
    if (!localStorage.getItem(key)){
      const list = readCurrentList()
      localStorage.clear()  // pulizia leggera dei vecchi key rls:recipes:* se vuoi mantenerli rimuovi questa riga
      localStorage.setItem(key, JSON.stringify(list))
      localStorage.setItem(LIST_KEY, JSON.stringify(list))
    }
  }

  function bind(){
    const btn = findAggiornaDatiButton()
    if (btn && !btn.__boundDelta){
      btn.__boundDelta = true
      btn.addEventListener('click', function(){
        setTimeout(computeDelta, 300)
      })
    }
  }

  document.addEventListener('DOMContentLoaded', function(){
    ensureBaselineAtMidnight()
    bind()
    setTimeout(computeDelta, 500)
  })
})()
