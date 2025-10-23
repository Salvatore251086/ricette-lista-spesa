#!/usr/bin/env node
// Importa ricette da una lista di URL (Giallo Zafferano & simili) estraendo JSON-LD.
// Uso: node script/import-recipes.mjs urls.txt 30  (max 30 URL)  -> stampa JSON su stdout
// Debug: salva in .cache/debug/ {slug}.html, {slug}-jsonld.json, {slug}-parsed.json, {slug}.log

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const INPUT = process.argv[2] || "urls.txt";
const LIMIT = Number(process.argv[3] || 30);

const DEBUG_DIR = path.join(process.cwd(), ".cache", "debug");
fs.mkdirSync(DEBUG_DIR, { recursive: true });

function slugify(u){
  try {
    const { pathname } = new URL(u.trim());
    return pathname.replace(/(^\/+|\/+$)/g,"").replace(/[^\w\-]+/g,"-").slice(0,120) || "root";
  } catch { return "invalid"; }
}

async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, { tries=3, timeout=15000 } = {}){
  let lastErr;
  for (let i=1; i<=tries; i++){
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
        }
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      return html;
    } catch (e){
      lastErr = e;
      await sleep(500 * i);
    }
  }
  throw lastErr;
}

function findJsonLdBlocks(html){
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    // GZ a volte mette //commenti dentro il JSON
    const cleaned = raw
      .replace(/^\s*\/\/.*$/mg, "")
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");
    try {
      const parsed = JSON.parse(cleaned);
      blocks.push(parsed);
    } catch (e) {
      // lascio anche il grezzo per debug
      blocks.push({ __invalidJson: true, raw });
    }
  }
  return blocks;
}

function* walk(obj){
  if (!obj || typeof obj !== "object") return;
  yield obj;
  if (Array.isArray(obj)){
    for (const x of obj) yield* walk(x);
  } else {
    for (const k of Object.keys(obj)) yield* walk(obj[k]);
  }
}

function asArray(x){ return Array.isArray(x) ? x : (x ? [x] : []); }

function normalizeRecipe(r){
  // prende un oggetto schema Recipe e lo normalizza nei nostri campi
  const getText = v => {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(getText).filter(Boolean).join(" ");
    if (typeof v === "object" && v.text) return getText(v.text);
    return "";
  };

  const image =
    (typeof r.image === "string" && r.image) ||
    (Array.isArray(r.image) && r.image.find(s => typeof s === "string")) ||
    (r.image && r.image.url) || undefined;

  const instructions = asArray(r.recipeInstructions)
    .map(step => {
      if (!step) return null;
      if (typeof step === "string") return step;
      if (step.text) return getText(step.text);
      if (step.name && step.text) return `${step.name}: ${getText(step.text)}`;
      return getText(step);
    })
    .filter(Boolean);

  const video =
    r.video?.contentUrl ||
    r.video?.embedUrl ||
    (typeof r.video === "string" ? r.video : undefined);

  return {
    source: "scraped",
    url: r.mainEntityOfPage || r.url || undefined,
    title: r.name || "",
    description: getText(r.description) || "",
    image,
    ingredients: asArray(r.recipeIngredient).map(getText).filter(Boolean),
    instructions,
    totalTime: r.totalTime || r.totaltime || undefined,
    cookTime: r.cookTime || undefined,
    prepTime: r.prepTime || undefined,
    yield: r.recipeYield || undefined,
    category: asArray(r.recipeCategory).map(getText).filter(Boolean),
    cuisine: asArray(r.recipeCuisine).map(getText).filter(Boolean),
    keywords: asArray(r.keywords).map(getText).filter(Boolean),
    rating: r.aggregateRating?.ratingValue || undefined,
    video,
  };
}

function looksValid(rec){
  return !!(rec.title && rec.ingredients?.length >= 2 && rec.instructions?.length >= 1);
}

async function processUrl(u){
  const s = slugify(u);
  const dbg = msg => fs.appendFileSync(path.join(DEBUG_DIR, `${s}.log`), msg + "\n");

  try {
    const html = await fetchWithRetry(u);
    fs.writeFileSync(path.join(DEBUG_DIR, `${s}.html`), html, "utf8");
    dbg(`[INFO] Scaricato HTML (${html.length} bytes)`);

    const blocks = findJsonLdBlocks(html);
    fs.writeFileSync(path.join(DEBUG_DIR, `${s}-jsonld.json`), JSON.stringify(blocks, null, 2));

    let recipes = [];
    for (const b of blocks){
      if (b && b.__invalidJson){
        dbg(`[WARN] Blocco JSON-LD non parse-abile, salvato raw`);
        continue;
      }
      // Scova oggetti Recipe in profondità (anche @graph/array)
      for (const node of walk(b)){
        const t = node?.["@type"];
        if (!t) continue;
        const list = Array.isArray(t) ? t.map(x => String(x).toLowerCase()) : [String(t).toLowerCase()];
        if (list.includes("recipe")){
          const rec = normalizeRecipe(node);
          if (!rec.url) rec.url = u;
          if (looksValid(rec)) {
            recipes.push(rec);
          } else {
            dbg(`[SKIP] Recipe trovata ma incompleta (title:${!!rec.title} ingr:${rec.ingredients?.length||0} steps:${rec.instructions?.length||0})`);
          }
        }
      }
    }

    // De-duplica per titolo
    const seen = new Set();
    recipes = recipes.filter(r => {
      const k = (r.title || "").trim().toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    fs.writeFileSync(path.join(DEBUG_DIR, `${s}-parsed.json`), JSON.stringify(recipes, null, 2));

    if (recipes.length === 0) dbg(`[RESULT] Nessuna Recipe valida trovata`);
    else dbg(`[RESULT] Recipe valide: ${recipes.length}`);

    return { ok: true, url: u, recipes };
  } catch (e){
    dbg(`[ERROR] ${e?.message || e}`);
    return { ok: false, url: u, recipes: [] };
  }
}

function loadUrls(){
  if (!fs.existsSync(INPUT)) return [];
  const raw = fs.readFileSync(INPUT, "utf8");
  return raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
}

(async () => {
  const urls = loadUrls().slice(0, LIMIT);
  const out = [];
  const used = [];

  for (let i=0; i<urls.length; i++){
    const u = urls[i];
    // piccola pausa fra richieste (meno sospetto)
    if (i>0) await sleep(300);
    const res = await processUrl(u);
    if (res.recipes.length){
      out.push(...res.recipes);
      used.push(u);
    }
  }

  // Salva URLs effettivamente usate (per “Clean urls.txt” nel workflow)
  if (used.length){
    fs.mkdirSync(path.join(process.cwd(), ".cache"), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), ".cache", "used_urls.txt"), used.join("\n"));
  }

  // Output finale su stdout
  process.stdout.write(JSON.stringify(out, null, 2));
})();
