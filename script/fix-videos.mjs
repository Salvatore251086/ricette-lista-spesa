// script/fix-videos.mjs
// Ripulisce i video. Se mancano o non sono validi, cerca un sostituto.
// Ordine di ricerca: YouTube Data API v3 (se YT_API_KEY), poi fallback Piped.
// Valida sempre con oEmbed prima di accettare un video.

import fs from "node:fs/promises";
import path from "node:path";

// Node 18+ ha fetch globale. Se usi Node 16, aggiorna a 18+.

const DATA_FILES = [
  "assets/json/recipes-it.json",
  "import/recipes.json" // opzionale
];

const YT_API_KEY = process.env.YT_API_KEY || "";
const REGION = "IT";
const LANG = "it";
const YT_WATCH = "https://www.youtube.com/watch?v=";

// Utility
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function extractYouTubeId(input = "") {
  if (!input) return "";
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;
  try {
    const u = new URL(input);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.slice(1).split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    }
    if (host.endsWith("youtube.com")) {
      if (u.searchParams.has("v")) {
        const id = u.searchParams.get("v") || "";
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
      }
      const parts = u.pathname.split("/").filter(Boolean);
      if ((parts[0] === "shorts" || parts[0] === "embed") && /^[A-Za-z0-9_-]{11}$/.test(parts[1])) {
        return parts[1];
      }
    }
  } catch {}
  return "";
}

async function isEmbeddable(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return false;
  const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(YT_WATCH + id)}&format=json`;
  try {
    const res = await fetch(url, { method: "GET" });
    return res.ok;
  } catch {
    return false;
  }
}

async function searchYouTubeAPI(query) {
  if (!YT_API_KEY) return [];
  const endpoint = new URL("https://www.googleapis.com/youtube/v3/search");
  endpoint.searchParams.set("part", "snippet");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("type", "video");
  endpoint.searchParams.set("maxResults", "5");
  endpoint.searchParams.set("videoEmbeddable", "true");
  endpoint.searchParams.set("order", "relevance");
  endpoint.searchParams.set("relevanceLanguage", LANG);
  endpoint.searchParams.set("regionCode", REGION);
  endpoint.searchParams.set("key", YT_API_KEY);

  try {
    const res = await fetch(endpoint, { method: "GET" });
    if (!res.ok) return [];
    const json = await res.json();
    const ids = (json.items || [])
      .map(it => it?.id?.videoId)
      .filter(v => /^[A-Za-z0-9_-]{11}$/.test(v));
    return ids;
  } catch {
    return [];
  }
}

async function searchPiped(query) {
  // Fallback pubblico. Se un’istanza è giù, puoi cambiarla.
  const endpoint = new URL("https://piped.video/api/v1/search");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("region", REGION);
  endpoint.searchParams.set("hl", LANG);

  try {
    const res = await fetch(endpoint, { method: "GET" });
    if (!res.ok) return [];
    const data = await res.json();
    // data è un array. Filtra solo item di tipo video.
    const ids = (Array.isArray(data) ? data : [])
      .filter(x => (x?.type || "").toLowerCase() === "video")
      .map(x => {
        if (x?.url && x.url.includes("watch?v=")) {
          const id = new URL("https://dummy" + x.url).searchParams.get("v");
          return id;
        }
        if (x?.id) return x.id;
        return "";
      })
      .filter(v => /^[A-Za-z0-9_-]{11}$/.test(v));
    return ids.slice(0, 5);
  } catch {
    return [];
  }
}

async function findFallbackId(title) {
  const q = `${title} ricetta`;
  // 1) API ufficiale
  const apiIds = await searchYouTubeAPI(q);
  for (const id of apiIds) {
    if (await isEmbeddable(id)) return id;
    await sleep(120);
  }
  // 2) Piped
  const pipedIds = await searchPiped(q);
  for (const id of pipedIds) {
    if (await isEmbeddable(id)) return id;
    await sleep(120);
  }
  return "";
}

function normalizeList(list = []) {
  return list.map((r, i) => {
    const id = r.id || `rid-${i}`;
    const title = r.title || "Ricetta";
    const ytId = r.ytId || extractYouTubeId(r.video || "");
    return { ...r, id, title, ytId, video: ytId ? (YT_WATCH + ytId) : (r.video || "") };
  });
}

async function processFile(file) {
  let contents;
  try {
    contents = await fs.readFile(file, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      console.log(`(skip) ${file} non trovato`);
      return;
    }
    throw e;
  }

  let data;
  try {
    data = JSON.parse(contents);
  } catch {
    console.error(`Formato JSON non valido in ${file}`);
    process.exitCode = 1;
    return;
  }

  const list = normalizeList(data);
  let changed = 0;

  for (const r of list) {
    let id = r.ytId || extractYouTubeId(r.video || "");
    let ok = false;

    if (id) {
      ok = await isEmbeddable(id);
      await sleep(100);
    }

    if (!ok) {
      // cerca fallback
      const fallback = await findFallbackId(r.title || "");
      await sleep(100);
      if (fallback) {
        r.ytId = fallback;
        r.video = YT_WATCH + fallback;
        changed++;
      } else {
        if (r.ytId || r.video) changed++;
        r.ytId = "";
        r.video = "";
      }
    } else {
      // normalizza url
      const canon = YT_WATCH + id;
      if (r.video !== canon || r.ytId !== id) {
        r.ytId = id;
        r.video = canon;
        changed++;
      }
    }
  }

  if (changed > 0) {
    await fs.writeFile(file, JSON.stringify(list, null, 2) + "\n", "utf8");
    console.log(`✔ ${file}: aggiornate ${changed} voci video`);
  } else {
    console.log(`• ${file}: nessuna modifica necessaria`);
  }
}

async function main() {
  for (const f of DATA_FILES) {
    const full = path.resolve(f);
    // eslint-disable-next-line no-await-in-loop
    await processFile(full);
  }
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
