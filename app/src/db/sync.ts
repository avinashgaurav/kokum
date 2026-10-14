import type { CookLogEntry, Household, Leftover, PantryItem } from '../engine/types';
import { getSupabase, currentSession } from './supabase';
import { cookLogHousehold, maySyncWith } from './households';
import {
  PROFILE_COLUMNS,
  fromRemoteHousehold,
  mergeRemotePantry,
  toRemoteHousehold,
  type RemoteHouseholdRow,
  type RemotePantryRow,
} from './syncCore';

/**
 * Pantry sync.
 *
 * Deliberately simple: last write wins, per pantry row, on `last_confirmed_at`. That is the
 * right rule for this data rather than a lazy one. A pantry row's whole meaning is "the last
 * time a human looked at this, here is what they saw", so the newer observation is by
 * definition the better one. Two people cannot both be right about how much atta is in the
 * jar, and the one who looked more recently wins.
 *
 * What this does NOT attempt: operational transforms, vector clocks, or merging concurrent
 * edits to the same row. A two-person household does not need them, and pretending otherwise
 * would add a class of bug far worse than the one it solves.
 *
 * Nor does it ever merge across households. The local pantry belongs to one household (see
 * ScopedLocal in households.ts) and a sync only ever runs against that one.
 */

export interface SyncResult {
  ok: boolean;
  message: string;
  pulled: number;
  pushed: number;
}

type SyncFailure = SyncResult & { ok: false };

const off = (message: string): SyncFailure => ({ ok: false, message, pulled: 0, pushed: 0 });

export interface LocalSnapshot {
  /** The household the local pantry belongs to; null if this phone has never synced. */
  householdId: string | null;
  /** True right after switching to a household this phone holds no copy of. */
  needsPull: boolean;
  household: Household;
  pantry: Map<string, PantryItem>;
  cookLog: CookLogEntry[];
  leftovers: Leftover[];
}

export interface SyncSuccess extends SyncResult {
  ok: true;
  /** The household this result belongs to. The caller drops it if the phone has moved since. */
  householdId: string;
  pantry: Map<string, PantryItem>;
  /** Present when the profile came from the server rather than from this phone. */
  household?: Household;
}

/**
 * Syncs the local pantry with the household it belongs to and returns the result for the
 * caller to commit, tagged with that household's id.
 *
 * Normally both directions run in one pass, so a shared household converges after a single
 * sync from either phone. Right after switching to a household this phone holds no copy of
 * (`needsPull`), it only pulls: pulled rows merge onto whatever is local and nothing is pushed.
 *
 * An unbound pantry (never synced, or from an older build) is the user's own, so it may only
 * ever be pushed to their own household. The caller aligns local state first (see
 * alignLocalHousehold); this refuses anything else as a backstop.
 *
 * The profile (covers, cooktop, diet and the rest) is shared, and only owners may change it:
 * every owner's phone pushes it (with two owners, the last to sync wins), and every other
 * phone takes the household's copy.
 */
export async function syncPantry(local: LocalSnapshot): Promise<SyncSuccess | SyncFailure> {
  const sb = getSupabase();
  if (!sb) return off('Sharing is not configured in this build.');

  const session = await currentSession();
  if (!session) return off('Sign in to share a pantry.');
  if (session.error) return off(`Could not load your households: ${session.error}`);
  if (!session.householdId) return off('No household yet. Sign out and back in.');

  const target = session.householdId;
  // The pantry on screen belongs to another household. Never merge across: the caller
  // switches the local state over first, then syncs.
  if (!maySyncWith(local.householdId, target, session.households)) {
    return off('This phone just changed household. Sync again.');
  }
  const isOwner = session.role === 'owner';

  try {
    // ---- pull ----
    const { data: remoteRows, error: pullError } = await sb
      .from('pantry_item')
      .select('ingredient_id, quantity, unit, storage, last_confirmed_at')
      .eq('household_id', target);

    if (pullError) return off(pullError.message);

    const { merged, pulled } = mergeRemotePantry(local.pantry, (remoteRows ?? []) as RemotePantryRow[]);

    let household: Household | undefined;
    if (local.needsPull || !isOwner) {
      const { data: profile, error: profileError } = await sb
        .from('household')
        .select(PROFILE_COLUMNS)
        .eq('id', target)
        .maybeSingle();
      if (profileError) return off(profileError.message);
      if (profile) household = fromRemoteHousehold(profile as unknown as RemoteHouseholdRow);
    }

    if (local.needsPull) {
      return {
        ok: true,
        message: `Switched. Loaded ${pulled} ${pulled === 1 ? 'item' : 'items'} from this household's pantry.`,
        pulled,
        pushed: 0,
        householdId: target,
        pantry: merged,
        ...(household ? { household } : {}),
      };
    }

    // ---- push ----
    // Everything we hold, including rows we just pulled. Upserting a row identical to the
    // one on the server is a no-op, and it saves tracking which rows are locally dirty.
    const payload = [...merged.values()].map((it) => ({
      household_id: target,
      ingredient_id: it.ingredientId,
      quantity: it.quantity,
      unit: it.unit,
      storage: it.storage,
      last_confirmed_at: new Date(it.lastConfirmedAt).toISOString(),
    }));

    const { error: pushError } = await sb
      .from('pantry_item')
      .upsert(payload, { onConflict: 'household_id,ingredient_id' });

    if (pushError) return off(pushError.message);

    // ---- household profile ----
    // Only owners' phones write it (RLS refuses anyone else); other phones took the
    // household's copy above. A failed upload does not undo a pantry sync that worked, so it
    // is reported alongside the success rather than as a failure.
    let profileNote = '';
    if (isOwner) {
      const { error: profilePushError } = await sb
        .from('household')
        .update(toRemoteHousehold(local.household))
        .eq('id', target);
      if (profilePushError) profileNote = ` Household settings did not upload: ${profilePushError.message}`;
    }

    // ---- cook log ----
    // Only what was cooked in this household. An untagged entry belongs to the household the
    // unbound pantry belongs to, which maySyncWith above has already established is this one.
    const recent = local.cookLog
      .filter((e) => cookLogHousehold(e, local.householdId ?? target) === target)
      .slice(-100)
      .map((e) => ({
        household_id: target,
        recipe_id: e.recipeId,
        cooked_at: new Date(e.at).toISOString(),
        covers: local.household.adults + local.household.children * 0.6,
      }));
    if (recent.length > 0) {
      await sb.from('cook_log').upsert(recent, { ignoreDuplicates: true });
    }

    return {
      ok: true,
      message:
        (pulled > 0
          ? `Synced. ${pulled} ${pulled === 1 ? 'item was' : 'items were'} newer on the other phone.`
          : 'Synced. Everything already matched.') + profileNote,
      pulled,
      pushed: payload.length,
      householdId: target,
      pantry: merged,
      ...(household ? { household } : {}),
    };
  } catch (err) {
    // A failed sync must never cost the user their local pantry.
    return off(err instanceof Error ? err.message : 'Sync failed. Your local pantry is untouched.');
  }
}
