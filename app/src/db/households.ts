/**
 * Which household this phone is looking at, when the account belongs to more than one.
 *
 * Every signup gets its own household, so anyone who redeems an invite belongs to at least
 * two. Joining must never silently move someone off their own pantry, so the active household
 * is an explicit choice stored on the device, and the default is the user's own household.
 * Pure, no imports, so it runs under the node test runner.
 */

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
  const byJoined = [...memberships].sort((a, b) => Date.parse(a.joinedAt) - Date.parse(b.joinedAt));
  return (byJoined.find((m) => m.role === 'owner') ?? byJoined[0])?.householdId ?? null;
}
