// tools/sync-sheet.js
import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const CSV_URL = process.env.SHEET_CSV_URL;
if (!CSV_URL) {
  console.error("Manca SHEET_CSV_URL");
  process.exit(1);
}

const OUT_FILE = path.join(__dirname, "..", "assets", "json", "recipes-it.json");

// Split “primo, veloce, onnivoro” → ["primo","veloce","onnivoro"]
function splitTags(s) {
  if (!s) return [];
  return String(s)
    .split(/[,;|/]+/).map(x => x.trim()).filter(Boolean);
}

// Estrai ID YouTube da id o da URL
function getYtId(v) {
  const s = String(v || "").trim();
  if (!s) return "";
  // già ID 11 char
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s;
  // estrai da URL
  const m = s.match(/(?:v=|be\/|embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : "";
}

// CSV semplice → array di record
function parseCSV(text) {
  const rows = text.replace(/\r/g, "").split("\n").filter(Boolean);
  const head = rows.shift().split(",").map(h => h.trim().toLowerCase());
  return rows.map(line => {
    const cols = line.split(","); // csv semplice, già pulito
    const r = {};
    head.forEach((h, i) => r[h] = (cols[i] ?? "").trim());
    return r;
  });
}

function mapRow(r) {
  // colonne attese nel CSV: title, url, image, time, servings, tags, youtubeid, ingredients, steps
  const youtubeId = getYtId(r.youtubeid || r.ytid || r.video || r.youtube || "");
  return {
    title:      r.title || "",
    url:        r.url || "",
    image:      r.image || "assets/icons/icon-512.png",
    time:       r.time ? Number(String(r.time).replace(/[^\d]/g, "")) : null,
    servings:   r.servings ? Number(String(r.servings).replace(/[^\d]/g, "")) : null,
    tags:       splitTags(r.tags),
    youtubeId,  // lasciamo “youtubeId” nel JSON
    ingredients: r.ingredients || "",
    steps:       r.steps || ""
  };
}

async function main() {
  console.log("Scarico CSV...");
  const res = await fetch(CSV_URL, { cache: "no-store" });
  if (!res.ok) {
    console.error("HTTP", res.status);
    process.exit(1);
  }
  const txt = await res.text();
  const rows = parseCSV(txt);
  const out  = rows.map(mapRow);

  // Scrivi un array puro
  const json = JSON.stringify(out, null, 2);
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, json, "utf8");
  console.log("Scritto:", OUT_FILE, "items:", out.length);
}

main().catch(e => { console.error(e); process.exit(1); });
