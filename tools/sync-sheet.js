// tools/sync-sheet.js
// Scarica il CSV pubblicato da Google Sheet, converte in JSON e salva SOLO se valido.

import fs from "node:fs/promises";
import path from "node:path";

const SHEET_CSV_URL = process.env.SHEET_CSV_URL; // <= impostata nel workflow
const OUT_FILE = path.join("assets", "json", "recipes-it.json");

if (!SHEET_CSV_URL) {
  console.error("Manca SHEET_CSV_URL");
  process.exit(1);
}

function csvToRows(csv) {
  // CSV molto semplice: split su newline, poi su virgola (senza gestire quote complesse)
  // Consigliato: se usi campi con virgole/virgolette, passa a papaparse.
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines.shift().split(",").map(h => h.trim());
  return lines.map(line => {
    const cols = line.split(",").map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i] ?? "");
    return obj;
  });
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj[k] != null && String(obj[k]).trim()) return String(obj[k]).trim();
  }
  return "";
}

function extractYtId(v) {
  const s = String(v || "");
  const m = s.match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : (s.length === 11 ? s : "");
}

function toRecipe(row) {
  const title = pick(row, ["title","titolo","name","nome","ricetta"]);
  const url   = pick(row, ["url","link","source","pagina"]);
  const tagsS = pick(row, ["tags","categorie","category","tipologia"]);
  const tags  = tagsS ? tagsS.split(/[,;|/]+/).map(s => s.trim()).filter(Boolean) : [];

  const ytid  = extractYtId(
    pick(row, ["youtubeId","ytid","videoId","video_url","video","youtube"])
  );

  const img   = pick(row, ["image","img","immagine"]) || "assets/icons/icon-512.png";
  const time  = pick(row, ["time","tempo","min","minutes"]);
  const servings = pick(row, ["servings","porzioni","dose"]);

  return {
    title: title || "Senza titolo",
    url,
    tags,
    image: img,
    time: time ? Number(time.replace(/[^\d]/g,"")) || time : null,
    servings: servings || null,
    ytid
  };
}

function validate(recipes) {
  if (!Array.isArray(recipes)) return "Non è un array";
  if (recipes.length < 3) return "Troppo poche ricette (<3)";
  for (const [i,r] of recipes.entries()) {
    if (!r || typeof r !== "object") return `Elemento ${i} non è un oggetto`;
    if (!r.title || typeof r.title !== "string") return `Elemento ${i} senza titolo`;
  }
  return null;
}

async function main() {
  console.log("Scarico CSV…");
  const res = await fetch(SHEET_CSV_URL, { cache: "no-store" });
  if (!res.ok) {
    console.error("HTTP", res.status);
    process.exit(1);
  }
  const csv = await res.text();
  const rows = csvToRows(csv);
  const recipes = rows.map(toRecipe).filter(Boolean);

  const err = validate(recipes);
  if (err) {
    console.error("VALIDAZIONE FALLITA:", err);
    process.exit(2); // fallisce il job -> niente commit
  }

  const json = JSON.stringify(recipes, null, 2) + "\n";
  const tmp = OUT_FILE + ".tmp";

  // scrittura ATOMICA
  await fs.mkdir(path.dirname(OUT_FILE), { recursive: true });
  await fs.writeFile(tmp, json, "utf8");
  await fs.rename(tmp, OUT_FILE);

  console.log(`Aggiornato ${OUT_FILE} con ${recipes.length} ricette ✅`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
