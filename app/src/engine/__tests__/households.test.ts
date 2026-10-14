import test from 'node:test';
import assert from 'node:assert/strict';

import {
  alignLocalHousehold,
  commitSync,
  cookLogHousehold,
  maySyncWith,
  pickActiveHousehold,
  switchLocalHousehold,
  type Membership,
  type ScopedLocal,
} from '../../db/households';
import type { Household, PantryItem } from '../../engine/types';

const OWN: Membership = { householdId: 'own', name: 'My kitchen', role: 'owner', joinedAt: '2026-10-01T09:00:00+00:00' };
const JOINED: Membership = { householdId: 'joined', name: 'Amma', role: 'member', joinedAt: '2026-10-14T09:00:00+00:00' };

test('joining another household does not move the phone off its own', () => {
  assert.equal(pickActiveHousehold([JOINED, OWN], null), 'own');
});

test('an explicit choice wins while the user still belongs to it', () => {
  assert.equal(pickActiveHousehold([OWN, JOINED], 'joined'), 'joined');
});

test('a stored choice for a household the user has left falls back to their own', () => {
  assert.equal(pickActiveHousehold([OWN], 'joined'), 'own');
});

test('with no owned household, the earliest joined is used; with none at all, null', () => {
  const later: Membership = { ...JOINED, householdId: 'later', joinedAt: '2026-10-20T09:00:00+00:00' };
  assert.equal(pickActiveHousehold([later, JOINED], null), 'joined');
  assert.equal(pickActiveHousehold([], 'own'), null);
});

test('an unparseable joinedAt sorts last instead of scrambling the order', () => {
  const bad: Membership = { ...OWN, householdId: 'bad', joinedAt: 'not a date' };
  assert.equal(pickActiveHousehold([bad, OWN], null), 'own');
  assert.equal(pickActiveHousehold([OWN, bad], null), 'own');
});

const PROFILE: Household = {
  adults: 2, children: 0, cooktop: 'gas', burners: 2, diet: 'veg', allergies: [], dislikes: [],
  equipment: ['cooker'], maxMinutesWeekday: 45, maxMinutesWeekend: 90, observances: [],
};
const item = (id: string, quantity: number): PantryItem =>
  ({ ingredientId: id, quantity, unit: 'g', storage: 'counter', lastConfirmedAt: 1 });
const local = (householdId: string | null, items: PantryItem[]): ScopedLocal => ({
  householdId,
  needsPull: false,
  pantry: new Map(items.map((i) => [i.ingredientId, i])),
  household: PROFILE,
  stash: {},
  cookLog: [],
});

test('switching to a household this phone has never held empties the pantry and asks for a pull', () => {
  const next = switchLocalHousehold(local('own', [item('atta', 500)]), 'joined', { from: 'own' });
  assert.equal(next.householdId, 'joined');
  assert.equal(next.needsPull, true);
  assert.equal(next.pantry.size, 0);
  assert.deepEqual(next.stash.own?.pantry, [item('atta', 500)]);
});

test('switching back restores the first household untouched, never merged with the second', () => {
  const onJoined = switchLocalHousehold(local('own', [item('atta', 500)]), 'joined', { from: 'own' });
  const filled = commitSync(onJoined, { householdId: 'joined', pantry: new Map([['rice', item('rice', 900)]]) })!;
  const back = switchLocalHousehold(filled, 'own', { from: 'joined' });
  assert.equal(back.needsPull, false);
  assert.deepEqual([...back.pantry.keys()], ['atta']);
  assert.deepEqual(back.stash.joined?.pantry, [item('rice', 900)]);
  assert.equal(back.stash.own, undefined);
});

test('a never-synced pantry is put aside under the household the phone was on', () => {
  const next = switchLocalHousehold(local(null, [item('atta', 500)]), 'joined', { from: 'own' });
  assert.deepEqual(next.stash.own?.pantry, [item('atta', 500)]);
});

