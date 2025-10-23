// --- dipendenze standard (lascia le tue) ---
import fs from 'node:fs/promises';
import path from 'node:path';
import fetch from 'node-fetch'; // se già ce l’hai, non duplicare

const API_KEY = process.env.YT_API_KEY || '';

/**
 * Controlla url YouTube valido (watch, youtu.be, shorts).
 */
function isValidYouTubeUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (!['youtube.com', 'youtu.be', 'music.youtube.com'].includes(host)) return false;
    // watch?v=..., youtu.be/..., shorts/...
    if (u.searchParams.get('v')) return true;
    if (u.pathname.split('/').filter(Boolean).length >= 1) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Cerca un video su YouTube (fallback) usando titolo + "ricetta".
 * Ritorna una URL "watch?v=ID" o null.
 */
async function findYouTubeVideo(query) {
  if (!API_KEY) return null;
  const q = `${query} ricetta`;
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('q', q);
  url.searchParams.set('type', 'video');
  url.searchParams.set('maxResults', '1');
  url.searchParams.set('videoEmbeddable', 'true');
  url.searchParams.set('key', API_KEY);

  const res = await fetch(url.toString());
  if (!res.ok) {
    console.error('[YouTube API] HTTP', res.status, await res.text());
    return null;
  }
  const json = await res.json();
  const item = json?.items?.[0];
  const id = item?.id?.videoId;
  if (!id) return null;
  return `https://www.youtube.com/watch?v=${id}`;
}

/**
 * Normalizza/arricchisce una ricetta: se manca il video, tenta fallback.
 */
async function enrichRecipe(r) {
  const out = { ...r };
  if (!isValidYouTubeUrl(out.video)) {
    // costruisci una query robusta: titolo o titolo + autore/sito se disponibile
    const baseQ = out.title || out.id || 'ricetta';
    try {
      const v = await findYouTubeVideo(baseQ);
      if (v) out.video = v;
    } catch (e) {
      console.error('[YT Fallback] errore per', baseQ, e);
    }
  }
  return out;
}

// ------------------------------------------------------------
// Nel ciclo di import/merge, PRIMA di scrivere nel JSON finale:
//   - arricchisci ogni ricetta con enrichRecipe()
//   - esempio semplice:

async function processBatch(recipes) {
  const enriched = [];
  for (const r of recipes) {
    enriched.push(await enrichRecipe(r));
  }
  return enriched;
}

// …poi continua con la tua logica (validazione/merge/scrittura new_recipes.json)
