// Deterministic sentence checks for rerank reasons. Heuristic: word-boundary match of
// dictionary names and aliases (ASCII only). Reported separately from pass/fail.
import { INGREDIENTS } from '../../app/src/data/ingredients';
import { RECIPE_INDEX } from '../../app/src/data/recipes';

const TERMS = INGREDIENTS.flatMap((i) => [i.name, ...i.aliases].filter((a) => /^[\x00-\x7f]+$/.test(a)).map((a) => ({ id: i.id, re: new RegExp(`\\b${a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`) })));

export function mentionedIds(text: string): string[] {
  const t = text.toLowerCase();
  return [...new Set(TERMS.filter((x) => x.re.test(t)).map((x) => x.id))];
}

export function sentenceIssues(entry: { recipeId: string; state: string; reason: string }, pantryIds: string[], missingIds: string[]) {
  const recipe = RECIPE_INDEX.get(entry.recipeId)!;
  const inRecipe = new Set(recipe.ingredients.map((r) => r.ingredientId));
  const out: { kind: string; ingredient: string; reason: string; recipeId: string }[] = [];
  for (const id of mentionedIds(entry.reason)) {
    if (!pantryIds.includes(id) && !missingIds.includes(id)) out.push({ kind: 'mentions-item-not-in-pantry-or-missing-list', ingredient: id, reason: entry.reason, recipeId: entry.recipeId });
    else if (!inRecipe.has(id)) out.push({ kind: 'mentions-item-not-in-this-recipe', ingredient: id, reason: entry.reason, recipeId: entry.recipeId });
  }
  return out;
}
