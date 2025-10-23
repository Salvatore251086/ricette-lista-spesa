#!/usr/bin/env node
// Importa ricette da una lista di URL estraendo JSON-LD e, se manca il video,
// prova un fallback con YouTube Data API (titolo + "ricetta").
// Uso: node script/import-recipes.mjs urls.txt 30  -> stampa JSON su stdout.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const INPUT = process.argv[2] || "urls.txt";
const LIMIT = Number(process.argv[3] || 30);

const DEBUG_DIR = path.join(process.cwd(), ".cache", "debug");
fs.mkdirSync(DEBUG_DIR, { recursive: true });

// ---- YouTube config ---------------------------------------------------------
const YT_API_KEY = process.env.YT_API_KEY || "";
const YT_REGION  = "IT";
const YT_LANG    = "it";
const YT_CACHE   = path.join(process.cwd(), ".cache", "yt-map.json");
let ytMap = {};
try { ytMap = JSON.parse(fs.readFileSync(YT_CACHE, "utf8")); } catch { ytMap = {}; }
function saveYtMap(){ try { fs.writeFileSync(YT_CACHE, JSON.stringify(ytMap, null, 2)); } catch {} }
// -----------------------------------------------------------------------------

function slugify(u){
  try {
    const { pathname } = new URL(u.trim());
    return pathname.replace(/(^\/+|\/+$)/g,"").replace(/[^\w\-]+/g,"-").slice(0,120) || "root";
  } catch { return "invalid"; }
}
async function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fetchWithRetry(url, { tries=3, timeout=15000, headers={} } = {}){
  let lastErr;
  for (let i=1; i<=tries; i++){
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeout);
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "it-IT,it;q=0.9,en;q=0.8",
          "Cache-Control": "no-cache",
          ...headers,
        }
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      if ((res.headers.get("content-type") || "").includes("application/json")) {
        return await res.json();
      }
      return await res.text();
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
    const cleaned = raw
      .replace(/^\s*\/\/.*$/mg, "")
      .replace(/,\s*]/g, "]")
      .replace(/,\s*}/g, "}");
    try { blocks.push(JSON.parse(cleaned)); }
    catch { blocks.push({ __invalidJson: true, raw }); }
  }
  return blocks;
}

function* walk(obj){
  if (!obj || typeof obj !== "object") return;
  yield obj;
  if (Array.isArray(obj)) for (const x of obj) yield* walk(x);
  else for (const k of Object.keys(obj)) yield* walk(obj[k]);
}

function asArray(x){ return Array.isArray(x) ? x : (x ? [x] : []); }

function normalizeRecipe(r){
  const text = v => {
    if (!v) return "";
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.map(text).filter(Boolean).join(" ");
    if (typeof v === "object" && v.text) return text(v.text);
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
      if (step.text) return text(step.text);
      if (step.name && step.text) return `${step.name}: ${text(step.text)}`;
      return text(step);
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
    description: text(r.description) || "",
    image,
    ingredients: asArray(r.recipeIngredient).map(text).filter(Boolean),
    instructions,
    totalTime: r.totalTime || r.totaltime || undefined,
    cookTime: r.cookTime || undefined,
    prepTime: r.prepTime || undefined,
    yield: r.recipeYield || undefined,
    category: asArray(r.recipeCategory).map(text).filter(Boolean),
    cuisine: asArray(r.recipeCuisine).map(text).filter(Boolean),
    keywords: asArray(r.keywords).map(text).filter(Boolean),
    rating: r.aggregateRating?.ratingValue || undefined,
    video,
  };
}

function looksValid(rec){
  return !!(rec.title && rec.ingredients?.length >= 2 && rec.instructions?.length >= 1);
}

