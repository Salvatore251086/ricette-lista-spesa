// Merge JSONL -> recipes-it.json con dedup e backup
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const AJSON = p => path.join(ROOT, '..', 'assets', 'json', p);

const TMP = AJSON('recipes-it.tmp.jsonl');
const OUT = AJSON('recipes-it.json');
const MERGE_LAST = AJSON('merge_last.json');

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs
    .readFileSync(file, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(l => JSON.parse(l));
}

function backup(file) {
  if (!fs.existsSync(file)) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '');
  const dir = path.dirname(file);
  const base = path.basename(file, '.json');
  const out = path.join(dir, `${base}.backup.${stamp}.json`);
  fs.copyFileSync(file, out);
}

function normalizeTitle(t) {
  return String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function main() {
  const tsStart = new Date().toISOString();
  const incoming = readJsonl(TMP);

  const current = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { recipes: [] };
  const byTitle = new Map(current.recipes.map(r => [normalizeTitle(r.title), r]));

  let added = 0;
  for (const r of incoming) {
    const key = normalizeTitle(r.title);
    if (!key) continue;
    if (byTitle.has(key)) continue;
    current.recipes.push(r);
    byTitle.set(key, r);
    added += 1;
  }

  if (added > 0) backup(OUT);
  fs.writeFileSync(OUT, JSON.stringify(current, null, 2));
  const report = { ts: tsStart, added, total: current.recipes.length };
  fs.writeFileSync(MERGE_LAST, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
}

main();
