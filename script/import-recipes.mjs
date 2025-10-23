// script/import-recipes.mjs
// Importa ricette da un elenco di URL (uno per riga) estraendo JSON-LD recipe.
// Uso: node script/import-recipes.mjs urls.txt 30 > new_recipes.json

import fs from "node:fs/promises";

// Piccolo helper per dormire un po' tra le richieste (educazione verso il sito)
const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// User-Agent civile
const UA = process.env.USER_AGENT || "Mozilla/5.0 (compatible; RicetteBot/1.0; +https://github.com/)";

// Limita le richieste in parallelo per non esagerare
const CONCURRENCY = 4;

async function fetchText(url) {
  const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "text/html,*/*;q=0.8" } });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

function pickRecipeFromLdJson(html) {
  // Prende tutti i <script type="application/ld+json"> e cerca @type Recipe
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => m[1].trim());
  for (const raw of scripts) {
    // Alcuni blocchi contengono più JSON concatenati o commenti HTML; proviamo a normalizzare
    const candidates = [];
    try {
      // Primo tentativo: parse diretto
      candidates.push(JSON.parse(raw));
    } catch {
      // Secondo tentativo: estrai JSON “plausibili” all’interno
      const parts = raw
        .replace(/<!--[\s\S]*?-->/g, "")
        .split(/\n(?=\s*[{[])/g) // spezza quando ricominciano oggetti/array
        .map(s => s.trim())
        .filter(Boolean);
      for (const p of parts) {
        try { candidates.push(JSON.parse(p)); } catch {}
      }
    }
    for (const c of candidates) {
      const all = Array.isArray(c) ? c : [c];
      for (const obj of all) {
        // In certi siti il JSON-LD è annidato dentro @graph
        const graph = obj && obj["@graph"] ? obj["@graph"] : all;
        for (const item of Array.isArray(graph) ? graph : [graph]) {
          const types = []
            .concat(item?.["@type"] ?? [])
            .map(t => (typeof t === "string" ? t.toLowerCase() : String(t).toLowerCase()));
          if (types.includes("recipe")) {
            return item;
          }
        }
      }
    }
  }
  return null;
}

function toMinutes(isoDuration) {
  // Converte durate tipo "PT35M", "PT1H10M" in minuti
  if (!isoDuration || typeof isoDuration !== "string") return null;
  const mH = isoDuration.match(/(\d+)\s*H/i);
  const mM = isoDuration.match(/(\d+)\s*M/i);
  const h = mH ? parseInt(mH[1], 10) : 0;
  const m = mM ? parseInt(mM[1], 10) : 0;
  const total = h * 60 + m;
  return total || null;
}

function normText(x) {
  return String(x ?? "")
    .replace(/\s+/g, " ")
    .replace(/\u00A0/g, " ")
    .trim();
}

function extractFromRecipeLD(ld, url) {
  if (!ld) return null;

  // Titolo
  const title = normText(ld.name || ld.headline || ld.alternateName);

  // Immagine: può essere stringa o oggetto/array
  let image = null;
  if (typeof ld.image === "string") image = ld.image;
  else if (Array.isArray(ld.image) && ld.image.length) {
    image = typeof ld.image[0] === "string" ? ld.image[0] : (ld.image[0]?.url || null);
  } else if (ld.image && typeof ld.image === "object") image = ld.image.url || null;

  // Ingredienti
  let ingredients = [];
  if (Array.isArray(ld.recipeIngredient)) {
    ingredients = ld.recipeIngredient.map(normText).filter(Boolean);
  }

  // Istruzioni: può essere stringa, array di stringhe, array di HowToStep
  let steps = [];
  if (ld.recipeInstructions) {
    if (typeof ld.recipeInstructions === "string") {
      steps = normText(ld.recipeInstructions).split(/(?:\.|\n)\s+/).filter(Boolean);
    } else if (Array.isArray(ld.recipeInstructions)) {
      steps = ld.recipeInstructions
        .map(s =>
          typeof s === "string"
            ? normText(s)
            : normText(s?.text || s?.name))
        .filter(Boolean);
    } else if (typeof ld.recipeInstructions === "object") {
      steps = [normText(ld.recipeInstructions.text || ld.recipeInstructions.name)].filter(Boolean);
    }
  }

  // Tempo & porzioni
  const totalMins =
    toMinutes(ld.totalTime) ??
    (toMinutes(ld.prepTime) ?? 0) + (toMinutes(ld.cookTime) ?? 0) || null;

  // recipeYield può essere “4 porzioni”, “per 6” ecc.
  let servings = null;
  if (ld.recipeYield) {
    const s = Array.isArray(ld.recipeYield) ? ld.recipeYield.join(" ") : String(ld.recipeYield);
    const m = s.match(/(\d+)/);
    if (m) servings = parseInt(m[1], 10);
  }

  // Video: nel JSON-LD spesso è in "video": { "contentUrl": ..., "embedUrl": ... }
  let video = null;
  const v = ld.video;
  if (v) {
    video = v.contentUrl || v.embedUrl || v.url || null;
  }

  // Se ingredienti o titolo mancano, scartiamo (altrimenti importiamo spazzatura)
  if (!title || ingredients.length === 0 || steps.length === 0) return null;

  return {
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
    title,
    time: totalMins ?? undefined,
    servings: servings ?? undefined,
    image: image ?? undefined,
    ingredients: ingredients.map((t) => ({ ref: normText(t) })),
    steps,
    url,
    video: video ?? undefined,
    tags: [],
  };
}

async function importOne(url) {
  try {
    const html = await fetchText(url);
    const ld = pickRecipeFromLdJson(html);
    const rec = extractFromRecipeLD(ld, url);
    if (!rec) return { ok: false, url, reason: "no-recipe-ld-or-missing-fields" };
    return { ok: true, url, recipe: rec };
  } catch (e) {
    return { ok: false, url, reason: e.message || String(e) };
  }
}

async function main() {
  const [, , path = "urls.txt", limitRaw] = process.argv;
  const limit = Number.isFinite(+limitRaw) ? Math.max(1, +limitRaw) : 30;

  const txt = await fs.readFile(path, "utf8");
  const urls = txt
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(s => s && !s.startsWith("#"))
    .slice(0, limit);

  if (urls.length === 0) {
    console.error("Nessuna URL da importare.");
    console.log("[]");
    return;
  }

  const out = [];
  const used = [];

  // Coda con concorrenza bassa
  let i = 0;
  async function worker() {
    while (i < urls.length) {
      const idx = i++;
      const u = urls[idx];
      const res = await importOne(u);
      if (res.ok) {
        out.push(res.recipe);
        used.push(u);
      } else {
        console.error(`[SKIP] ${u} -> ${res.reason}`);
      }
      await sleep(300); // piccola pausa tra chiamate
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker);
  await Promise.all(workers);

  // Salva per lo step "Clean urls.txt"
  if (used.length) {
    await fs.mkdir(".cache", { recursive: true });
    await fs.writeFile(".cache/used_urls.txt", used.join("\n") + "\n", "utf8");
  }

  process.stderr.write(`Importate ${out.length} ricette valide su ${urls.length} URL.\n`);
  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