// ---- YouTube fallback -------------------------------------------------------
async function findYoutubeVideoUrlByTitle(title){
  if (!YT_API_KEY) return null;

  // cache per titolo normalizzato
  const key = title.trim().toLowerCase();
  if (ytMap[key]) return ytMap[key];

  const params = new URLSearchParams({
    key: YT_API_KEY,
    part: "snippet",
    q: `${title} ricetta`,
    type: "video",
    regionCode: YT_REGION,
    relevanceLanguage: YT_LANG,
    maxResults: "5",
    safeSearch: "none",
  });

  try {
    const apiUrl = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
    const data = await fetchWithRetry(apiUrl, { tries: 2, timeout: 12000, headers: { Accept: "application/json" } });

    const items = (data && data.items) ? data.items : [];
    const pick = items.find(i => i?.id?.videoId) || null;
    if (!pick) return null;

    const url = `https://www.youtube.com/watch?v=${pick.id.videoId}`;
    ytMap[key] = url;   // cache
    saveYtMap();
    return url;
  } catch {
    return null;
  }
}
// -----------------------------------------------------------------------------


async function processUrl(u){
  const s = slugify(u);
  const dbgPath = path.join(DEBUG_DIR, `${s}.log`);
  const dbg = msg => fs.appendFileSync(dbgPath, msg + "\n");

  try {
    const html = await fetchWithRetry(u);
    fs.writeFileSync(path.join(DEBUG_DIR, `${s}.html`), html, "utf8");
    dbg(`[INFO] Scaricato HTML (${html.length} bytes)`);

    const blocks = findJsonLdBlocks(html);
    fs.writeFileSync(path.join(DEBUG_DIR, `${s}-jsonld.json`), JSON.stringify(blocks, null, 2));

    let recipes = [];
    for (const b of blocks){
      if (b && b.__invalidJson){ dbg(`[WARN] Blocco JSON-LD non parse-abile`); continue; }
      for (const node of walk(b)){
        const t = node?.["@type"]; if (!t) continue;
        const list = Array.isArray(t) ? t.map(x => String(x).toLowerCase()) : [String(t).toLowerCase()];
        if (list.includes("recipe")){
          const rec = normalizeRecipe(node);
          if (!rec.url) rec.url = u;

          // Fallback YouTube: se manca video, prova via API
          if (!rec.video && rec.title){
            const v = await findYoutubeVideoUrlByTitle(rec.title);
            if (v) { rec.video = v; dbg(`[YTFALLBACK] video trovato per "${rec.title}" -> ${v}`); }
            else   { dbg(`[YTFALLBACK] nessun video per "${rec.title}"`); }
            // piccola pausa per non stressare quota
            await sleep(150);
          }

          if (looksValid(rec)) recipes.push(rec);
          else dbg(`[SKIP] recipe incompleta t:${!!rec.title} ingr:${rec.ingredients?.length||0} steps:${rec.instructions?.length||0}`);
        }
      }
    }

    // de-duplica per titolo
    const seen = new Set();
    recipes = recipes.filter(r => {
      const k = (r.title || "").trim().toLowerCase();
      if (seen.has(k)) return false; seen.add(k); return true;
    });

    fs.writeFileSync(path.join(DEBUG_DIR, `${s}-parsed.json`), JSON.stringify(recipes, null, 2));
    dbg(`[RESULT] ricette valide: ${recipes.length}`);
    return { ok:true, url:u, recipes };
  } catch (e){
    fs.appendFileSync(path.join(DEBUG_DIR, `${s}.log`), `[ERROR] ${e?.message || e}\n`);
    return { ok:false, url:u, recipes:[] };
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
    if (i>0) await sleep(300);
    const u = urls[i];
    const res = await processUrl(u);
    if (res.recipes.length){ out.push(...res.recipes); used.push(u); }
  }

  if (used.length){
    fs.mkdirSync(path.join(process.cwd(), ".cache"), { recursive: true });
    fs.writeFileSync(path.join(process.cwd(), ".cache", "used_urls.txt"), used.join("\n"));
  }

  process.stdout.write(JSON.stringify(out, null, 2));
})();
