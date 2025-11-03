// Parser Cucchiaio d'Argento – JSON-LD first, DOM fallback
import * as cheerio from 'cheerio';

export function siteId() {
  return 'cucchiaio';
}

export function match(url) {
  try {
    const u = new URL(url);
    return /cucchiaio\.it$/.test(u.hostname);
  } catch {
    return false;
  }
}

function cleanText(s) {
  return s?.replace(/\s+/g, ' ').trim() || '';
}

function uniq(a) {
  return Array.from(new Set(a.filter(Boolean)));
}

function normalizeRecipe(r, url) {
  const id = r.id || r['@id'] || url;
  const out = {
    id: String(id),
    title: cleanText(r.name || r.headline),
    image: Array.isArray(r.image) ? r.image[0] : r.image || '',
    servings: Number(r.recipeYield && String(r.recipeYield).match(/\d+/)?.[0]) || 0,
    prepTime: 0,
    cookTime: 0,
    totalTime: 0,
    difficulty: cleanText(r.keywords || ''),
    category: [],
    tags: [],
    ingredients: (r.recipeIngredient || []).map(cleanText).filter(Boolean),
    steps: [],
    sourceUrl: url,
    youtubeId: ''
  };

  // tempi ISO8601 PTxxM
  const isoToMin = t => {
    if (!t) return 0;
    const m = /PT(?:(\d+)H)?(?:(\d+)M)?/i.exec(t);
    if (!m) return 0;
    const h = Number(m[1] || 0);
    const min = Number(m[2] || 0);
    return h * 60 + min;
  };
  out.prepTime = isoToMin(r.prepTime);
  out.cookTime = isoToMin(r.cookTime);
  out.totalTime = isoToMin(r.totalTime);

  // steps
  const howTo = [];
  const maybeGraph = r.recipeInstructions || r.step || [];
  if (Array.isArray(maybeGraph)) {
    for (const s of maybeGraph) {
      if (typeof s === 'string') howTo.push(cleanText(s));
      else if (s && typeof s === 'object') {
        if (s.text) howTo.push(cleanText(s.text));
        else if (s.itemListElement && Array.isArray(s.itemListElement)) {
          for (const el of s.itemListElement) {
            if (el && el.text) howTo.push(cleanText(el.text));
          }
        }
      }
    }
  }
  out.steps = howTo.filter(Boolean);

  // categorie e tag
  const cats = [];
  if (r.recipeCategory) cats.push(...(Array.isArray(r.recipeCategory) ? r.recipeCategory : [r.recipeCategory]));
  if (r.recipeCuisine) cats.push(...(Array.isArray(r.recipeCuisine) ? r.recipeCuisine : [r.recipeCuisine]));
  out.category = uniq(cats.map(cleanText));
  out.tags = uniq(
    []
      .concat(out.category)
      .concat((r.keywords || '').split(',').map(cleanText))
      .filter(Boolean)
  );

  return out;
}

function parseJsonLd($, url) {
  const blocks = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const txt = $(el).text();
    if (!txt) return;
    try {
      const data = JSON.parse(txt);
      blocks.push(data);
    } catch {
      // ignore bad JSON
    }
  });

  // cerca @type Recipe in qualsiasi grafo
  const collect = [];
  for (const b of blocks) {
    const arr = Array.isArray(b) ? b : [b];
    for (const node of arr) {
      if (!node) continue;
      if (node['@type'] === 'Recipe') collect.push(node);
      if (node['@graph'] && Array.isArray(node['@graph'])) {
        for (const g of node['@graph']) {
          if (g && g['@type'] === 'Recipe') collect.push(g);
        }
      }
    }
  }
  if (collect.length === 0) return null;
  return normalizeRecipe(collect[0], url);
}

function parseDom($, url) {
  const title = cleanText($('h1').first().text()) || cleanText($('meta[property="og:title"]').attr('content'));
  const image = $('meta[property="og:image"]').attr('content') || $('figure img').first().attr('src') || '';

  const ingredients = [];
  $('ul,ol')
    .filter((_, el) => /ingredient/i.test($(el).attr('class') || '') || /ingredient/i.test($(el).attr('id') || ''))
    .find('li')
    .each((_, li) => ingredients.push(cleanText($(li).text())));

  if (ingredients.length === 0) {
    // fallback aggressivo
    $('li').each((_, li) => {
      const t = cleanText($(li).text());
      if (/^\d/.test(t) && t.length < 60) ingredients.push(t);
    });
  }

  const steps = [];
  $('ol,ul')
    .filter((_, el) => /preparazione|istruzione|step/i.test($(el).attr('class') || '') || /preparazione|istruzione|step/i.test($(el).attr('id') || ''))
    .find('li')
    .each((_, li) => steps.push(cleanText($(li).text())));

  return {
    id: url,
    title,
    image,
    servings: 0,
    prepTime: 0,
    cookTime: 0,
    totalTime: 0,
    difficulty: '',
    category: [],
    tags: [],
    ingredients: uniq(ingredients).slice(0, 60),
    steps: uniq(steps).slice(0, 40),
    sourceUrl: url,
    youtubeId: ''
  };
}

export function parse(html, url) {
  const $ = cheerio.load(html);
  const byLd = parseJsonLd($, url);
  if (byLd && byLd.title && byLd.ingredients?.length) return byLd;

  const byDom = parseDom($, url);
  if (byDom.title && byDom.ingredients.length) return byDom;

  throw new Error('PARSE_ERROR');
}
