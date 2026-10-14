import type { CookLogEntry, Household, Leftover, PantryItem } from '../engine/types';
import { getSupabase, currentSession } from './supabase';

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

interface RemotePantryRow {
  ingredient_id: string;
  quantity: number;
  unit: PantryItem['unit'];
  storage: PantryItem['storage'];
  last_confirmed_at: string;
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

interface RemoteHouseholdRow {
  adults: number;
  children: number;
  cooktop: Household['cooktop'];
  burners: number;
  diet: Household['diet'];
  allergies: string[];
  dislikes: string[];
  equipment: Household['equipment'];
  max_minutes_weekday: number;
  max_minutes_weekend: number;
  observances: Household['observances'];
  weekly_budget_paise: number | string | null;
}

const PROFILE_COLUMNS =
  'adults, children, cooktop, burners, diet, allergies, dislikes, equipment, ' +
  'max_minutes_weekday, max_minutes_weekend, observances, weekly_budget_paise';

function fromRemoteHousehold(r: RemoteHouseholdRow): Household {
  return {
    adults: r.adults,
    children: r.children,
    cooktop: r.cooktop,
    burners: r.burners,
    diet: r.diet,
    allergies: r.allergies ?? [],
    dislikes: r.dislikes ?? [],
    equipment: r.equipment ?? [],
    maxMinutesWeekday: r.max_minutes_weekday,
    maxMinutesWeekend: r.max_minutes_weekend,
    observances: r.observances ?? [],
    ...(r.weekly_budget_paise == null ? {} : { weeklyBudgetPaise: Number(r.weekly_budget_paise) }),
  };
}

/**
 * Syncs the local pantry with the household it belongs to and returns the result for the
 * caller to commit, tagged with that household's id.
 *
 * Normally both directions run in one pass, so a shared household converges after a single
 * sync from either phone. Right after switching to a household this phone holds no copy of
 * (`needsPull`), it only pulls: the empty local pantry replaces nothing on the server.
 *
 * The profile (covers, cooktop, diet and the rest) is shared, and only an owner may change it:
 * an owner's phone pushes it, every other phone takes the household's copy.
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
  if (local.householdId !== null && local.householdId !== target) {
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

    const merged = local.needsPull ? new Map<string, PantryItem>() : new Map(local.pantry);
    let pulled = 0;

    for (const row of (remoteRows ?? []) as RemotePantryRow[]) {
      const remoteAt = Date.parse(row.last_confirmed_at);
      if (!Number.isFinite(remoteAt)) continue;

      const mine = merged.get(row.ingredient_id);
      // Strictly newer wins. On an exact tie the local row stays, which keeps a sync
      // that changes nothing from churning state and re-rendering every screen.
      if (!mine || remoteAt > mine.lastConfirmedAt) {
        merged.set(row.ingredient_id, {
          ingredientId: row.ingredient_id,
          quantity: Number(row.quantity),
          unit: row.unit,
          storage: row.storage,
          lastConfirmedAt: remoteAt,
        });
        pulled++;
      }
    }

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
    // Only an owner's phone writes it (RLS refuses anyone else). Other phones took the
    // household's copy above.
    if (isOwner) {
      const { error: profilePushError } = await sb
        .from('household')
        .update({
          adults: local.household.adults,
          children: local.household.children,
          cooktop: local.household.cooktop,
          burners: local.household.burners,
          diet: local.household.diet,
          allergies: local.household.allergies,
          dislikes: local.household.dislikes,
          equipment: local.household.equipment,
          observances: local.household.observances,
          weekly_budget_paise: local.household.weeklyBudgetPaise ?? null,
        })
        .eq('id', target);
      if (profilePushError) return off(profilePushError.message);
    }

    // ---- cook log ----
    // Only what was cooked in this household. Untagged entries predate the first sync and
    // belong to the household that sync binds to, which is this one.
    const recent = local.cookLog
      .filter((e) => (e.householdId ?? target) === target)
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
        pulled > 0
          ? `Synced. ${pulled} ${pulled === 1 ? 'item was' : 'items were'} newer on the other phone.`
          : 'Synced. Everything already matched.',
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
