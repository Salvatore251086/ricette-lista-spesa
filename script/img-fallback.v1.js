// Fallback automatico per immagini mancanti
(function(){
  var DATA_URI = 'data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22160%22 height=%2290%22 viewBox=%220 0 160 90%22><rect width=%22160%22 height=%2290%22 fill=%22%23000%22/><text x=%2280%22 y=%2250%22 font-size=%2212%22 text-anchor=%22middle%22 fill=%22%23fff%22>nessuna immagine</text></svg>';

  function patch(img){
    if (!img || img.__patched) return;
    img.__patched = true;
    img.addEventListener('error', function(){
      if (img.src === DATA_URI) return;
      img.src = DATA_URI;
    }, { once: true });
  }

  document.addEventListener('error', function(e){
    if (e.target && e.target.tagName === 'IMG') patch(e.target);
  }, true);

  document.querySelectorAll('img').forEach(patch);
})();
