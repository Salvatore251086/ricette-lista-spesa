// tools/sync-sheet.js
// Legge il CSV da SHEET_CSV_URL, mappa le colonne in modo robusto, salva assets/json/recipes-it.json

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_URL = process.env.SHEET_CSV_URL;
if (!CSV_URL) {
  console.error("Manca SHEET_CSV_URL");
  process.exit(1);
}

// CSV minimale, no dipendenze. Gestisce virgole in campi quotati e CRLF.
function parseCSV(text) {
  const rows = [];
  let cur = [];
  let cell = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const n = text[i + 1];
    if (q) {
      if (c === '"' && n === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        q = false;
      } else {
        cell += c;
      }
    } else {
      if (c === '"') q = true;
      else if (c === ",") {
        cur.push(cell);
        cell = "";
      } else if (c === "\n") {
        cur.push(cell);
        rows.push(cur);
        cur = [];
        cell = "";
      } else if (c === "\r") {
        // ignora
      } else {
        cell += c;
      }
    }
  }
  // ultima cella
  if (cell.length || cur.length) {
    cur.push(cell);
    rows.push(cur);
  }
  return rows;
}

const norm = s =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

function splitTags(v) {
  if (!v) return [];
  return String(v)
    .split(/[,;|/]+/)
    .map(s => s.trim())
    .filter(Boolean);
}

function ytIdFromAny(v) {
  const s = String(v || "");
  const m = s.match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : s.length === 11 ? s : "";
}

// Trova indice colonna per uno dei nomi attesi
function pickIndex(headers, candidates) {
  const H = headers.map(h => norm(h));
  for (const c of candidates) {
    const i = H.indexOf(norm(c));
    if (i !== -1) return i;
  }
  // match parziale
  for (let i = 0; i < H.length; i++) {
    if (candidates.some(c => H[i].includes(norm(c)))) return i;
  }
  return -1;
}

async function main() {
  console.log("Scarico CSV...");
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) {
    console.error("HTTP", res.status);
    process.exit(1);
  }
  const csv = await res.text();
  const rows = parseCSV(csv).filter(r => r.some(x => String(x || "").trim().length));
  if (rows.length < 2) {
    console.error("CSV senza righe utili");
    process.exit(1);
  }
  const headers = rows[0];
  const data = rows.slice(1);

  // Mappature robuste
  const idx = {
    title: pickIndex(headers, ["title", "titolo", "nome", "ricetta", "name", "label"]),
    url: pickIndex(headers, ["url", "link", "pagina", "source", "href"]),
    image: pickIndex(headers, ["image", "immagine", "img", "foto"]),
    time: pickIndex(headers, ["time", "tempo", "min", "minutes"]),
    servings: pickIndex(headers, ["servings", "porzioni", "dosi", "dose"]),
    tags: pickIndex(headers, ["tags", "categorie", "category", "tipologia"]),
    tag1: pickIndex(headers, ["tag1"]),
    tag2: pickIndex(headers, ["tag2"]),
    tag3: pickIndex(headers, ["tag3"]),
    yt: pickIndex(headers, ["youtubeid", "youtube id", "ytid", "video", "youtube", "video_url"])
  };

  const out = [];
  for (const r of data) {
    const title = idx.title >= 0 ? r[idx.title] : "";
    const url = idx.url >= 0 ? r[idx.url] : "";
    const image = idx.image >= 0 ? r[idx.image] : "";
    const timeRaw = idx.time >= 0 ? r[idx.time] : "";
    const servings = idx.servings >= 0 ? r[idx.servings] : "";
    const tagsCombined =
      (idx.tags >= 0 ? r[idx.tags] : "") ||
      [idx.tag1, idx.tag2, idx.tag3]
        .filter(i => i >= 0)
        .map(i => r[i])
        .filter(Boolean)
        .join(", ");
    const ytRaw = idx.yt >= 0 ? r[idx.yt] : "";

    const rec = {
      title: String(title || "").trim(),
      url: String(url || "").trim(),
      image: String(image || "").trim() || "assets/icons/icon-512.png",
      time:
        String(timeRaw || "")
          .replace(/[^\d]/g, "")
          .trim() || null,
      servings: String(servings || "").trim() || null,
      tags: splitTags(tagsCombined),
      youtubeId: ytIdFromAny(ytRaw)
    };

    // scarta righe vuote reali
    const hasSomething =
      rec.title || rec.url || rec.youtubeId || rec.tags.length || rec.image !== "assets/icons/icon-512.png";
    if (hasSomething) out.push(rec);
  }

  const dist = path.join(__dirname, "..", "assets", "json", "recipes-it.json");
  fs.mkdirSync(path.dirname(dist), { recursive: true });
  fs.writeFileSync(dist, JSON.stringify(out, null, 2), "utf8");
  console.log("Aggiornato", dist, "con", out.length, "ricette");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
