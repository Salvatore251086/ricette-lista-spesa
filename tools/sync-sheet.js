// tools/sync-sheet.js
// Scarica CSV dal secret SHEET_CSV_URL, valida youtubeId, riempie image da thumbnail, salva JSON solido.

import fs from "node:fs/promises";
import path from "node:path";

const SHEET_CSV_URL = process.env.SHEET_CSV_URL;
if (!SHEET_CSV_URL) {
  console.error("Manca SHEET_CSV_URL");
  process.exit(1);
}

// CSV parser semplice con campi quotati
function parseCSV(text){
  const rows=[]; let cur=[]; let cell=""; let q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(q){
      if(c === '"' && n === '"'){ cell+='"'; i++; }
      else if(c === '"'){ q=false; }
      else { cell+=c; }
    }else{
      if(c === '"') q=true;
      else if(c === ','){ cur.push(cell); cell=""; }
      else if(c === '\n'){ cur.push(cell); rows.push(cur); cur=[]; cell=""; }
      else if(c !== '\r'){ cell+=c; }
    }
  }
  if(cell.length || cur.length){ cur.push(cell); rows.push(cur); }
  return rows;
}

const norm = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();

function pickIndex(headers, names){
  const H = headers.map(h => norm(h));
  for(const name of names){
    const i = H.indexOf(norm(name));
    if(i !== -1) return i;
  }
  for(let i=0;i<H.length;i++){
    if(names.some(n => H[i].includes(norm(n)))) return i;
  }
  return -1;
}

function splitTags(v){
  return String(v||"").split(/[,;|/]+/).map(s=>s.trim()).filter(Boolean);
}

function extractYtId(v){
  const s = String(v||"").trim();
  const m = s.match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
  if(m) return m[1];
  return /^[A-Za-z0-9_-]{11}$/.test(s) ? s : "";
}

async function headOk(url){
  try{
    const res = await fetch(url, { method:"HEAD", redirect:"follow" });
    return res.ok;
  }catch{ return false; }
}

async function oembedOk(id){
  try{
    const u = "https://www.youtube.com/oembed?format=json&url=" + encodeURIComponent("https://www.youtube.com/watch?v="+id);
    const res = await fetch(u, { redirect:"follow" });
    return res.ok;
  }catch{ return false; }
}

async function validateYoutubeId(id){
  if(!id) return "";
  // 1. oEmbed
  if(await oembedOk(id)) return id;
  // 2. thumbnail HEAD
  if(await headOk("https://i.ytimg.com/vi/"+id+"/hqdefault.jpg")) return id;
  return "";
}

async function main(){
  console.log("Scarico CSV da:", SHEET_CSV_URL);
  let res = await fetch(SHEET_CSV_URL, { redirect:"follow" });
  if(!res.ok){
    console.error("HTTP", res.status);
    process.exit(1);
  }
  let csv = await res.text();

  // Separa con ;? Normalizza in virgole se serve
  const headerLine = csv.split(/\r?\n/)[0] || "";
  if((headerLine.match(/;/g)||[]).length > (headerLine.match(/,/g)||[]).length){
    csv = csv.replace(/;/g, ",");
  }

  const rows = parseCSV(csv).filter(r => r.some(x => String(x||"").trim().length));
  if(rows.length < 2){
    console.error("CSV senza righe utili");
    process.exit(1);
  }
  const headers = rows[0];
  const data = rows.slice(1);

  const idx = {
    title:    pickIndex(headers, ["title","titolo","nome","ricetta","name","label"]),
    url:      pickIndex(headers, ["url","link","pagina","source","href"]),
    image:    pickIndex(headers, ["image","immagine","img","foto"]),
    time:     pickIndex(headers, ["time","tempo","min","minutes"]),
    servings: pickIndex(headers, ["servings","porzioni","dose","dosi"]),
    tags:     pickIndex(headers, ["tags","categorie","category","tipologia"]),
    yt:       pickIndex(headers, ["youtubeid","youtube id","ytid","video","youtube","video_url"]),
    ingr:     pickIndex(headers, ["ingredients","ingredienti"]),
    steps:    pickIndex(headers, ["steps","istruzioni","passi"])
  };

  const out = [];
  const invalid = [];

  for(const r of data){
    const title = idx.title>=0 ? r[idx.title] : "";
    const url   = idx.url>=0 ? r[idx.url] : "";
    const image = idx.image>=0 ? r[idx.image] : "";
    const time  = idx.time>=0 ? r[idx.time] : "";
    const servings = idx.servings>=0 ? r[idx.servings] : "";
    const tags  = idx.tags>=0 ? r[idx.tags] : "";
    const ytRaw = idx.yt>=0 ? r[idx.yt] : "";
    const ingredients = idx.ingr>=0 ? r[idx.ingr] : "";
    const steps = idx.steps>=0 ? r[idx.steps] : "";

    let youtubeId = extractYtId(ytRaw);
    youtubeId = await validateYoutubeId(youtubeId);

    const imgFinal = String(image||"").trim() || (youtubeId ? `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg` : "assets/icons/icon-512.png");

    const timeNum = String(time||"").replace(/[^\d]/g,"");
    const servingsNum = String(servings||"").replace(/[^\d]/g,"");

    const rec = {
      title: String(title||"").trim() || "Senza titolo",
      url: String(url||"").trim(),
      image: imgFinal,
      time: timeNum ? Number(timeNum) : null,
      servings: servingsNum ? Number(servingsNum) : null,
      tags: splitTags(tags),
      youtubeId,
      ingredients: String(ingredients||"").trim(),
      steps: String(steps||"").trim()
    };

    const hasCore = rec.title || rec.url || rec.youtubeId || rec.tags.length;
    if(hasCore) out.push(rec);
    if(ytRaw && !youtubeId) invalid.push(rec.title || "(senza titolo)");
  }

  if(out.length < 3){
    console.error("VALIDAZIONE: meno di 3 ricette. Interrompo.");
    process.exit(2);
  }

  const OUT_FILE = path.join("assets","json","recipes-it.json");
  const tmp = OUT_FILE + ".tmp";
  await fs.mkdir(path.dirname(OUT_FILE), { recursive:true });
  await fs.writeFile(tmp, JSON.stringify(out, null, 2) + "\n", "utf8");
  await fs.rename(tmp, OUT_FILE);

  if(invalid.length){
    console.warn("youtubeId invalidi scartati:", invalid.length);
    console.warn(invalid.slice(0,20));
  }
  console.log("Scritto", OUT_FILE, "ricette:", out.length);
}

main().catch(e => { console.error(e); process.exit(1); });
