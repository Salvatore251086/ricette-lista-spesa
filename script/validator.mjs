// script/validator.mjs
const clean = s => (s || '').toString().trim()

export function validateRecipe(r) {
  const errors = []

  const titleOk = !!clean(r.title)
  if (!titleOk) errors.push('title')

  const ingrOk =
    Array.isArray(r.ingredients) &&
    r.ingredients.map(clean).filter(Boolean).length >= 2

  const stepsOk =
    Array.isArray(r.steps) &&
    r.steps.map(clean).filter(Boolean).length >= 2

  // Nuova regola: titolo + (ingredienti OR passi)
  if (!(ingrOk || stepsOk)) errors.push('content')

  return {
    ok: errors.length === 0,
    errors
  }
}
