import test from 'node:test';
import assert from 'node:assert/strict';

import { INGREDIENT_INDEX } from '../../data/ingredients';
import { RECIPES, RECIPE_INDEX } from '../../data/recipes';
import { assessDish } from '../dishState';
import { suggest, surpriseMe, passesHardConstraints } from '../suggest';
import { COOK_THRESHOLD, confidenceOf, projectedQuantity } from '../confidence';
import { adultEquivalents, scaleQuantity, CHILD_FACTOR } from '../scaling';
import { applyCook } from '../cook';
import type { Household, PantryItem, Recipe } from '../types';

const DAY = 86_400_000;
const NOW = 1_770_000_000_000; // fixed clock. No Date.now() in tests.

const HOUSE: Household = {
  adults: 2,
  children: 0,
  cooktop: 'gas',
  burners: 4,
  diet: 'nonveg',
  allergies: [],
  dislikes: [],
  equipment: ['cooker', 'mixer', 'kadhai', 'tawa'],
  maxMinutesWeekday: 45,
  maxMinutesWeekend: 90,
  observances: [],
};

function item(
  ingredientId: string,
  quantity: number,
  ageDays = 0,
  storage: PantryItem['storage'] = 'fridge',
): PantryItem {
  const ing = INGREDIENT_INDEX.get(ingredientId);
  assert.ok(ing, `unknown ingredient in fixture: ${ingredientId}`);
  return {
    ingredientId,
    quantity,
    unit: ing.unit,
    storage,
    lastConfirmedAt: NOW - ageDays * DAY,
  };
}

/** A pantry stocked well enough to cook everything, confirmed today. */
function fullPantry(ageDays = 0): Map<string, PantryItem> {
  const m = new Map<string, PantryItem>();
  for (const ing of INGREDIENT_INDEX.values()) {
    const qty = ing.unit === 'piece' ? 12 : ing.unit === 'bunch' ? 2 : 5000;
    m.set(ing.id, item(ing.id, qty, ageDays, ing.cls === 'perishable' ? 'fridge' : 'counter'));
  }
  return m;
}

const base = (pantry: Map<string, PantryItem>, household = HOUSE) => ({
  recipes: RECIPES,
  pantry,
  ingredients: INGREDIENT_INDEX,
  household,
  cookLog: [],
  now: NOW,
});

// ---------------------------------------------------------------------------
// THE SACRED RULE
// ---------------------------------------------------------------------------

test('push surfaces return only cook-now, across many pantry shapes', () => {
  const shapes: Map<string, PantryItem>[] = [
    fullPantry(0),
    fullPantry(3),
    fullPantry(10),
    new Map(),
  ];

  // Also try dropping each ingredient in turn from a full pantry.
  for (const id of INGREDIENT_INDEX.keys()) {
    const p = fullPantry(0);
    p.delete(id);
    shapes.push(p);
  }

  for (const pantry of shapes) {
    const results = suggest(base(pantry), { kind: 'push', limit: 100 });
    for (const s of results) {
      assert.equal(
        s.assessment.state,
        'cook-now',
        `push returned ${s.assessment.state} for ${s.recipe.id}`,
      );
    }
  }
});

test('a cook-now dish never has a core ingredient below threshold or short on quantity', () => {
  const pantry = fullPantry(2);
  for (const recipe of RECIPES) {
    const a = assessDish(recipe, pantry, INGREDIENT_INDEX, HOUSE, NOW);
    if (a.state !== 'cook-now') continue;

    const ae = adultEquivalents(HOUSE);
    for (const ri of recipe.ingredients.filter((r) => r.core)) {
      const it = pantry.get(ri.ingredientId);
      const ing = INGREDIENT_INDEX.get(ri.ingredientId);
      assert.ok(it && ing, `${recipe.id} cook-now but ${ri.ingredientId} not in pantry`);
      const have = projectedQuantity(it, ing, HOUSE, NOW);
      assert.ok(
        have >= scaleQuantity(ri.qtyPer2Adults, ae),
        `${recipe.id} cook-now but short on ${ri.ingredientId}`,
      );
      assert.ok(
        confidenceOf(it, ing, NOW) >= COOK_THRESHOLD,
        `${recipe.id} cook-now but ${ri.ingredientId} confidence below threshold`,
      );
    }
  }
});

test('need-items lists exactly the missing core ingredients, no more and no fewer', () => {
  const pantry = fullPantry(0);
  pantry.delete('paneer');
  pantry.delete('peas');

  const a = assessDish(RECIPE_INDEX.get('matar-paneer')!, pantry, INGREDIENT_INDEX, HOUSE, NOW);
  assert.equal(a.state, 'need-items');

  const got = a.missing.map((m) => m.ingredientId).sort();
  assert.deepEqual(got, ['paneer', 'peas']);
});

