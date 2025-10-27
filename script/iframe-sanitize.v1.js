// Rimuove l'avviso "Allow attribute will take precedence over allowfullscreen"
(function(){
  function fix(){
    document.querySelectorAll('iframe').forEach(function(f){
      try{
        if (f.hasAttribute('allow')){
          f.removeAttribute('allowfullscreen')
          if (!/fullscreen/.test(f.getAttribute('allow')||'')){
            f.setAttribute('allow', (f.getAttribute('allow')||'') + '; fullscreen')
          }
        }
      }catch(_){}
    })
  }
  document.addEventListener('DOMContentLoaded', fix)
  setTimeout(fix, 500)
})()
