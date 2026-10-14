import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PROFILE_COLUMNS,
  fromRemoteHousehold,
  mergeRemotePantry,
  toRemoteHousehold,
  type RemotePantryRow,
} from '../../db/syncCore';
import type { Household, PantryItem } from '../../engine/types';

const PROFILE: Household = {
  adults: 3, children: 1, cooktop: 'induction', burners: 1, diet: 'jain', allergies: ['nuts'],
  dislikes: ['karela'], equipment: ['cooker'], maxMinutesWeekday: 25, maxMinutesWeekend: 120,
  observances: ['ekadashi'], weeklyBudgetPaise: 250_000,
};

test('the profile push carries every column the pull reads, cooking time included', () => {
  const row = toRemoteHousehold(PROFILE);
  assert.equal(row.max_minutes_weekday, 25);
  assert.equal(row.max_minutes_weekend, 120);
  const pulled = PROFILE_COLUMNS.split(',').map((c) => c.trim()).sort();
  assert.deepEqual(Object.keys(row).sort(), pulled);
});

test('a pushed profile reads back unchanged', () => {
  assert.deepEqual(fromRemoteHousehold(toRemoteHousehold(PROFILE)), PROFILE);
  const { weeklyBudgetPaise: _, ...untracked } = PROFILE;
  assert.deepEqual(fromRemoteHousehold(toRemoteHousehold(untracked)), untracked);
});

const local = (id: string, quantity: number, at: number): PantryItem =>
  ({ ingredientId: id, quantity, unit: 'g', storage: 'counter', lastConfirmedAt: at });
const remote = (id: string, quantity: number, at: number): RemotePantryRow =>
  ({ ingredient_id: id, quantity, unit: 'g', storage: 'counter', last_confirmed_at: new Date(at).toISOString() });

test('a pull merges onto local edits instead of replacing them', () => {
  // Switched to a new household, then confirmed paneer before the pull landed.
  const mine = new Map([['paneer', local('paneer', 200, 5_000)]]);
  const { merged, pulled } = mergeRemotePantry(mine, [remote('rice', 900, 1_000), remote('paneer', 50, 2_000)]);
  assert.equal(pulled, 1);
  assert.equal(merged.get('paneer')?.quantity, 200);
  assert.equal(merged.get('rice')?.quantity, 900);
});

test('newer remote rows win, ties and unparseable dates keep the local row', () => {
  const mine = new Map([['atta', local('atta', 100, 1_000)], ['dal', local('dal', 300, 1_000)]]);
  const { merged, pulled } = mergeRemotePantry(mine, [
    remote('atta', 400, 2_000),
    remote('dal', 1, 1_000),
    { ...remote('dal', 2, 0), last_confirmed_at: 'garbage' },
  ]);
  assert.equal(pulled, 1);
  assert.equal(merged.get('atta')?.quantity, 400);
  assert.equal(merged.get('dal')?.quantity, 300);
});