test('optional ingredients never change the state', () => {
  const pantry = fullPantry(0);
  // kasuri methi is optional in matar paneer.
  pantry.delete('kasuri-methi');

  const a = assessDish(RECIPE_INDEX.get('matar-paneer')!, pantry, INGREDIENT_INDEX, HOUSE, NOW);
  assert.equal(a.state, 'cook-now');
  assert.ok(a.optionalMissing.includes('kasuri-methi'));
});

test('a stale but present core ingredient produces check-first, not cook-now', () => {
  const pantry = fullPantry(0);
  // Paneer keeps 5 days in the fridge. At 4 days, confidence is 0.2, well under threshold,
  // but the quantity is still there, so this must ask rather than refuse or promise.
  pantry.set('paneer', item('paneer', 5000, 4, 'fridge'));

  const a = assessDish(RECIPE_INDEX.get('matar-paneer')!, pantry, INGREDIENT_INDEX, HOUSE, NOW);
  assert.equal(a.state, 'check-first');
  assert.ok(a.uncertain.includes('paneer'));
  assert.equal(a.missing.length, 0);
});

test('need-items takes precedence over check-first', () => {
  const pantry = fullPantry(0);
  pantry.set('paneer', item('paneer', 5000, 4, 'fridge')); // stale
  pantry.delete('peas'); // absent

  const a = assessDish(RECIPE_INDEX.get('matar-paneer')!, pantry, INGREDIENT_INDEX, HOUSE, NOW);
  assert.equal(a.state, 'need-items');
});

test('an unknown ingredient is treated as absent, never as present', () => {
  const ghost: Recipe = {
    ...RECIPE_INDEX.get('jeera-rice')!,
    id: 'ghost',
    ingredients: [{ ingredientId: 'does-not-exist', qtyPer2Adults: 1, unit: 'g', core: true }],
  };
  const a = assessDish(ghost, fullPantry(0), INGREDIENT_INDEX, HOUSE, NOW);
  assert.equal(a.state, 'need-items');
});

// ---------------------------------------------------------------------------
// PULL: shows everything, but still obeys hard constraints
// ---------------------------------------------------------------------------

test('pull surfaces dishes you cannot cook, labelled honestly', () => {
  const results = suggest(base(new Map()), { kind: 'pull', limit: 100 });
  assert.ok(results.length > 0, 'pull on an empty pantry should still return dishes');
  assert.ok(results.every((s) => s.assessment.state === 'need-items'));
  assert.ok(results.every((s) => s.assessment.missing.length > 0));
});

test('pull sorts cook-now first, then fewest missing items', () => {
  const pantry = fullPantry(0);
  pantry.delete('rajma');
  const results = suggest(base(pantry), { kind: 'pull', limit: 100 });

  const rank = { 'cook-now': 0, 'check-first': 1, 'need-items': 2 } as const;
  for (let i = 1; i < results.length; i++) {
    assert.ok(
      rank[results[i - 1]!.assessment.state] <= rank[results[i]!.assessment.state],
      'pull results are out of state order',
    );
  }
});

test('a pull never surfaces a dish the household must not eat', () => {
  const vegHouse: Household = { ...HOUSE, diet: 'veg' };
  const results = suggest(base(new Map(), vegHouse), { kind: 'pull', limit: 100 });
  assert.ok(results.every((s) => s.recipe.diet === 'veg'));
  assert.ok(!results.some((s) => s.recipe.id === 'egg-bhurji'));
});

test('allergies are absolute in both push and pull', () => {
  const dairyFree: Household = { ...HOUSE, allergies: ['dairy'] };
  for (const kind of ['push', 'pull'] as const) {
    const results = suggest(base(fullPantry(0), dairyFree), { kind, limit: 100 });
    for (const s of results) {
      const hasDairy = s.recipe.ingredients.some((ri) =>
        INGREDIENT_INDEX.get(ri.ingredientId)?.allergens.includes('dairy'),
      );
      assert.ok(!hasDairy, `${kind} surfaced ${s.recipe.id} to a dairy-allergic household`);
    }
  }
});

test('an induction-only household is never shown a gas-only dish', () => {
  const induction: Household = { ...HOUSE, cooktop: 'induction' };
  for (const kind of ['push', 'pull'] as const) {
    const results = suggest(base(fullPantry(0), induction), { kind, limit: 100 });
    assert.ok(!results.some((s) => s.recipe.cooktop === 'gas-only'));
  }
  // and the same dish is available on gas
  const gas = suggest(base(fullPantry(0), HOUSE), { kind: 'pull', limit: 100 });
  assert.ok(gas.some((s) => s.recipe.id === 'baingan-bharta'));
});

