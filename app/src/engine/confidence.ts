import type { Ingredient, PantryItem, Household } from './types';
import { DAY_MS, adultEquivalents } from './scaling';

/**
 * Confidence is a heuristic, not a sensor. It answers one question: how much would we bet
 * that this item is still in the kitchen in this quantity? See AGENTS.md.
 *
 * At or above COOK, we will vouch for it. Below, we ask rather than assume.
 */
export const COOK_THRESHOLD = 0.75;
export const UNCERTAIN_THRESHOLD = 0.55;

/** Staples do not spoil, but our memory of them still decays. Full decay over this window. */
const STAPLE_DECAY_DAYS = 90;
const STAPLE_FLOOR = 0.2;

export function daysSince(at: number, now: number): number {
  return Math.max(0, (now - at) / DAY_MS);
}

export function shelfLifeFor(ing: Ingredient, storage: PantryItem['storage']): number | null {
  if (!ing.shelfLifeDays) return null;
  return ing.shelfLifeDays[storage] ?? ing.shelfLifeDays.counter ?? null;
}

/**
 * How much of this is probably left right now.
 *
 * Two of the four depletion mechanisms live here: time decay for perishables (they expire
 * whether or not you cooked) and ambient burn for staples (oil, atta and salt get used in
 * ways nobody logs). The other two, cook confirmation and manual correction, are events that
 * write to the item directly.
 */
export function projectedQuantity(
  item: PantryItem,
  ing: Ingredient,
  household: Pick<Household, 'adults' | 'children'>,
  now: number,
): number {
  const days = daysSince(item.lastConfirmedAt, now);
  const life = shelfLifeFor(ing, item.storage);

  if (life !== null) {
    // Perishable: gone once past its shelf life, otherwise untouched by time.
    return days >= life ? 0 : item.quantity;
  }

  // Staple: burns down at a learned rate, scaled to household size.
  const burn = ing.burnPerAdultPerDay * adultEquivalents(household) * days;
  return Math.max(0, item.quantity - burn);
}

/**
 * Confidence in the projection above.
 *
 * Perishables lose confidence across their shelf life, so we stop vouching for coriander
 * before it is technically dead rather than after. Staples decay slowly toward a floor,
 * because "there is probably still some atta" stays a decent bet for a long time.
 */
export function confidenceOf(
  item: PantryItem,
  ing: Ingredient,
  now: number,
): number {
  const days = daysSince(item.lastConfirmedAt, now);
  const life = shelfLifeFor(ing, item.storage);

  if (life !== null) {
    if (life <= 0) return 0;
    return clamp(1 - days / life, 0, 1);
  }

  return clamp(1 - days / STAPLE_DECAY_DAYS, STAPLE_FLOOR, 1);
}

/** True when we should ask the user rather than rely on the projection. */
export function isUncertain(conf: number): boolean {
  return conf < COOK_THRESHOLD;
}

/** Items to put in front of the user during the weekly 30-second check: least certain first. */
export function weeklyCheckQueue(
  items: PantryItem[],
  index: Map<string, Ingredient>,
  now: number,
  limit = 8,
): PantryItem[] {
  return items
    .filter((it) => it.quantity > 0)
    .map((it) => {
      const ing = index.get(it.ingredientId);
      return { it, conf: ing ? confidenceOf(it, ing, now) : 0 };
    })
    .filter((x) => x.conf < COOK_THRESHOLD)
    .sort((a, b) => a.conf - b.conf)
    .slice(0, limit)
    .map((x) => x.it);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}