test('leaving a household drops its copy from the phone', () => {
  const onJoined = { ...local('joined', [item('rice', 900)]), stash: { own: { pantry: [item('atta', 500)], household: PROFILE } } };
  const next = switchLocalHousehold(onJoined, 'own', { from: 'joined', drop: 'joined' });
  assert.equal(next.householdId, 'own');
  assert.deepEqual([...next.pantry.keys()], ['atta']);
  assert.equal(next.stash.joined, undefined);
});

test('a sync that finishes after the phone switched household is thrown away', () => {
  const s = local('joined', [item('rice', 900)]);
  assert.equal(commitSync(s, { householdId: 'own', pantry: new Map([['atta', item('atta', 1)]]) }), null);
});

test('the first sync binds the pantry to its household and can take its profile', () => {
  const remote: Household = { ...PROFILE, adults: 4 };
  const next = commitSync(local(null, []), { householdId: 'own', pantry: new Map(), household: remote })!;
  assert.equal(next.householdId, 'own');
  assert.equal(next.household.adults, 4);
  assert.equal(next.needsPull, false);
});

const cooked = (n: number) => Array.from({ length: n }, (_, i) => ({ recipeId: `r${i}`, at: i }));

test('meals cooked before the first sync stay with the household the phone was on when it switches', () => {
  const unbound = { ...local(null, [item('atta', 500)]), cookLog: cooked(3) };
  const onShared = switchLocalHousehold(unbound, 'joined', { from: 'own' });
  assert.ok(onShared.cookLog.every((e) => e.householdId === 'own'));
  const synced = commitSync(onShared, { householdId: 'joined', pantry: new Map() })!;
  assert.ok(synced.cookLog.every((e) => cookLogHousehold(e, synced.householdId) === 'own'));
});

test('the first sync to the own household binds untagged meals to it', () => {
  const unbound = { ...local(null, []), cookLog: cooked(2) };
  const synced = commitSync(unbound, { householdId: 'own', pantry: new Map() })!;
  assert.ok(synced.cookLog.every((e) => e.householdId === 'own'));
});

test('an unbound pantry may only sync with the user\'s own household', () => {
  assert.equal(maySyncWith(null, 'own', [OWN, JOINED]), true);
  assert.equal(maySyncWith(null, 'joined', [OWN, JOINED]), false);
  assert.equal(maySyncWith('joined', 'joined', [OWN, JOINED]), true);
  assert.equal(maySyncWith('own', 'joined', [OWN, JOINED]), false);
});

test('an upgraded phone on a joined household puts its pantry aside under its own and pulls', () => {
  const upgraded = { ...local(null, [item('atta', 500)]), cookLog: cooked(1) };
  const aligned = alignLocalHousehold(upgraded, 'joined', [OWN, JOINED]);
  assert.equal(aligned.householdId, 'joined');
  assert.equal(aligned.needsPull, true);
  assert.equal(aligned.pantry.size, 0);
  assert.deepEqual(aligned.stash.own?.pantry, [item('atta', 500)]);
  assert.equal(aligned.cookLog[0]?.householdId, 'own');
});

test('aligning changes nothing when the phone is already where it should be', () => {
  const unboundOnOwn = local(null, [item('atta', 500)]);
  assert.equal(alignLocalHousehold(unboundOnOwn, 'own', [OWN, JOINED]), unboundOnOwn);
  const bound = local('joined', []);
  assert.equal(alignLocalHousehold(bound, 'joined', [OWN, JOINED]), bound);
});

test('after being removed from a household, its copy and any stale copies are dropped', () => {
  const s = {
    ...local('joined', [item('rice', 900)]),
    stash: { own: { pantry: [item('atta', 500)], household: PROFILE }, gone: { pantry: [], household: PROFILE } },
  };
  const aligned = alignLocalHousehold(s, 'own', [OWN]);
  assert.equal(aligned.householdId, 'own');
  assert.deepEqual([...aligned.pantry.keys()], ['atta']);
  assert.deepEqual(Object.keys(aligned.stash), []);
});
