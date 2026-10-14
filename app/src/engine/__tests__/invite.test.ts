import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INVITE_ALPHABET,
  INVITE_LENGTH,
  formatInviteCode,
  normalizeInviteCode,
  parseInviteCode,
} from '../../db/inviteCode';

test('invite alphabet is 32 symbols with no I, L, O or U', () => {
  assert.equal(INVITE_ALPHABET.length, 32);
  assert.equal(new Set(INVITE_ALPHABET).size, 32);
  for (const ch of 'ILOU') assert.ok(!INVITE_ALPHABET.includes(ch), ch);
});

test('a code typed loosely normalises to the canonical form', () => {
  assert.equal(normalizeInviteCode(' qy7nw-ltc8s '), 'QY7NW1TC8S');
  assert.equal(normalizeInviteCode('o0 Ii Ll'), '001111');
  assert.equal(parseInviteCode('qy7nw ltc8s'), 'QY7NW1TC8S');
});

test('anything that cannot be a code is rejected before a round trip', () => {
  assert.equal(parseInviteCode(''), null);
  assert.equal(parseInviteCode('QY7NW1TC8'), null, 'too short');
  assert.equal(parseInviteCode('QY7NW1TC8SX'), null, 'too long');
  assert.equal(parseInviteCode('QY7NW1TC8U'), null, 'U is not in the alphabet');
  assert.equal(parseInviteCode('QY7NW1TC8!'), null);
  // The old flow asked people to type a household uuid. That must not look like a code.
  assert.equal(parseInviteCode('9b2f7c1e-4a3d-4e5f-8a9b-0c1d2e3f4a5b'), null);
});

test('display form splits the code in two and survives a round trip', () => {
  const shown = formatInviteCode('QY7NW1TC8S');
  assert.equal(shown, 'QY7NW-1TC8S');
  assert.equal(parseInviteCode(shown), 'QY7NW1TC8S');
  assert.equal(shown.replace('-', '').length, INVITE_LENGTH);
});
