const out = document.getElementById('out');
async function run(){
  try{
    const res = await fetch('import/recipes.json', {cache:'no-store'});
    if(!res.ok){ out.textContent = 'Nessun file import/recipes.json (HTTP '+res.status+').'; return; }
    const json = await res.json();
    out.textContent = JSON.stringify(json, null, 2);
  }catch(e){
    out.textContent = 'Errore nel caricamento: '+ e.message;
  }
}
run();
