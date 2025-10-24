// script/fix-videos.mjs
import fs from "node:fs/promises";
import path from "node:path";
import fetch from "node-fetch";

const DATA_FILES = [
  "assets/json/recipes-it.json",
  "import/recipes.json", // opzionale: se non esiste, sarà ignorato
];

const YT_EMBED_ORIGIN = "https://www.youtube.com/watch?v=";

function extractYouTubeId(input = "") {
  if (!input) return "";
  // accetta già un ID "nudo"
  if (/^[A-Za-z0-9_-]{11}$/.test(input)) return input;

  try {
    const url = new URL(input);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      // https://youtu.be/<id>
      const id = url.pathname.slice(1).split("/")[0];
      return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
    }
    if (host.endsWith("youtube.com")) {
      // https://www.youtube.com/watch?v=<id>
      if (url.searchParams.has("v")) {
        const id = url.searchParams.get("v") ?? "";
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : "";
      }
      // https://www.youtube.com/shorts/<id>
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts[0] === "shorts" && /^[A-Za-z0-9_-]{11}$/.test(parts[1])) {
        return parts[1];
      }
      // /embed/<id>
      if (parts[0] === "embed" && /^[A-Za-z0-9_-]{11}$/.test(parts[1])) {
        return parts[1];
      }
    }
  } catch {
    /* not a URL */
  }
  return "";
}

async function ytIdIsValid(id) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return false;
  const oembed = `https://www.youtube.com/oembed?url=${encodeURIComponent(
    YT_EMBED_ORIGIN + id
  )}&format=json`;
  try {
    const res = await fetch(oembed, { method: "GET" });
    return res.ok; // 200 solo se video pubblico/embeddabile
  } catch {
    return false;
  }
}

async function processFile(file) {
  try {
    const full = path.resolve(file);
    const raw = await fs.readFile(full, "utf8");
    const data = JSON.parse(raw);

    let touched = 0;

    for (const r of data) {
      // campi possibili nel tuo dataset: r.video (url), r.ytId (id)
      const candidate = r.ytId || r.video || "";
      const id = extractYouTubeId(candidate);
      if (!id) {
        // prova a vedere se in r.video c'è qualcosa di recuperabile
        if (r.video) {
          const tryId = extractYouTubeId(r.video);
          if (tryId && (await ytIdIsValid(tryId))) {
            r.ytId = tryId;
            r.video = YT_EMBED_ORIGIN + tryId;
            touched++;
          } else {
            r.ytId = "";
            r.video = "";
          }
        } else {
          r.ytId = "";
          r.video = "";
        }
        continue;
      }

      if (await ytIdIsValid(id)) {
        const before = r.ytId || "";
        r.ytId = id;
        r.video = YT_EMBED_ORIGIN + id;
        if (before !== id) touched++;
      } else {
        if (r.ytId || r.video) touched++;
        r.ytId = "";
        r.video = "";
      }
    }

    if (touched > 0) {
      await fs.writeFile(full, JSON.stringify(data, null, 2) + "\n", "utf8");
      console.log(`✔ ${file}: aggiornate ${touched} voci video`);
    } else {
      console.log(`• ${file}: nessuna modifica necessaria`);
    }
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(`(skip) ${file} non trovato`);
      return;
    }
    console.error(`Errore su ${file}:`, err);
    process.exitCode = 1;
  }
}

for (const f of DATA_FILES) {
  // eslint-disable-next-line no-await-in-loop
  await processFile(f);
}