test('a jain household is never shown onion, garlic or potato', () => {
  const jain: Household = { ...HOUSE, diet: 'jain' };
  const results = suggest(base(fullPantry(0), jain), { kind: 'pull', limit: 100 });
  for (const s of results) {
    for (const ri of s.recipe.ingredients) {
      assert.ok(
        INGREDIENT_INDEX.get(ri.ingredientId)?.jainSafe !== false,
        `${s.recipe.id} contains a non-jain ingredient`,
      );
    }
  }
});

test('hard constraints are identical for push and pull', () => {
  const houses: Household[] = [
    HOUSE,
    { ...HOUSE, diet: 'veg' },
    { ...HOUSE, diet: 'jain' },
    { ...HOUSE, cooktop: 'induction' },
    { ...HOUSE, allergies: ['dairy'] },
    { ...HOUSE, equipment: ['tawa'] },
  ];
  for (const h of houses) {
    const allowed = RECIPES.filter((r) => passesHardConstraints(r, INGREDIENT_INDEX, h)).map(
      (r) => r.id,
    );
    for (const kind of ['push', 'pull'] as const) {
      const got = suggest(base(fullPantry(0), h), { kind, limit: 100 });
      for (const s of got) {
        assert.ok(allowed.includes(s.recipe.id), `${kind} leaked ${s.recipe.id}`);
      }
    }
  }
});

// ---------------------------------------------------------------------------
// SCALING: a bug here silently corrupts the whole pantry
// ---------------------------------------------------------------------------

test('adult equivalents count a child at 0.6', () => {
  assert.equal(adultEquivalents({ adults: 2, children: 0 }), 2);
  assert.equal(adultEquivalents({ adults: 2, children: 1 }), 2 + CHILD_FACTOR);
  assert.equal(adultEquivalents({ adults: 1, children: 2 }), 1 + 2 * CHILD_FACTOR);
});

test('recipe quantities scale linearly from the per-2-adult base', () => {
  assert.equal(scaleQuantity(200, 2), 200);
  assert.equal(scaleQuantity(200, 4), 400);
  assert.equal(scaleQuantity(200, 1), 100);
  // 2 adults + 1 child = 2.6 AE -> 200 * 1.3
  assert.equal(scaleQuantity(200, 2.6), 260);
});

test('a bigger household needs more, and can fall short where a smaller one does not', () => {
  const pantry = new Map<string, PantryItem>();
  // Exactly enough jeera rice for 2 adults.
  pantry.set('rice', item('rice', 200, 0, 'counter'));
  pantry.set('jeera', item('jeera', 5, 0, 'counter'));
  pantry.set('ghee', item('ghee', 15, 0, 'counter'));
  pantry.set('salt', item('salt', 4, 0, 'counter'));

  const rice = RECIPE_INDEX.get('jeera-rice')!;
  const two = assessDish(rice, pantry, INGREDIENT_INDEX, HOUSE, NOW);
  assert.equal(two.state, 'cook-now');

  const four: Household = { ...HOUSE, adults: 4 };
  const forFour = assessDish(rice, pantry, INGREDIENT_INDEX, four, NOW);
  assert.equal(forFour.state, 'need-items');
});

// ---------------------------------------------------------------------------
// DEPLETION
// ---------------------------------------------------------------------------

test('cooking subtracts scaled quantities and resets confidence', () => {
  let pantry = new Map<string, PantryItem>();
  pantry.set('rice', item('rice', 1000, 0, 'counter'));
  pantry.set('jeera', item('jeera', 100, 0, 'counter'));
  pantry.set('ghee', item('ghee', 200, 0, 'counter'));
  pantry.set('salt', item('salt', 200, 0, 'counter'));

  pantry = applyCook(RECIPE_INDEX.get('jeera-rice')!, pantry, INGREDIENT_INDEX, HOUSE, NOW);

  // jeera rice is 200 g rice per 2 adults, and HOUSE is 2 adults.
  assert.equal(pantry.get('rice')!.quantity, 800);
  assert.equal(pantry.get('jeera')!.quantity, 95);
  assert.equal(pantry.get('rice')!.lastConfirmedAt, NOW);
  assert.equal(confidenceOf(pantry.get('rice')!, INGREDIENT_INDEX.get('rice')!, NOW), 1);
});

test('cooking scales the subtraction to the household', () => {
  const four: Household = { ...HOUSE, adults: 2, children: 2 }; // 3.2 AE
  let pantry = new Map<string, PantryItem>([
    ['rice', item('rice', 1000, 0, 'counter')],
    ['jeera', item('jeera', 100, 0, 'counter')],
    ['ghee', item('ghee', 200, 0, 'counter')],
    ['salt', item('salt', 200, 0, 'counter')],
  ]);
  pantry = applyCook(RECIPE_INDEX.get('jeera-rice')!, pantry, INGREDIENT_INDEX, four, NOW);
  // 200 g * (3.2 / 2) = 320
  assert.equal(pantry.get('rice')!.quantity, 680);
});

