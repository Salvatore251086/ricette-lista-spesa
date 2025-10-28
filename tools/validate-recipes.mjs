#!/usr/bin/env node
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("Missing file path");
  process.exit(1);
}

const raw = fs.readFileSync(file, "utf8").trim();

function fail(msg) {
  console.error("❌ " + msg);
  process.exit(1);
}

if (!raw.startsWith("[") || !raw.endsWith("]")) {
  fail("recipes-it.json must be a JSON array");
}

let data;
try {
  data = JSON.parse(raw);
} catch (e) {
  fail("Invalid JSON: " + e.message);
}

if (!Array.isArray(data) || data.length === 0) {
  fail("Array empty or invalid");
}

const requiredString = (o, k) => typeof o[k] === "string" && o[k].trim().length > 0;
const isYouTubeId = v => typeof v === "string" && /^[A-Za-z0-9_-]{6,}$/.test(v);

let ok = true;
data.forEach((r, i) => {
  if (!requiredString(r, "id")) { ok = false; console.error(`row ${i}: missing id`); }
  if (!requiredString(r, "title")) { ok = false; console.error(`row ${i}: missing title`); }
  if (!Array.isArray(r.tags)) { ok = false; console.error(`row ${i}: tags must be array`); }

  // Evita doppi campi video
  const dup = ["video", "youtubeId", "ytId"].filter(k => k in r);
  if (dup.length > 1) {
    ok = false;
    console.error(`row ${i}: remove duplicates of video fields, keep only "youtubeId"`);
  }

  // Se presente, youtubeId deve sembrare valido
  if (r.youtubeId && !isYouTubeId(r.youtubeId)) {
    ok = false;
    console.error(`row ${i}: youtubeId looks invalid`);
  }
});

if (!ok) fail("Validation failed");
console.log("✅ recipes-it.json OK");
