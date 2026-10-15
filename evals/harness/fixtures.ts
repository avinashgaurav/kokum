import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INGREDIENT_INDEX } from '../../app/src/data/ingredients';
import { RECIPES } from '../../app/src/data/recipes';
import { suggest } from '../../app/src/engine/suggest';
import type { Household, PantryItem, Suggestion } from '../../app/src/engine/types';

export const NOW = Date.parse('2026-10-15T18:00:00Z');
const DAY = 86_400_000;
export const DS = resolve(import.meta.dir, '..', 'datasets');

export function loadRerank() {
  return JSON.parse(readFileSync(resolve(DS, 'rerank.json'), 'utf8'));
}

export function buildState(ds: any, st: any): { household: Household; pantry: Map<string, PantryItem>; suggestions: Suggestion[] } {
  const household = ds.household as Household;
  const pantry = new Map<string, PantryItem>();
  const lines = [...(st.baseStaples === false ? [] : ds.base), ...st.pantry];
  for (const [id, q, storage, days] of lines) {
    const ing = INGREDIENT_INDEX.get(id);
    if (!ing) throw new Error(`fixture uses unknown ingredient ${id}`);
    pantry.set(id, { ingredientId: id, quantity: q, unit: ing.unit, storage, lastConfirmedAt: NOW - days * DAY });
  }
  // Same call the Today screen makes for a pull: limit 8, every state kept.
  const suggestions = suggest(
    { recipes: RECIPES, pantry, ingredients: INGREDIENT_INDEX, household, cookLog: [], now: NOW },
    { kind: 'pull', limit: 8 },
  );
  return { household, pantry, suggestions };
}
