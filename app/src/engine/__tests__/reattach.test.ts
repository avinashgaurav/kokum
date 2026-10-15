import test from 'node:test';
import assert from 'node:assert/strict';

import { RECIPE_INDEX } from '../../data/recipes';
import { reattach } from '../../ai/reattach';
import type { DishState, Suggestion } from '../types';

function sug(id: string, state: DishState): Suggestion {
  const recipe = RECIPE_INDEX.get(id);
  assert.ok(recipe, `unknown recipe in fixture: ${id}`);
  return {
    recipe,
    assessment: { recipeId: id, state, missing: [], uncertain: [], optionalMissing: [] },
    score: 0,
    reason: `deterministic ${id}`,
  };
}

// The deterministic order for a pull: cook-now, then check-first, then need-items.
const SUGGESTIONS = [
  sug('dal-tadka', 'cook-now'),
  sug('jeera-rice', 'cook-now'),
  sug('phulka', 'cook-now'),
  sug('veg-pulao', 'cook-now'),
  sug('palak-paneer', 'check-first'),
  sug('matar-paneer', 'need-items'),
  sug('besan-chilla', 'need-items'),
  sug('kanda-poha', 'need-items'),
];

// The hostile reply from the eval (evals/results, reattachAdversarial): an invented id,
// a need-items dish ranked first with an over-long reason, a duplicate, and a cook-now
// dish (dal-tadka) left out entirely.
const HOSTILE = [
  { recipeId: 'butter-chicken', reason: 'You have chicken.' },
  { recipeId: 'kanda-poha', reason: 'x'.repeat(250) },
  { recipeId: 'kanda-poha', reason: 'duplicate' },
  { recipeId: 'jeera-rice', reason: 'ok' },
  { recipeId: 'phulka', reason: 'ok' },
  { recipeId: 'veg-pulao', reason: 'ok' },
  { recipeId: 'palak-paneer', reason: 'ok' },
  { recipeId: 'matar-paneer', reason: 'ok' },
  { recipeId: 'besan-chilla', reason: 'ok' },
];

test('reattach: a hostile reply cannot rank a dish you cannot cook above one you can', () => {
  const out = reattach(SUGGESTIONS, HOSTILE);
  const ids = out.map((r) => r.suggestion.recipe.id);
  const states = out.map((r) => r.suggestion.assessment.state);

  assert.ok(!ids.includes('butter-chicken'), 'invented id must be dropped');
  assert.equal(ids.length, SUGGESTIONS.length, 'every dish exactly once');
  assert.deepEqual([...ids].sort(), SUGGESTIONS.map((s) => s.recipe.id).sort());

  const firstNotCook = states.findIndex((s) => s !== 'cook-now');
  assert.ok(states.slice(firstNotCook).every((s) => s !== 'cook-now'), `cook-now must come first: ${ids.join(',')}`);
  const firstNeed = states.indexOf('need-items');
  assert.ok(states.slice(firstNeed).every((s) => s === 'need-items'), 'check-first before need-items');

  // The model's order still applies within a state, and the omitted cook-now dish
  // returns to its own group rather than the bottom of the list.
  assert.deepEqual(ids.slice(0, 4), ['jeera-rice', 'phulka', 'veg-pulao', 'dal-tadka']);
  assert.deepEqual(ids.slice(5), ['kanda-poha', 'matar-paneer', 'besan-chilla']);

  const poha = out.find((r) => r.suggestion.recipe.id === 'kanda-poha')!;
  assert.equal(poha.reason, 'deterministic kanda-poha', 'over-long reason falls back');
  const dal = out.find((r) => r.suggestion.recipe.id === 'dal-tadka')!;
  assert.equal(dal.reason, 'deterministic dal-tadka', 'omitted dish keeps its own sentence');
});

test('reattach: a well-behaved reply keeps the model order and sentences', () => {
  const ranked = SUGGESTIONS.map((s) => ({ recipeId: s.recipe.id, reason: `model ${s.recipe.id}` })).reverse();
  const out = reattach(SUGGESTIONS, ranked);
  // Within cook-now the model reversed the order; that is allowed.
  assert.deepEqual(
    out.slice(0, 4).map((r) => r.suggestion.recipe.id),
    ['veg-pulao', 'phulka', 'jeera-rice', 'dal-tadka'],
  );
  assert.ok(out.every((r) => r.reason.startsWith('model ')));
});
