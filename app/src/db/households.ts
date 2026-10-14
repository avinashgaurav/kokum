/**
 * Which household this phone is looking at, when the account belongs to more than one.
 *
 * Every signup gets its own household, so anyone who redeems an invite belongs to at least
 * two. Joining must never silently move someone off their own pantry, so the active household
 * is an explicit choice stored on the device, and the default is the user's own household.
 * Pure, type-only imports, so it runs under the node test runner.
 */

import type { Household, PantryItem } from '../engine/types';

export type MemberRole = 'owner' | 'member' | 'cook';

export interface Membership {
  householdId: string;
  name: string;
  role: MemberRole;
  joinedAt: string;
}

/**
 * The stored choice if the user still belongs to that household. Otherwise their own: the
 * earliest-joined household they own, which is the one created at signup. Otherwise the
 * earliest they joined. Null when they belong to none.
 */
export function pickActiveHousehold(memberships: Membership[], stored: string | null): string | null {
  if (stored && memberships.some((m) => m.householdId === stored)) return stored;
  // An unparseable timestamp sorts last rather than poisoning the comparison with NaN.
  const at = (m: Membership) => {
    const t = Date.parse(m.joinedAt);
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  const byJoined = [...memberships].sort((a, b) => {
    const ta = at(a);
    const tb = at(b);
    return ta === tb ? 0 : ta < tb ? -1 : 1;
  });
  return (byJoined.find((m) => m.role === 'owner') ?? byJoined[0])?.householdId ?? null;
}

/**
 * The household-scoped part of local state. The pantry and profile on screen belong to exactly
 * one household, and the copies of any other household this phone has been on are kept aside,
 * so switching never merges one household's pantry into another's.
 */
export interface ScopedLocal {
  /** The household the on-screen pantry and profile belong to. Null until the first sync. */
  householdId: string | null;
  /**
   * Set after switching to a household this phone holds no copy of. The next sync then
   * replaces the local pantry and profile with the household's, and pushes nothing.
   */
  needsPull: boolean;
  pantry: Map<string, PantryItem>;
  household: Household;
  /** Copies of the other households, keyed by household id. Never includes the active one. */
  stash: Record<string, { pantry: PantryItem[]; household: Household }>;
}

/**
 * Moves the phone to household `to`. The current pantry and profile are put aside under the
 * household they belong to (`from` when they were never bound, which is the household the
 * phone was on), and `to`'s copy is restored if this phone has one. Without one the pantry is
 * emptied and marked for a pull. `drop` discards a household's copy, used after leaving it.
 */
export function switchLocalHousehold(
  s: ScopedLocal,
  to: string,
  opts: { from: string | null; drop?: string },
): ScopedLocal {
  const from = s.householdId ?? opts.from;
  const stash = { ...s.stash };
  if (from && from !== to && from !== opts.drop) {
    stash[from] = { pantry: [...s.pantry.values()], household: s.household };
  }
  if (opts.drop) delete stash[opts.drop];

  if (from === to && opts.drop !== to) return { ...s, householdId: to, stash };

  const restored = stash[to];
  delete stash[to];
  if (restored) {
    return {
      householdId: to,
      needsPull: false,
      pantry: new Map(restored.pantry.map((p) => [p.ingredientId, p])),
      household: restored.household,
      stash,
    };
  }
  return { householdId: to, needsPull: true, pantry: new Map(), household: s.household, stash };
}

/**
 * Applies a finished sync for `householdId`, or returns null when the phone has moved to a
 * different household while the sync was in flight, so its result must be thrown away.
 */
export function commitSync(
  s: ScopedLocal,
  result: { householdId: string; pantry: Map<string, PantryItem>; household?: Household },
): ScopedLocal | null {
  if (s.householdId !== null && s.householdId !== result.householdId) return null;
  return {
    ...s,
    householdId: result.householdId,
    needsPull: false,
    pantry: result.pantry,
    household: result.household ?? s.household,
  };
}
