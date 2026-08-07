import type {
  DishAssessment,
  Household,
  Ingredient,
  MissingItem,
  PantryItem,
  Recipe,
} from './types';
import { COOK_THRESHOLD, confidenceOf, projectedQuantity } from './confidence';
import { adultEquivalents, scaleQuantity } from './scaling';

/**
 * THE SACRED FUNCTION. See AGENTS.md.
 *
 * Computes a dish's state from the pantry. This is the only place a state is produced.
 * The language model may reorder and describe what comes out of here; it may never
 * change a state or edit a missing-item list.
 *
 * Precedence is deliberate: 'need-items' beats 'check-first'. If something is definitely
 * absent, that is the more actionable truth, and telling the user to go confirm the paneer
 * when they are also out of onions would waste the tap.
 */
export function assessDish(
  recipe: Recipe,
  pantry: Map<string, PantryItem>,
  ingredients: Map<string, Ingredient>,
  household: Household,
  now: number,
): DishAssessment {
  const ae = adultEquivalents(household);
  const missing: MissingItem[] = [];
  const uncertain: string[] = [];
  const optionalMissing: string[] = [];

  for (const ri of recipe.ingredients) {
    const ing = ingredients.get(ri.ingredientId);
    const item = pantry.get(ri.ingredientId);
    const needed = scaleQuantity(ri.qtyPer2Adults, ae);

    // An ingredient we know nothing about is treated as absent, never as present.
    const have = ing && item ? projectedQuantity(item, ing, household, now) : 0;

    if (!ri.core) {
      if (have < needed) optionalMissing.push(ri.ingredientId);
      continue;
    }

    if (have < needed) {
      missing.push({ ingredientId: ri.ingredientId, needed, have, unit: ri.unit });
      continue;
    }

    // Present in sufficient quantity, but do we still believe it?
    const conf = ing && item ? confidenceOf(item, ing, now) : 0;
    if (conf < COOK_THRESHOLD) uncertain.push(ri.ingredientId);
  }

  const state =
    missing.length > 0 ? 'need-items' : uncertain.length > 0 ? 'check-first' : 'cook-now';

  return { recipeId: recipe.id, state, missing, uncertain, optionalMissing };
}

/** Convenience for callers that only need the label. */
export function stateLabel(a: DishAssessment): string {
  switch (a.state) {
    case 'cook-now':
      return 'Cook now';
    case 'need-items':
      return a.missing.length === 1 ? 'Need 1 item' : `Need ${a.missing.length} items`;
    case 'check-first':
      return 'Check first';
  }
}
