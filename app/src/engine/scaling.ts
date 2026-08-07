import type { Household, Unit } from './types';

/**
 * A child eats roughly 0.6 of an adult portion. This single number propagates into every
 * quantity in the app, so it is deliberately named and tested rather than inlined.
 */
export const CHILD_FACTOR = 0.6;

export const DAY_MS = 86_400_000;

/** How many adult-equivalent portions this household cooks for. */
export function adultEquivalents(h: Pick<Household, 'adults' | 'children'>): number {
  return h.adults + h.children * CHILD_FACTOR;
}

/**
 * Recipe quantities are always stored per 2 adults. Everything else derives from that.
 * A scaling bug here silently corrupts the whole pantry, so keep it boring.
 */
export function scaleQuantity(qtyPer2Adults: number, ae: number): number {
  return qtyPer2Adults * (ae / 2);
}

/**
 * Round a quantity to something a human would write on a list.
 * Countable things go to halves; weights and volumes to sensible steps.
 */
export function presentQuantity(qty: number, unit: Unit): number {
  if (unit === 'piece' || unit === 'bunch') return Math.round(qty * 2) / 2;
  if (qty >= 1000) return Math.round(qty / 50) * 50;
  if (qty >= 100) return Math.round(qty / 10) * 10;
  return Math.round(qty);
}

export function formatQuantity(qty: number, unit: Unit): string {
  const q = presentQuantity(qty, unit);
  if (unit === 'g' && q >= 1000) return `${trim(q / 1000)} kg`;
  if (unit === 'ml' && q >= 1000) return `${trim(q / 1000)} L`;
  if (unit === 'piece') return q === 1 ? '1' : trim(q);
  if (unit === 'bunch') return q === 1 ? '1 bunch' : `${trim(q)} bunches`;
  return `${trim(q)} ${unit}`;
}

function trim(n: number): string {
  return Number(n.toFixed(2)).toString();
}
