// File: script/import-recipes.mjs
// Node 20+. Estrae ricette da una lista di URL e stampa un array JSON su stdout.
// Uso supportato:
//   node script/import-recipes.mjs 30
//   node script/import-recipes.mjs urls.txt 30

import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

// ---------- Argomenti ----------
const pathArg = process.argv[2] || "urls.txt";
const countArg = process.argv[3];

let urlsFile;
let batchSize;

if (/^\d+$/.test(pathArg)) {
  urlsFile = "urls.txt";
  batchSize = parseInt(pathArg, 10);
} else {
  urlsFile = pathArg;
  batchSize = /^\d+$/.test(countArg) ? parseInt(countArg, 10) : 30;
}

// ---------- Util ----------
const normSpace = s => s.replace(/\s+/g, " ").trim();
const toMinutes = iso => {
  // Accetta formati tipo PT45M, PT1H15M, 45 min
  if (!iso) return null;
  const m1 = /^PT(?:(\d+)H)?(?:(\d+)M)?$/i.exec(iso);
  if (m1) {
    const h = parseInt(m1[1] || "0", 10);
    const m = parseInt(m1[2] || "0", 10);
    return h * 60 + m;
  }
  const m2 = /(\d+)\s*min/i.exec(iso);
  if (m2) return parseInt(m2[1], 10);
  return null;
};

const extractJsonLdBlocks = html => {
  const blocks = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim();
    try {
      const parsed = JSON.parse(raw);
      blocks.push(parsed);
    } catch {
      // prova a ripulire JSON non valido con commenti o trailing commas
      try {
        const cleaned = raw
          .replace(/\/\/.*$/gm, "")
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/,\s*}/g, "}")
          .replace(/,\s*]/g, "]");
        blocks.push(JSON.parse(cleaned));
      } catch {
        // ignora
      }
    }
  }
  return blocks;
};

const findRecipeNode = obj => {
  if (!obj) return null;
  const arr = Array.isArray(obj) ? obj : [obj];
  for (const node of arr) {
    if (!node) continue;
    if (typeof node === "object" && node["@type"]) {
      const t = node["@type"];
      if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return node;
    }
    if (node["@graph"]) {
      const found = findRecipeNode(node["@graph"]);
      if (found) return found;
    }
    if (node.mainEntity) {
      const found = findRecipeNode(node.mainEntity);
      if (found) return found;
    }
  }
  return null;
};

const pickTextArray = value => {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map(v => {
        if (!v) return null;
        if (typeof v === "string") return normSpace(v);
        if (typeof v.text === "string") return normSpace(v.text);
        if (typeof v.name === "string") return normSpace(v.name);
        if (typeof v.description === "string") return normSpace(v.description);
        return null;
      })
      .filter(Boolean);
  }
  if (typeof value === "string") return [normSpace(value)];
  return [];
};

const extractYouTubeId = html => {
  // prova embedUrl nel JSON-LD oppure link OG, poi fallback regex nel markup
  // 1) da JSON-LD già passato dall’esterno, qui solo fallback su markup
  const ogMatch =
    html.match(/property=["']og:video["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/property=["']og:video:url["'][^>]*content=["']([^"']+)["']/i);
  const all = [];
  if (ogMatch) all.push(ogMatch[1]);
  const rx =
    /(?:youtube\.com\/(?:embed|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/gi;
  let m;
  while ((m = rx.exec(html))) all.push(m[1]);
  for (const s of all) {
    const idMatch = /([A-Za-z0-9_-]{6,15})$/.exec(s);
    if (idMatch) return idMatch[1];
  }
  return null;
};

const makeId = title =>
  normSpace(title)
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// ---------- Carica URL ----------
const raw = await fs.readFile(urlsFile, "utf8");
const urls = raw
  .split(/\r?\n/)
  .map(s => s.trim())
  .filter(s => s && !s.startsWith("#"))
  .slice(0, batchSize);

// ---------- Fetch e parse ----------
const out = [];

for (const url of urls) {
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
        accept: "text/html,application/xhtml+xml"
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    const blocks = extractJsonLdBlocks(html);
    let recipe = null;
    for (const b of blocks) {
      const r = findRecipeNode(b);
      if (r) {
        recipe = r;
        break;
      }
    }

    if (!recipe) {
      // nessuno schema trovabile, salta con avviso leggero
      continue;
    }

    const title =
      recipe.name ||
      recipe.headline ||
      (typeof recipe["@id"] === "string" ? recipe["@id"] : "") ||
      "Ricetta";

    const image =
      (Array.isArray(recipe.image) ? recipe.image[0] : recipe.image) ||
      null;

    const ingredients = pickTextArray(recipe.recipeIngredient);
    let steps = [];
    if (recipe.recipeInstructions) {
      steps = pickTextArray(
        recipe.recipeInstructions.map(s => {
          if (typeof s === "string") return s;
          if (s && typeof s.text === "string") return s.text;
          if (s && typeof s.name === "string") return s.name;
          if (s && typeof s.itemListElement === "object") {
            return pickTextArray(s.itemListElement).join(" ");
          }
          return "";
        })
      );
    }

    const timeMin =
      toMinutes(recipe.totalTime) ||
      toMinutes(recipe.cookTime) ||
      toMinutes(recipe.prepTime) ||
      null;

    const servings =
      (typeof recipe.recipeYield === "string"
        ? recipe.recipeYield
        : Array.isArray(recipe.recipeYield)
        ? recipe.recipeYield.join(" ")
        : recipe.recipeYield) || null;

    // video da JSON-LD se presente
    let ytId = null;
    if (recipe.video) {
      const v = Array.isArray(recipe.video) ? recipe.video[0] : recipe.video;
      const embed =
        (v && (v.embedUrl || v.contentUrl || v.url)) ||
        null;
      if (embed) {
        const m = /(?:youtube\.com\/(?:embed|watch\?v=)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/i.exec(
          embed
        );
        if (m) ytId = m[1];
      }
    }
    if (!ytId) ytId = extractYouTubeId(html);

    const rec = {
      id: makeId(title),
      title: normSpace(title),
      time: timeMin || undefined,
      servings: servings || undefined,
      tags: [],
      image: image || undefined,
      ingredients,
      steps,
      url,
      video: ytId ? `https://www.youtube.com/watch?v=${ytId}` : undefined
    };

    // ripulisci undefined
    Object.keys(rec).forEach(k => rec[k] === undefined && delete rec[k]);

    out.push(rec);

    // piccola pausa tra richieste
    await delay(150);
  } catch {
    // ignora URL problematico
    continue;
  }
}

// ---------- Output ----------
process.stdout.write(JSON.stringify(out, null, 2));
