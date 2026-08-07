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

const off = (message: string): SyncResult => ({ ok: false, message, pulled: 0, pushed: 0 });

export interface LocalSnapshot {
  household: Household;
  pantry: Map<string, PantryItem>;
  cookLog: CookLogEntry[];
  leftovers: Leftover[];
}

/**
 * Merges the device and the cloud, then returns the merged pantry for the caller to commit
 * to local state. Runs both directions in one pass so a shared household converges after a
 * single sync from either phone.
 */
export async function syncPantry(local: LocalSnapshot): Promise<SyncResult & { merged?: Map<string, PantryItem> }> {
  const sb = getSupabase();
  if (!sb) return off('Sharing is not configured in this build.');

  const session = await currentSession();
  if (!session) return off('Sign in to share a pantry.');
  if (!session.householdId) return off('No household yet. Sign out and back in.');

  try {
    // ---- pull ----
    const { data: remoteRows, error: pullError } = await sb
      .from('pantry_item')
      .select('ingredient_id, quantity, unit, storage, last_confirmed_at')
      .eq('household_id', session.householdId);

    if (pullError) return off(pullError.message);

    const merged = new Map(local.pantry);
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

    // ---- push ----
    // Everything we hold, including rows we just pulled. Upserting a row identical to the
    // one on the server is a no-op, and it saves tracking which rows are locally dirty.
    const payload = [...merged.values()].map((it) => ({
      household_id: session.householdId,
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
    // Covers, cooktop and diet are shared: both phones should suggest the same dishes.
    await sb
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
      .eq('id', session.householdId);

    // ---- cook log ----
    // Append-only, so a plain insert with duplicates ignored is the whole story.
    const recent = local.cookLog.slice(-100).map((e) => ({
      household_id: session.householdId,
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
      merged,
    };
  } catch (err) {
    // A failed sync must never cost the user their local pantry.
    return off(err instanceof Error ? err.message : 'Sync failed. Your local pantry is untouched.');
  }
}