test('cooking against an already-exhausted staple clamps at zero, never negative', () => {
  // 1 kg of rice, last confirmed 20 days ago, burns 70 g per adult per day for 2 adults,
  // so the projection is already zero before the cook is applied.
  let pantry = new Map<string, PantryItem>([['rice', item('rice', 1000, 20, 'counter')]]);
  assert.equal(
    projectedQuantity(pantry.get('rice')!, INGREDIENT_INDEX.get('rice')!, HOUSE, NOW),
    0,
  );
  pantry = applyCook(RECIPE_INDEX.get('jeera-rice')!, pantry, INGREDIENT_INDEX, HOUSE, NOW);
  assert.equal(pantry.get('rice')!.quantity, 0);
});

test('unverified recipes are excluded from depletion math', () => {
  const unverified: Recipe = { ...RECIPE_INDEX.get('jeera-rice')!, id: 'x', verified: false };
  const pantry = new Map<string, PantryItem>([['rice', item('rice', 1000, 0, 'counter')]]);
  const after = applyCook(unverified, pantry, INGREDIENT_INDEX, HOUSE, NOW);
  assert.equal(after.get('rice')!.quantity, 1000);
});

test('perishables reach zero at their shelf life and stop backing suggestions', () => {
  const palak = INGREDIENT_INDEX.get('palak')!;
  const fresh = item('palak', 300, 0, 'fridge');
  const dead = item('palak', 300, 5, 'fridge'); // fridge life is 5 days

  assert.equal(projectedQuantity(fresh, palak, HOUSE, NOW), 300);
  assert.equal(projectedQuantity(dead, palak, HOUSE, NOW), 0);
  assert.equal(confidenceOf(dead, palak, NOW), 0);
});

test('staples burn down at a learned rate scaled to household size', () => {
  const atta = INGREDIENT_INDEX.get('atta')!; // 80 g per adult per day
  const it = item('atta', 5000, 10, 'counter');

  assert.equal(projectedQuantity(it, atta, { adults: 2, children: 0 }, NOW), 5000 - 80 * 2 * 10);
  assert.equal(projectedQuantity(it, atta, { adults: 4, children: 0 }, NOW), 5000 - 80 * 4 * 10);
  // never negative
  assert.equal(projectedQuantity(item('atta', 100, 90, 'counter'), atta, HOUSE, NOW), 0);
});

// ---------------------------------------------------------------------------
// SURPRISE ME
// ---------------------------------------------------------------------------

test('surprise me is deterministic and only ever returns cook-now', () => {
  const input = base(fullPantry(0));
  for (let seed = 0; seed < 25; seed++) {
    const a = surpriseMe(input, seed);
    const b = surpriseMe(input, seed);
    assert.deepEqual(a?.recipe.id, b?.recipe.id, 'same seed produced different dishes');
    if (a) assert.equal(a.assessment.state, 'cook-now');
  }
});

test('surprise me returns null rather than something uncookable', () => {
  assert.equal(surpriseMe(base(new Map()), 1), null);
});

// ---------------------------------------------------------------------------
// CORPUS SANITY
// ---------------------------------------------------------------------------

test('every recipe ingredient resolves, and units match the dictionary', () => {
  for (const r of RECIPES) {
    assert.ok(r.ingredients.some((i) => i.core), `${r.id} has no core ingredients`);
    for (const ri of r.ingredients) {
      const ing = INGREDIENT_INDEX.get(ri.ingredientId);
      assert.ok(ing, `${r.id} references unknown ingredient ${ri.ingredientId}`);
      assert.equal(ri.unit, ing.unit, `${r.id}/${ri.ingredientId} unit disagrees with dictionary`);
      assert.ok(ri.qtyPer2Adults > 0, `${r.id}/${ri.ingredientId} has a non-positive quantity`);
    }
  }
});

test('recipe diet flags agree with their ingredients', () => {
  for (const r of RECIPES) {
    const hasEgg = r.ingredients.some((i) => i.ingredientId === 'egg');
    if (hasEgg) assert.notEqual(r.diet, 'veg', `${r.id} contains egg but is marked veg`);

    if (r.vegan) {
      for (const ri of r.ingredients) {
        assert.ok(
          INGREDIENT_INDEX.get(ri.ingredientId)?.vegan,
          `${r.id} is marked vegan but contains ${ri.ingredientId}`,
        );
      }
    }
    if (r.jainSafe) {
      for (const ri of r.ingredients) {
        assert.ok(
          INGREDIENT_INDEX.get(ri.ingredientId)?.jainSafe,
          `${r.id} is marked jainSafe but contains ${ri.ingredientId}`,
        );
      }
    }
  }
});
