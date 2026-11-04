import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INGREDIENT_INDEX } from '../../app/src/data/ingredients';
import { RECIPES } from '../../app/src/data/recipes';
import { suggest } from '../../app/src/engine/suggest';
import type { Household, PantryItem, Suggestion } from '../../app/src/engine/types';

export const NOW = Date.parse('2026-10-15T18:00:00Z');
const DAY = 86_400_000;
export const DS = resolve(import.meta.dir, '..', 'datasets');

/**
 * Which test set to run. 'tuned' is the first set (parse.json, rerank.json), which the
 * app's fixes were written against. 'new' (EVAL_SET=new) is new-cases.json, never used
 * for tuning; its answer key lives in the same file.
 */
export const SET: 'tuned' | 'new' = process.env.EVAL_SET === 'new' ? 'new' : 'tuned';
export const NEW_FILE = resolve(DS, 'new-cases.json');
const readJson = (f: string) => JSON.parse(readFileSync(f, 'utf8'));

export function loadRerank() {
  return SET === 'new' ? readJson(NEW_FILE).rerank : readJson(resolve(DS, 'rerank.json'));
}

export function loadParse(): { items: any[] } {
  return SET === 'new' ? readJson(NEW_FILE).parse : readJson(resolve(DS, 'parse.json'));
}

/** Engine expectations frozen before any model call. */
export function loadFrozen(): any[] {
  return SET === 'new' ? readJson(NEW_FILE).answerKey.rerank : readJson(resolve(DS, 'rerank.expected.json'));
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
