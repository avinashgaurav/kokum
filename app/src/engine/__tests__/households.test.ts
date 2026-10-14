import test from 'node:test';
import assert from 'node:assert/strict';

import { pickActiveHousehold, type Membership } from '../../db/households';

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
