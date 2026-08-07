import type {
  CookLogEntry,
  DishAssessment,
  Household,
  Ingredient,
  PantryItem,
  Recipe,
  RequestKind,
  Suggestion,
  Unit,
} from './types';
import { assessDish } from './dishState';
import { confidenceOf, daysSince, shelfLifeFor } from './confidence';
import { DAY_MS } from './scaling';

export interface SuggestInput {
  recipes: Recipe[];
  pantry: Map<string, PantryItem>;
  ingredients: Map<string, Ingredient>;
  household: Household;
  cookLog: CookLogEntry[];
  now: number;
}

export interface SuggestOptions {
  kind: RequestKind;
  moods?: string[];
  cuisine?: string;
  /** Free-text query matched against recipe and ingredient names. */
  query?: string;
  maxMinutes?: number;
  limit?: number;
}

const REPEAT_WINDOW_DAYS = 14;

/**
 * Hard constraints. Applied to push AND pull alike.
 *
 * A pull may surface a dish you lack the ingredients for. It may never surface one you
 * must not eat. Diet and allergies are not preferences.
 */
export function passesHardConstraints(
  recipe: Recipe,
  ingredients: Map<string, Ingredient>,
  h: Household,
  maxMinutes?: number,
): boolean {
  switch (h.diet) {
    case 'veg':
      if (recipe.diet !== 'veg') return false;
      break;
    case 'egg':
      if (recipe.diet === 'nonveg') return false;
      break;
    case 'vegan':
      if (!recipe.vegan) return false;
      break;
    case 'jain':
      if (recipe.diet !== 'veg' || !recipe.jainSafe) return false;
      break;
    case 'nonveg':
      break;
  }

  for (const ri of recipe.ingredients) {
    const ing = ingredients.get(ri.ingredientId);
    if (!ing) continue;
    if (h.dislikes.includes(ing.id)) return false;
    if (ing.allergens.some((a) => h.allergies.includes(a))) return false;
  }

  if (recipe.equipment.some((e) => !h.equipment.includes(e))) return false;
  if (recipe.cooktop === 'gas-only' && h.cooktop === 'induction') return false;
  if (maxMinutes !== undefined && recipe.minutes > maxMinutes) return false;

  // Observances are hard filters, not preferences. A household keeping vrat cannot eat
  // grain; offering it is the same class of mistake as ignoring an allergy.
  for (const obs of h.observances) {
    for (const ri of recipe.ingredients) {
      const ing = ingredients.get(ri.ingredientId);
      if (!ing) continue;
      switch (obs) {
        case 'no-onion-garlic':
        case 'shravan':
        case 'ekadashi':
          if (!ing.alliumFree) return false;
          break;
        case 'navratri':
          // Vrat excludes grain and pulses as well as allium.
          if (!ing.alliumFree || !ing.vratSafe) return false;
          break;
      }
    }
    // Shravan and Ekadashi are also observed as vegetarian in most households.
    if ((obs === 'shravan' || obs === 'ekadashi' || obs === 'navratri') && recipe.diet !== 'veg') {
      return false;
    }
  }

  return true;
}

/**
 * How urgent is cooking this, given what is about to spoil?
 * The heaviest term in the score: using the palak before it dies is the single most
 * valuable thing the app can tell you.
 */
function expiryUrgency(
  recipe: Recipe,
  pantry: Map<string, PantryItem>,
  ingredients: Map<string, Ingredient>,
  now: number,
): { score: number; ingredientId: string | null } {
  let best = 0;
  let which: string | null = null;

  for (const ri of recipe.ingredients) {
    const ing = ingredients.get(ri.ingredientId);
    const item = pantry.get(ri.ingredientId);
    if (!ing || !item || item.quantity <= 0) continue;

    const life = shelfLifeFor(ing, item.storage);
    if (life === null) continue;

    const left = life - daysSince(item.lastConfirmedAt, now);
    if (left < 0) continue;

    // 1.0 for something dying today, tapering to 0 at a week out.
    const urgency = Math.max(0, 1 - left / 7);
    if (urgency > best) {
      best = urgency;
      which = ing.id;
    }
  }

  return { score: best, ingredientId: which };
}

function daysSinceCooked(recipeId: string, cookLog: CookLogEntry[], now: number): number | null {
  let latest: number | null = null;
  for (const e of cookLog) {
    if (e.recipeId === recipeId && (latest === null || e.at > latest)) latest = e.at;
  }
  return latest === null ? null : (now - latest) / DAY_MS;
}

function matchesQuery(recipe: Recipe, ingredients: Map<string, Ingredient>, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  if (recipe.name.toLowerCase().includes(needle)) return true;
  if (recipe.cuisine.toLowerCase().includes(needle)) return true;
  if (recipe.moods.some((m) => m.toLowerCase().includes(needle))) return true;

  // Hinglish is first-class: match aliases as readily as canonical names.
  for (const ri of recipe.ingredients) {
    const ing = ingredients.get(ri.ingredientId);
    if (!ing) continue;
    if (ing.name.toLowerCase().includes(needle)) return true;
    if (ing.aliases.some((a) => a.toLowerCase().includes(needle))) return true;
  }
  return false;
}

