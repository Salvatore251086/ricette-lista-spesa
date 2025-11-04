// script/sitemap_to_index.mjs
import fs from "node:fs/promises";

const URLS_FILE = "assets/json/urls_last.json";
const INDEX_FILE = "assets/json/recipes-index.jsonl";

const urls = JSON.parse(await fs.readFile(URLS_FILE, "utf8"));
const out = [];
for (const u of urls) {
  const txt = await fetchText(u);
  for (const loc of extractLocs(txt)) {
    if (/\/\/www\.cucchiaio\.it\/ricetta\//i.test(loc)) out.push(loc);
  }
}
await fs.writeFile(INDEX_FILE, out.map(u => JSON.stringify({url:u})).join("\n") + "\n");
console.log(JSON.stringify({ts:new Date().toISOString(), sitemaps:urls.length, recipes:out.length}));

async function fetchText(u){
  const r = await fetch(u, {headers:{"user-agent":"RLS-Crawler/1.1 (+github)"}});
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${u}`);
  return await r.text();
}
function extractLocs(xml){
  const locs = [];
  const re = /<loc>([\s\S]*?)<\/loc>/gi;
  let m; while((m = re.exec(xml))!==null){ locs.push(m[1].trim()); }
  return locs;
}
