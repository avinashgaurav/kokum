import type { Household, Leftover, PantryItem, Recipe, Suggestion } from './types';
import { suggest, shortfall, type ShortfallLine, type SuggestInput } from './suggest';
import { DAY_MS, adultEquivalents } from './scaling';
import { assessDish } from './dishState';

/**
 * Weekly plan, leftovers and guest mode.
 *
 * The weekly plan is where par levels earn their keep: one restock, seven days of decisions,
 * one consolidated list. Everything here is deterministic and runs offline.
 */

export interface PlannedDay {
  /** Epoch ms at local midnight. */
  day: number;
  suggestion: Suggestion | null;
  /** Set when the day is covered by leftovers rather than cooking. */
  leftover?: Leftover;
}

export interface WeekPlan {
  days: PlannedDay[];
  /** Everything the week needs that the pantry will not cover. */
  shopping: ShortfallLine[];
}

const WEEKEND = new Set([0, 6]);

/**
 * Plans seven days forward.
 *
 * Two things make this more than "call suggest seven times":
 *
 * 1. It simulates depletion. Each planned dish is subtracted from a working copy of the
 *    pantry before the next day is planned, so day 5 knows day 2 used the paneer. Without
 *    that, a week plan happily schedules the same 200 g of paneer four times.
 * 2. It plans against pull, not push, so a week can legitimately include dishes you need to
 *    shop for. That is the point of planning ahead. The shopping list is the output.
 */
export function planWeek(
  input: SuggestInput,
  leftovers: Leftover[],
  startOfToday: number,
): WeekPlan {
  const working = new Map(input.pantry);
  const usedRecipes = new Set<string>();
  const days: PlannedDay[] = [];
  const chosen: Recipe[] = [];

  const live = leftovers
    .filter((l) => l.expiresAt > startOfToday && l.portions > 0)
    .sort((a, b) => a.expiresAt - b.expiresAt);
  let leftoverIdx = 0;

  for (let i = 0; i < 7; i++) {
    const day = startOfToday + i * DAY_MS;
    const dow = new Date(day).getDay();

    // Leftovers first. Cooking something new while yesterday's rajma goes off is the one
    // outcome a planner should never produce.
    const nextLeftover = live[leftoverIdx];
    if (nextLeftover && nextLeftover.expiresAt <= day + DAY_MS) {
      days.push({ day, suggestion: null, leftover: nextLeftover });
      leftoverIdx++;
      continue;
    }

    const picks = suggest(
      { ...input, pantry: working, now: day },
      {
        kind: 'pull',
        maxMinutes: WEEKEND.has(dow)
          ? input.household.maxMinutesWeekend
          : input.household.maxMinutesWeekday,
        limit: 20,
      },
    );

    // No repeats inside one week. A planner that suggests dal tadka four times is not planning.
    const pick = picks.find((p) => !usedRecipes.has(p.recipe.id)) ?? picks[0] ?? null;
    if (!pick) {
      days.push({ day, suggestion: null });
      continue;
    }

    usedRecipes.add(pick.recipe.id);
    chosen.push(pick.recipe);
    days.push({ day, suggestion: pick });
    consume(working, pick.recipe, input, day);
  }

  // The shopping list is computed against the real pantry plus everything the week will use,
  // so it covers the plan rather than just topping up par levels.
  const needs = chosen.map((r) =>
    assessDish(r, input.pantry, input.ingredients, input.household, startOfToday),
  );

  return {
    days,
    shopping: shortfall(
      input.pantry,
      input.ingredients,
      input.household,
      startOfToday,
      needs,
    ),
  };
}

/** Subtract a planned dish from the working pantry so later days see the depletion. */
function consume(
  working: Map<string, PantryItem>,
  recipe: Recipe,
  input: SuggestInput,
  at: number,
): void {
  const ae = adultEquivalents(input.household);
  for (const ri of recipe.ingredients) {
    const item = working.get(ri.ingredientId);
    if (!item) continue;
    const used = ri.qtyPer2Adults * (ae / 2);
    working.set(ri.ingredientId, {
      ...item,
      quantity: Math.max(0, item.quantity - used),
      lastConfirmedAt: at,
    });
  }
}


/**
 * Guest mode. Returns a household scaled up for tonight only, so quantities and shortfalls
 * reflect the extra people without permanently changing the profile.
 */
export function withGuests(
  household: Household,
  extraAdults: number,
  extraChildren = 0,
): Household {
  return {
    ...household,
    adults: household.adults + Math.max(0, extraAdults),
    children: household.children + Math.max(0, extraChildren),
  };
}

/** Leftovers that are still good, soonest to expire first. */
export function liveLeftovers(leftovers: Leftover[], now: number): Leftover[] {
  return leftovers
    .filter((l) => l.portions > 0 && l.expiresAt > now)
    .sort((a, b) => a.expiresAt - b.expiresAt);
}

/** Human phrase for how long a leftover has. Deliberately vague past a day. */
export function leftoverWindow(l: Leftover, now: number): string {
  const hours = (l.expiresAt - now) / 3_600_000;
  if (hours <= 0) return 'past its best';
  if (hours < 6) return 'eat today';
  if (hours < 30) return 'good until tomorrow';
  return `good for ${Math.round(hours / 24)} more days`;
}
