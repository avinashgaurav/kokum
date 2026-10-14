/**
 * The pure half of pantry sync: merging pulled rows and mapping the household profile to and
 * from its database row. No client, no I/O, so it runs under the node test runner.
 */
import type { Household, PantryItem } from '../engine/types';

export interface RemotePantryRow {
  ingredient_id: string;
  quantity: number;
  unit: PantryItem['unit'];
  storage: PantryItem['storage'];
  last_confirmed_at: string;
}

/**
 * Merges pulled rows onto the local pantry, last write wins on `last_confirmed_at`. Strictly
 * newer wins; on an exact tie the local row stays, so a sync that changes nothing does not
 * churn state. Local rows the server lacks are kept, including edits made since a switch.
 */
export function mergeRemotePantry(
  local: Map<string, PantryItem>,
  rows: RemotePantryRow[],
): { merged: Map<string, PantryItem>; pulled: number } {
  const merged = new Map(local);
  let pulled = 0;
  for (const row of rows) {
    const remoteAt = Date.parse(row.last_confirmed_at);
    if (!Number.isFinite(remoteAt)) continue;
    const mine = merged.get(row.ingredient_id);
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
  return { merged, pulled };
}

export interface RemoteHouseholdRow {
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

/** Every shared profile column. The pull reads exactly what the push writes. */
export const PROFILE_COLUMNS =
  'adults, children, cooktop, burners, diet, allergies, dislikes, equipment, ' +
  'max_minutes_weekday, max_minutes_weekend, observances, weekly_budget_paise';

export function toRemoteHousehold(h: Household): RemoteHouseholdRow {
  return {
    adults: h.adults,
    children: h.children,
    cooktop: h.cooktop,
    burners: h.burners,
    diet: h.diet,
    allergies: h.allergies,
    dislikes: h.dislikes,
    equipment: h.equipment,
    max_minutes_weekday: h.maxMinutesWeekday,
    max_minutes_weekend: h.maxMinutesWeekend,
    observances: h.observances,
    weekly_budget_paise: h.weeklyBudgetPaise ?? null,
  };
}

export function fromRemoteHousehold(r: RemoteHouseholdRow): Household {
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
