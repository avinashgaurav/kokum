import type { Household, Ingredient, PantryItem, Recipe } from './types';
import { adultEquivalents, scaleQuantity } from './scaling';
import { projectedQuantity } from './confidence';

/**
 * Depletion mechanism 1 of 4, and the authoritative one: the user just looked in their
 * kitchen and cooked. Subtract what the dish used, scaled to the household, and reset
 * confidence on everything it touched.
 *
 * Unverified recipes are excluded from depletion math (AGENTS.md). We still log the cook
 * so repetition scoring works; we just refuse to do arithmetic with quantities we have
 * not checked, because a wrong subtraction is worse than no subtraction.
 */
export function applyCook(
  recipe: Recipe,
  pantry: Map<string, PantryItem>,
  ingredients: Map<string, Ingredient>,
  household: Household,
  now: number,
): Map<string, PantryItem> {
  const next = new Map(pantry);
  if (!recipe.verified) return next;

  const ae = adultEquivalents(household);

  for (const ri of recipe.ingredients) {
    const item = next.get(ri.ingredientId);
    const ing = ingredients.get(ri.ingredientId);
    if (!item || !ing) continue;

    const used = scaleQuantity(ri.qtyPer2Adults, ae);
    const before = projectedQuantity(item, ing, household, now);

    next.set(ri.ingredientId, {
      ...item,
      quantity: Math.max(0, before - used),
      // You just handled it, so we believe the new number completely.
      lastConfirmedAt: now,
    });
  }

  return next;
}

/** Manual correction, from a swipe or the weekly check. Always resets confidence. */
export function confirmItem(
  pantry: Map<string, PantryItem>,
  ingredientId: string,
  quantity: number,
  now: number,
): Map<string, PantryItem> {
  const next = new Map(pantry);
  const item = next.get(ingredientId);
  if (!item) return next;
  next.set(ingredientId, { ...item, quantity: Math.max(0, quantity), lastConfirmedAt: now });
  return next;
}

/** Restock, from a parsed bill or manual add. The highest-confidence event there is. */
export function restock(
  pantry: Map<string, PantryItem>,
  lines: { ingredientId: string; quantity: number; unit: PantryItem['unit']; storage?: PantryItem['storage'] }[],
  now: number,
): Map<string, PantryItem> {
  const next = new Map(pantry);
  for (const line of lines) {
    const existing = next.get(line.ingredientId);
    next.set(line.ingredientId, {
      ingredientId: line.ingredientId,
      quantity: (existing?.quantity ?? 0) + line.quantity,
      unit: line.unit,
      storage: line.storage ?? existing?.storage ?? 'counter',
      lastConfirmedAt: now,
    });
  }
  return next;
}
