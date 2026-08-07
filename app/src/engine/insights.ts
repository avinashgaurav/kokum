import type { CookLogEntry, Household, Ingredient, PantryItem, Recipe } from './types';
import { DAY_MS, adultEquivalents } from './scaling';

/**
 * Weekly reads: nutrition, spend, and waste.
 *
 * All three are heuristics built on the same cook log and pantry the rest of the app uses.
 * None of them is a measurement, and the copy that renders them must not pretend otherwise.
 * See AGENTS.md.
 */

export interface WeekInsights {
  /** Days in the window that have at least one logged cook. Everything scales to this. */
  daysCooked: number;
  kcalPerAdultPerDay: number;
  proteinPerAdultPerDay: number;
  /** Share of cooked dishes using more than 40 ml of fat per 2 adults. */
  friedShare: number;
  /** Distinct cuisines cooked. A blunt but honest variety signal. */
  varietyCount: number;
  spentPaise: number;
  budgetPaise?: number;
  /** Perishables that expired unused in the window, and what they cost. */
  wasted: { ingredientId: string; quantity: number; paise: number }[];
  wastedPaise: number;
  /** A plain sentence, or null when there is not enough data to say anything honest. */
  headline: string | null;
}

const WINDOW_DAYS = 7;
const FAT_IDS = new Set(['oil', 'ghee']);
const FRIED_ML_PER_2 = 40;

export function weekInsights(
  cookLog: CookLogEntry[],
  recipes: Map<string, Recipe>,
  ingredients: Map<string, Ingredient>,
  pantry: Map<string, PantryItem>,
  household: Household,
  now: number,
): WeekInsights {
  const since = now - WINDOW_DAYS * DAY_MS;
  const ae = adultEquivalents(household);
  const recent = cookLog.filter((e) => e.at >= since);

  let kcal = 0;
  let protein = 0;
  let fried = 0;
  let spent = 0;
  const cuisines = new Set<string>();
  const dayKeys = new Set<number>();

  for (const entry of recent) {
    const recipe = recipes.get(entry.recipeId);
    if (!recipe) continue;
    cuisines.add(recipe.cuisine);
    dayKeys.add(Math.floor(entry.at / DAY_MS));

    let fatMl = 0;
    for (const ri of recipe.ingredients) {
      const ing = ingredients.get(ri.ingredientId);
      if (!ing) continue;
      const used = ri.qtyPer2Adults * (ae / 2);
      kcal += used * ing.kcalPerUnit;
      protein += used * ing.proteinPerUnit;
      spent += used * ing.paisePerUnit;
      if (FAT_IDS.has(ing.id)) fatMl += ri.qtyPer2Adults;
    }
    if (fatMl > FRIED_ML_PER_2) fried++;
  }

  const daysCooked = dayKeys.size;
  const perAdultDay = daysCooked > 0 && ae > 0 ? daysCooked * ae : 0;

  const wasted = expiredSince(pantry, ingredients, since, now);
  const wastedPaise = wasted.reduce((sum, w) => sum + w.paise, 0);

  const insights: WeekInsights = {
    daysCooked,
    kcalPerAdultPerDay: perAdultDay ? Math.round(kcal / perAdultDay) : 0,
    proteinPerAdultPerDay: perAdultDay ? Math.round(protein / perAdultDay) : 0,
    friedShare: recent.length ? fried / recent.length : 0,
    varietyCount: cuisines.size,
    spentPaise: Math.round(spent),
    budgetPaise: household.weeklyBudgetPaise,
    wasted,
    wastedPaise,
    headline: null,
  };

  insights.headline = headline(insights);
  return insights;
}

/**
 * Perishables that ran past their shelf life inside the window while still holding quantity.
 *
 * This is an estimate and the copy says so: an item might have been eaten on the last day
 * and simply never confirmed. It is directionally useful and should never be presented as
 * an accounting of waste.
 */
function expiredSince(
  pantry: Map<string, PantryItem>,
  ingredients: Map<string, Ingredient>,
  since: number,
  now: number,
): WeekInsights['wasted'] {
  const out: WeekInsights['wasted'] = [];
  for (const item of pantry.values()) {
    const ing = ingredients.get(item.ingredientId);
    if (!ing || !ing.shelfLifeDays || item.quantity <= 0) continue;

    const life = ing.shelfLifeDays[item.storage] ?? ing.shelfLifeDays.counter;
    if (life === undefined) continue;

    const expiredAt = item.lastConfirmedAt + life * DAY_MS;
    if (expiredAt >= since && expiredAt <= now) {
      out.push({
        ingredientId: ing.id,
        quantity: item.quantity,
        paise: Math.round(item.quantity * ing.paisePerUnit),
      });
    }
  }
  return out.sort((a, b) => b.paise - a.paise);
}

/**
 * One sentence, or nothing.
 *
 * Returning null on thin data is deliberate. A weekly summary that invents an observation
 * from two logged meals teaches the user to ignore the whole section.
 */
function headline(i: WeekInsights): string | null {
  if (i.daysCooked < 3) return null;

  if (i.wastedPaise > 5000) {
    return `About ${rupees(i.wastedPaise)} of fresh food went past its date this week.`;
  }
  if (i.proteinPerAdultPerDay > 0 && i.proteinPerAdultPerDay < 40) {
    return `Protein is running low, around ${i.proteinPerAdultPerDay} g a day per adult.`;
  }
  if (i.friedShare > 0.5) {
    return 'More than half of what you cooked this week was heavy on oil or ghee.';
  }
  if (i.varietyCount <= 1 && i.daysCooked >= 5) {
    return 'Everything this week came from one cuisine. Surprise Me is good for breaking that.';
  }
  if (i.budgetPaise && i.spentPaise > i.budgetPaise) {
    return `Cooking used about ${rupees(i.spentPaise)} of groceries, over your ${rupees(i.budgetPaise)} budget.`;
  }
  return `${i.daysCooked} days cooked, ${i.varietyCount} cuisines, nothing notable to flag.`;
}

export function rupees(paise: number): string {
  const r = paise / 100;
  if (r >= 1000) return `Rs ${(r / 1000).toFixed(1)}k`;
  return `Rs ${Math.round(r)}`;
}
