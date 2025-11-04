// script/crawl_recipes.mjs
// Crawler minimal che usa i PARSER e stampa un riepilogo JSON su stdout

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as Cucchiaio from "./parsers/cucchiaio.mjs";

// —————————————— CONFIG ——————————————
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.resolve(__dirname, "..");
const ASSETS = path.resolve(ROOT, "assets", "json");

const INPUT_INDEX = path.join(ASSETS, "recipes-index.jsonl"); // righe con {"url": "..."}
const INPUT_URLS = path.join(ASSETS, "urls_last.json");        // fallback array di sitemap o url
const CACHE_HTML = false;                                      // metti true se vuoi salvare html
// ————————————————————————————————————————

const PARSERS = [Cucchiaio]; // <<< una sola dichiarazione

// entrypoint
(async () => {
  const started = Date.now();

  const urls = await loadSources();
  let ok = 0;
  let skipped = 0;
  let failed = 0;
  const errors = [];

  // cartella cache opzionale
  const cacheDir = path.join(ROOT, ".cache");
  if (CACHE_HTML) await fs.mkdir(cacheDir, { recursive: true });

  for (const url of urls) {
    try {
      const parser = PARSERS.find((p) => p.match(url));
      if (!parser) {
        skipped++;
        continue;
      }

      const html = await fetchHtml(url);
      if (CACHE_HTML) {
        const slug = sanitizeFile(url) + ".html";
        await fs.writeFile(path.join(cacheDir, slug), html);
      }

      const rec = await parser.parse({ url, html, fetchHtml });
      // valida minimo necessario
      if (!rec || !rec.title || !Array.isArray(rec.ingredients) || rec.ingredients.length === 0) {
        failed++;
        errors.push({ url, error: "VALIDATION_MIN_FAIL" });
        continue;
      }

      ok++;
      // qui puoi, se vuoi, accodare le ricette in un file temporaneo
      // in questo setup lasciamo al passo "merge" l’unione finale
      await appendJsonl(path.join(ASSETS, "crawl_last.json"), {
        id: rec.id,
        title: rec.title,
        url: rec.sourceUrl,
        ts: new Date().toISOString()
      });
    } catch (e) {
      failed++;
      errors.push({ url, error: normalizeErr(e) });
    }
  }

  const out = {
    ts: new Date().toISOString(),
    processed: urls.length,
    ok,
    skipped,
    failed,
    cache: { fail_html: 0, fail_json: 0 } // placeholder per compatibilità log
  };

  // stampa riassunto per i log del workflow
  console.log(JSON.stringify(out));

  // scrivi anche un indice minimale, utile al passo "Show index preview"
  await writeJson(path.join(ASSETS, "video_index.json"), out);

  // fine
  if (errors.length) {
    await writeJson(path.join(ASSETS, "crawl_errors.json"), errors);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});

// —————————————— FUNZIONI ——————————————

async function loadSources() {
  // priorità a recipes-index.jsonl se presente e non vuoto
  const urls = [];

  if (await exists(INPUT_INDEX)) {
    const txt = await fs.readFile(INPUT_INDEX, "utf8");
    const lines = txt.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (const line of lines) {
      try {
        const obj = JSON.parse(line);
        if (obj && obj.url) urls.push(obj.url);
      } catch {
        // ignora righe invalide
      }
    }
    if (urls.length > 0) return urls;
  }

  // fallback: urls_last.json con array di url o sitemap
  if (await exists(INPUT_URLS)) {
    const arr = await readJson(INPUT_URLS);
    // tieni solo url http(s). Se sono sitemap, verranno scartate perché i parser non matchano.
    return Array.isArray(arr) ? arr.filter((u) => /^https?:\/\//i.test(u)) : [];
  }

  return [];
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "RLS-Crawler/1.1 (+https://github.com/Salvatore251086/ricette-lista-spesa)"
    }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function writeJson(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2));
}

async function appendJsonl(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(obj) + "\n");
}

async function readJson(file) {
  const txt = await fs.readFile(file, "utf8");
  try {
    return JSON.parse(txt);
  } catch {
    return null;
  }
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function sanitizeFile(s) {
  return s.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase();
}

function normalizeErr(e) {
  const msg = e && e.message ? String(e.message) : String(e);
  // compat con messaggi precedenti
  if (/JSON/i.test(msg)) return "PARSE_ERROR";
  return msg.slice(0, 200);
}
