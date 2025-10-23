// script/discover-gz.mjs
// Node 20, ESM. Scansiona alcune pagine "indice" di GialloZafferano,
// estrae link a ricette *.html, filtra quelli già presenti in assets/json/recipes-it.json,
// e scrive le nuove URL in urls.txt (append), oltre a salvare anche new_urls.txt per debugging.
//
// Note: il crawler è "gentile": rate-limit, retries, user-agent e filtro dominio.

import fs from "node:fs/promises";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";

const UA =
  "Mozilla/5.0 (compatible; RicetteBot/1.0; +https://github.com/Salvatore251086/ricette-lista-spesa)";

const ROOT = process.cwd();
const DATASET = path.join(ROOT, "assets/json/recipes-it.json");
const URLS_TXT = path.join(ROOT, "urls.txt");
const NEW_URLS_TXT = path.join(ROOT, "new_urls.txt");

// Pagine-seme "sicure" (categorie/paginazioni popolari)
const SEEDS = [
  "https://www.giallozafferano.it/ricette-cat/Primi-piatti/",
  "https://www.giallozafferano.it/ricette-cat/Secondi-piatti/",
  "https://www.giallozafferano.it/ricette-cat/Dolci-e-dessert/",
  "https://www.giallozafferano.it/ricette-cat/Antipasti/",
  "https://www.giallozafferano.it/ricette-cat/Contorni/",
  // qualche paginazione (limitata) per varietà
  "https://www.giallozafferano.it/ricette-cat/Primi-piatti/?page=2",
  "https://www.giallozafferano.it/ricette-cat/Secondi-piatti/?page=2",
  "https://www.giallozafferano.it/ricette-cat/Dolci-e-dessert/?page=2",
];

const MAX_NEW = Number(process.env.MAX_NEW || 30);
const TIMEOUT_MS = 15000;

async function fetchText(url) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const res = await fetch(url, {
        headers: { "user-agent": UA, accept: "text/html, */*;q=0.8" },
        signal: controller.signal,
      });
      clearTimeout(t);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === 3) throw err;
      await sleep(500 * attempt);
    }
  }
}

function extractRecipeLinks(html) {
  // Link a “ricette.giallozafferano.it/...*.html”
  const re =
    /https?:\/\/ricette\.giallozafferano\.it\/[A-Za-z0-9\-._~%]+\.html/gi;
  const out = new Set();
  let m;
  while ((m = re.exec(html))) out.add(m[0]);
  return [...out];
}

async function loadKnownUrls() {
  try {
    const txt = await fs.readFile(DATASET, "utf8");
    const data = JSON.parse(txt);
    const known = new Set();
    for (const r of data) {
      if (r?.url) known.add(r.url);
      else if (r?.link) known.add(r.link);
    }
    return known;
  } catch {
    return new Set(); // se non esiste ancora, nessun filtro
  }
}

async function ensureFile(file) {
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, "");
  }
}

async function main() {
  console.log("🔎 Discover GZ | MAX_NEW =", MAX_NEW);
  await ensureFile(URLS_TXT);

  const known = await loadKnownUrls();
  console.log("Dataset già noto:", known.size, "ricette");

  const found = new Set();
  for (const seed of SEEDS) {
    try {
      console.log("Fetch:", seed);
      const html = await fetchText(seed);
      const links = extractRecipeLinks(html);
      console.log("  Link trovati:", links.length);
      for (const u of links) found.add(u);
      await sleep(400 + Math.random() * 400); // rate limiting gentile
    } catch (err) {
      console.warn("  ⚠️  errore seed:", seed, err.message);
    }
  }

  // Filtra solo link "/Ricetta-Qualcosa.html" (ricette, non blog/altro)
  const onlyRecipes = [...found].filter((u) =>
    /^https?:\/\/ricette\.giallozafferano\.it\/[^/]+\.html$/i.test(u),
  );

  // Esclude quelle già nel dataset
  const newOnes = onlyRecipes.filter((u) => !known.has(u));

  // Applica limite per run
  const batch = newOnes.slice(0, MAX_NEW);

  console.log("Totale link scoperti:", found.size);
  console.log("Ricette plausibili (solo *.html):", onlyRecipes.length);
  console.log("Nuove (non presenti nel dataset):", newOnes.length);
  console.log("Batch usato (limit):", batch.length);

  // Scrive file di appoggio con TUTTE le nuove
  await fs.writeFile(NEW_URLS_TXT, batch.join("\n") + (batch.length ? "\n" : ""));

  // Appende a urls.txt per l'import
  if (batch.length) {
    const prev = await fs.readFile(URLS_TXT, "utf8");
    const prevSet = new Set(
      prev
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    );

    let appended = 0;
    let text = "";
    for (const u of batch) {
      if (!prevSet.has(u)) {
        text += u + "\n";
        appended++;
      }
    }
    if (appended) await fs.appendFile(URLS_TXT, text);
    console.log(`✅ Aggiunte a urls.txt: ${appended}`);
  } else {
    console.log("ℹ️ Nessuna nuova URL da aggiungere.");
  }

  // Piccola “prova visiva” nei log
  console.log("— riepilogo —");
  console.log("known:", known.size);
  console.log("found:", found.size);
  console.log("newOnes:", newOnes.length);
  console.log("batch:", Math.min(newOnes.length, MAX_NEW));
}

main().catch((e) => {
  console.error("❌ discover-gz errore:", e);
  process.exit(1);
});
