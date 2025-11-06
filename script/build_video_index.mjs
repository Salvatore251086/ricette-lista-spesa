// script/build_video_index.mjs
import fs from "fs";

const src = "assets/json/recipes-it.json";
const dest = "assets/json/video_index.resolved.json";
const LIMIT = 300; // cambia se vuoi più o meno ricette

function normalizeTitle(s) {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

const data = JSON.parse(fs.readFileSync(src, "utf8"));
const recipes = Array.isArray(data.recipes) ? data.recipes : data;
const subset = recipes.slice(0, LIMIT);

const out = subset.map(r => ({
  title: normalizeTitle(r.title || r.name || ""),
  url: r.sourceUrl || r.url || "",
  image: r.image || "",
  youtubeId: "",
  channelTitle: "",
  confidence: 0
}));

fs.writeFileSync(dest, JSON.stringify(out, null, 2), "utf8");
console.log(`✅ Creato ${dest} con ${out.length} ricette normalizzate`);