function buildReason(
  recipe: Recipe,
  a: DishAssessment,
  urgency: { score: number; ingredientId: string | null },
  ingredients: Map<string, Ingredient>,
  sinceCooked: number | null,
): string {
  if (a.state === 'need-items') {
    const names = a.missing
      .map((m) => ingredients.get(m.ingredientId)?.name ?? m.ingredientId)
      .join(', ');
    return `You need ${names}.`;
  }
  if (a.state === 'check-first') {
    const names = a.uncertain.map((id) => ingredients.get(id)?.name ?? id).join(', ');
    return `Check you still have ${names}.`;
  }
  if (urgency.score > 0.5 && urgency.ingredientId) {
    const name = ingredients.get(urgency.ingredientId)?.name ?? urgency.ingredientId;
    return `Your ${name.toLowerCase()} will not last much longer.`;
  }
  if (sinceCooked === null) return 'You have not made this before.';
  if (sinceCooked > 45) return `It has been ${Math.round(sinceCooked)} days.`;
  return `Ready to cook, ${recipe.minutes} min.`;
}

/**
 * The deterministic layer. Runs entirely offline.
 *
 * 1. Hard constraints (both kinds)
 * 2. State every survivor
 * 3. Gate by request kind: push keeps only cook-now, pull keeps everything
 * 4. Score within group and sort
 */
export function suggest(input: SuggestInput, opts: SuggestOptions): Suggestion[] {
  const { recipes, pantry, ingredients, household, cookLog, now } = input;
  const limit = opts.limit ?? 3;
  const out: Suggestion[] = [];

  for (const recipe of recipes) {
    if (!passesHardConstraints(recipe, ingredients, household, opts.maxMinutes)) continue;
    if (opts.cuisine && recipe.cuisine.toLowerCase() !== opts.cuisine.toLowerCase()) continue;
    if (opts.moods?.length && !opts.moods.some((m) => recipe.moods.includes(m))) continue;
    if (opts.query && !matchesQuery(recipe, ingredients, opts.query)) continue;

    const assessment = assessDish(recipe, pantry, ingredients, household, now);

    // The gate. Push surfaces never show something the user cannot act on.
    if (opts.kind === 'push' && assessment.state !== 'cook-now') continue;

    const urgency = expiryUrgency(recipe, pantry, ingredients, now);
    const sinceCooked = daysSinceCooked(recipe.id, cookLog, now);

    let score = 0;
    score += urgency.score * 100;
    if (sinceCooked !== null && sinceCooked < REPEAT_WINDOW_DAYS) {
      score -= (REPEAT_WINDOW_DAYS - sinceCooked) * 4;
    }
    if (sinceCooked === null) score += 6;
    score -= (recipe.effort - 1) * 3;
    // Within a pull, fewer missing items ranks higher.
    score -= assessment.missing.length * 25;
    if (assessment.state === 'check-first') score -= 10;

    out.push({
      recipe,
      assessment,
      score,
      reason: buildReason(recipe, assessment, urgency, ingredients, sinceCooked),
    });
  }

  const rank: Record<string, number> = { 'cook-now': 0, 'check-first': 1, 'need-items': 2 };
  out.sort((a, b) => {
    const byState = rank[a.assessment.state]! - rank[b.assessment.state]!;
    if (byState !== 0) return byState;
    if (b.score !== a.score) return b.score - a.score;
    return a.recipe.id.localeCompare(b.recipe.id);
  });

  return out.slice(0, limit);
}

/**
 * Surprise Me: constrained randomness, not chaos.
 * Picks from cook-now dishes you have never made or have not made in a long time.
 * Deterministic given a seed, so it is testable and does not reshuffle on re-render.
 */
export function surpriseMe(input: SuggestInput, seed: number): Suggestion | null {
  const all = suggest(input, { kind: 'push', limit: Number.MAX_SAFE_INTEGER });
  if (all.length === 0) return null;

  const tail = all.filter((s) => {
    const d = daysSinceCooked(s.recipe.id, input.cookLog, input.now);
    return d === null || d > 60;
  });

  const pool = tail.length > 0 ? tail : all;
  const idx = Math.abs(Math.floor(seed)) % pool.length;
  return pool[idx] ?? null;
}

/**
 * Shortfall for the Next order list: everything below its par level, plus anything a
 * requested dish was missing.
 */
export interface ShortfallLine {
  ingredientId: string;
  needed: number;
  unit: Unit;
  aisle: string;
  reason: 'below-par' | 'for-dish';
}

export function shortfall(
  pantry: Map<string, PantryItem>,
  ingredients: Map<string, Ingredient>,
  household: Household,
  now: number,
  extra: DishAssessment[] = [],
): ShortfallLine[] {
  const lines = new Map<string, ShortfallLine>();
  const ae = household.adults + household.children * 0.6;

  for (const ing of ingredients.values()) {
    const item = pantry.get(ing.id);
    const par = ing.parPerAdult * ae;
    const have = item
      ? item.quantity > 0 && confidenceOf(item, ing, now) > 0
        ? item.quantity
        : 0
      : 0;
    if (have < par * 0.5) {
      lines.set(ing.id, {
        ingredientId: ing.id,
        needed: Math.max(0, par - have),
        unit: ing.unit,
        aisle: ing.aisle,
        reason: 'below-par',
      });
    }
  }

  for (const a of extra) {
    for (const m of a.missing) {
      const ing = ingredients.get(m.ingredientId);
      if (!ing) continue;
      const gap = m.needed - m.have;
      const existing = lines.get(m.ingredientId);
      if (existing) {
        existing.needed = Math.max(existing.needed, gap);
        existing.reason = 'for-dish';
      } else {
        lines.set(m.ingredientId, {
          ingredientId: m.ingredientId,
          needed: gap,
          unit: ing.unit,
          aisle: ing.aisle,
          reason: 'for-dish',
        });
      }
    }
  }

  return [...lines.values()].sort((a, b) => a.aisle.localeCompare(b.aisle));
}
