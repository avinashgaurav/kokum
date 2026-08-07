import test from 'node:test';
import assert from 'node:assert/strict';

import { INGREDIENT_INDEX, INGREDIENTS } from '../../data/ingredients';
import { RECIPES, RECIPE_INDEX } from '../../data/recipes';
import { suggest, passesHardConstraints } from '../suggest';
import { planWeek, withGuests, liveLeftovers, leftoverWindow } from '../plan';
import { weekInsights, rupees } from '../insights';
import { adultEquivalents } from '../scaling';
import type { CookLogEntry, Household, Leftover, PantryItem } from '../types';

const DAY = 86_400_000;
const NOW = 1_770_000_000_000;

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

function item(id: string, quantity: number, ageDays = 0): PantryItem {
  const ing = INGREDIENT_INDEX.get(id)!;
  return {
    ingredientId: id,
    quantity,
    unit: ing.unit,
    storage: ing.cls === 'perishable' ? 'fridge' : 'counter',
    lastConfirmedAt: NOW - ageDays * DAY,
  };
}

function fullPantry(): Map<string, PantryItem> {
  const m = new Map<string, PantryItem>();
  for (const ing of INGREDIENT_INDEX.values()) {
    m.set(ing.id, item(ing.id, ing.unit === 'piece' ? 24 : ing.unit === 'bunch' ? 4 : 9000));
  }
  return m;
}

const base = (pantry: Map<string, PantryItem>, household = HOUSE, cookLog: CookLogEntry[] = []) => ({
  recipes: RECIPES,
  pantry,
  ingredients: INGREDIENT_INDEX,
  household,
  cookLog,
  now: NOW,
});

// ---------------------------------------------------------------------------
// OBSERVANCES: hard filters, same class as allergies
// ---------------------------------------------------------------------------

test('no-onion-garlic excludes every allium dish in both push and pull', () => {
  const h: Household = { ...HOUSE, observances: ['no-onion-garlic'] };
  for (const kind of ['push', 'pull'] as const) {
    const results = suggest(base(fullPantry(), h), { kind, limit: 100 });
    assert.ok(results.length > 0, `${kind} returned nothing at all`);
    for (const s of results) {
      for (const ri of s.recipe.ingredients) {
        assert.ok(
          INGREDIENT_INDEX.get(ri.ingredientId)?.alliumFree !== false,
          `${kind} surfaced ${s.recipe.id}, which contains ${ri.ingredientId}`,
        );
      }
    }
  }
});

test('navratri vrat excludes grain and pulses as well as allium', () => {
  const h: Household = { ...HOUSE, observances: ['navratri'] };
  const results = suggest(base(fullPantry(), h), { kind: 'pull', limit: 100 });
  for (const s of results) {
    for (const ri of s.recipe.ingredients) {
      const ing = INGREDIENT_INDEX.get(ri.ingredientId)!;
      assert.ok(ing.alliumFree, `${s.recipe.id} contains allium ${ing.id}`);
      assert.ok(ing.vratSafe, `${s.recipe.id} contains non-vrat ${ing.id}`);
    }
  }
});

test('shravan and ekadashi force vegetarian', () => {
  for (const obs of ['shravan', 'ekadashi'] as const) {
    const h: Household = { ...HOUSE, diet: 'nonveg', observances: [obs] };
    const results = suggest(base(fullPantry(), h), { kind: 'pull', limit: 100 });
    assert.ok(results.every((s) => s.recipe.diet === 'veg'), `${obs} let a non-veg dish through`);
  }
});

test('observances stack with diet rather than replacing it', () => {
  const h: Household = { ...HOUSE, diet: 'vegan', observances: ['no-onion-garlic'] };
  const allowed = RECIPES.filter((r) => passesHardConstraints(r, INGREDIENT_INDEX, h));
  for (const r of allowed) {
    assert.ok(r.vegan, `${r.id} is not vegan`);
    for (const ri of r.ingredients) {
      assert.ok(INGREDIENT_INDEX.get(ri.ingredientId)?.alliumFree, `${r.id} contains allium`);
    }
  }
});

// ---------------------------------------------------------------------------
// WEEKLY PLAN
// ---------------------------------------------------------------------------

test('the week plans seven days and does not repeat a dish', () => {
  const plan = planWeek(base(fullPantry()), [], NOW);
  assert.equal(plan.days.length, 7);

  const ids = plan.days.map((d) => d.suggestion?.recipe.id).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, 'the same dish was planned twice');
});

test('the plan simulates depletion, so one stock of paneer is not spent twice', () => {
  // Exactly one dish worth of paneer, and everything else in abundance.
  const pantry = fullPantry();
  pantry.set('paneer', item('paneer', 200));

  const plan = planWeek(base(pantry), [], NOW);
  const paneerDishes = plan.days.filter(
    (d) =>
      d.suggestion?.assessment.state === 'cook-now' &&
      d.suggestion.recipe.ingredients.some((ri) => ri.ingredientId === 'paneer'),
  );
  assert.ok(
    paneerDishes.length <= 1,
    `planned ${paneerDishes.length} cookable paneer dishes from one 200 g block`,
  );
});

test('leftovers are eaten before anything new is planned', () => {
  const leftovers: Leftover[] = [
    {
      id: 'l1',
      recipeId: null,
      label: 'Leftover rajma',
      portions: 2,
      createdAt: NOW,
      expiresAt: NOW + DAY,
    },
  ];
  const plan = planWeek(base(fullPantry()), leftovers, NOW);
  assert.equal(plan.days[0]?.leftover?.id, 'l1');
  assert.equal(plan.days[0]?.suggestion, null);
});

test('an expired leftover is ignored rather than planned', () => {
  const stale: Leftover[] = [
    {
      id: 'old',
      recipeId: null,
      label: 'Old dal',
      portions: 2,
      createdAt: NOW - 5 * DAY,
      expiresAt: NOW - 3 * DAY,
    },
  ];
  const plan = planWeek(base(fullPantry()), stale, NOW);
  assert.ok(plan.days.every((d) => d.leftover === undefined));
  assert.equal(liveLeftovers(stale, NOW).length, 0);
});

test('the week shopping list covers what the plan will actually use', () => {
  const plan = planWeek(base(new Map()), [], NOW);
  // An empty pantry means every planned dish needs shopping.
  assert.ok(plan.shopping.length > 0, 'empty pantry produced an empty shopping list');
  assert.ok(plan.shopping.every((l) => l.needed > 0));
});

test('the plan respects weekday and weekend time limits', () => {
  const strict: Household = { ...HOUSE, maxMinutesWeekday: 20, maxMinutesWeekend: 90 };
  const plan = planWeek(base(fullPantry(), strict), [], NOW);
  for (const d of plan.days) {
    if (!d.suggestion) continue;
    const dow = new Date(d.day).getDay();
    const cap = dow === 0 || dow === 6 ? 90 : 20;
    assert.ok(
      d.suggestion.recipe.minutes <= cap,
      `${d.suggestion.recipe.id} takes ${d.suggestion.recipe.minutes} min, cap was ${cap}`,
    );
  }
});

// ---------------------------------------------------------------------------
// GUEST MODE
// ---------------------------------------------------------------------------

test('guest mode scales quantities without touching the saved profile', () => {
  const guests = withGuests(HOUSE, 4);
  assert.equal(guests.adults, 6);
  assert.equal(adultEquivalents(guests), 6);
  // The original is untouched.
  assert.equal(HOUSE.adults, 2);
});

test('guests can turn a cookable dish into one that needs shopping', () => {
  const pantry = new Map<string, PantryItem>([
    ['rice', item('rice', 200)],
    ['jeera', item('jeera', 5)],
    ['ghee', item('ghee', 15)],
    ['salt', item('salt', 4)],
  ]);

  const forTwo = suggest(base(pantry), { kind: 'push', limit: 50 });
  assert.ok(forTwo.some((s) => s.recipe.id === 'jeera-rice'));

  const forSix = suggest(base(pantry, withGuests(HOUSE, 4)), { kind: 'push', limit: 50 });
  assert.ok(!forSix.some((s) => s.recipe.id === 'jeera-rice'));
});

test('guest mode never relaxes a hard constraint', () => {
  const jain: Household = { ...HOUSE, diet: 'jain' };
  const results = suggest(base(fullPantry(), withGuests(jain, 6)), { kind: 'pull', limit: 100 });
  for (const s of results) {
    for (const ri of s.recipe.ingredients) {
      assert.ok(INGREDIENT_INDEX.get(ri.ingredientId)?.jainSafe !== false);
    }
  }
});

test('leftover wording degrades sensibly as the clock runs out', () => {
  const mk = (hours: number): Leftover => ({
    id: 'x',
    recipeId: null,
    label: 'x',
    portions: 1,
    createdAt: NOW,
    expiresAt: NOW + hours * 3_600_000,
  });
  assert.equal(leftoverWindow(mk(-1), NOW), 'past its best');
  assert.equal(leftoverWindow(mk(3), NOW), 'eat today');
  assert.equal(leftoverWindow(mk(20), NOW), 'good until tomorrow');
  assert.match(leftoverWindow(mk(70), NOW), /^good for \d+ more days$/);
});

// ---------------------------------------------------------------------------
// INSIGHTS
// ---------------------------------------------------------------------------

test('insights stay silent rather than inventing a finding from thin data', () => {
  const log: CookLogEntry[] = [{ recipeId: 'dal-tadka', at: NOW - DAY }];
  const i = weekInsights(log, RECIPE_INDEX, INGREDIENT_INDEX, new Map(), HOUSE, NOW);
  assert.equal(i.daysCooked, 1);
  assert.equal(i.headline, null, 'produced a headline from a single logged meal');
});

test('insights count distinct days, not distinct log entries', () => {
  const log: CookLogEntry[] = [
    { recipeId: 'dal-tadka', at: NOW - 3 * DAY },
    { recipeId: 'jeera-rice', at: NOW - 3 * DAY - 3600_000 },
    { recipeId: 'aloo-gobi', at: NOW - 2 * DAY },
  ];
  const i = weekInsights(log, RECIPE_INDEX, INGREDIENT_INDEX, new Map(), HOUSE, NOW);
  assert.equal(i.daysCooked, 2);
});

test('insights ignore anything older than the window', () => {
  const log: CookLogEntry[] = [
    { recipeId: 'dal-tadka', at: NOW - 30 * DAY },
    { recipeId: 'jeera-rice', at: NOW - 20 * DAY },
  ];
  const i = weekInsights(log, RECIPE_INDEX, INGREDIENT_INDEX, new Map(), HOUSE, NOW);
  assert.equal(i.daysCooked, 0);
  assert.equal(i.spentPaise, 0);
});

test('nutrition scales per adult, so a bigger household is not double counted', () => {
  const log: CookLogEntry[] = [0, 1, 2, 3].map((d) => ({
    recipeId: 'dal-tadka',
    at: NOW - d * DAY,
  }));
  const two = weekInsights(log, RECIPE_INDEX, INGREDIENT_INDEX, new Map(), HOUSE, NOW);
  const six = weekInsights(
    log,
    RECIPE_INDEX,
    INGREDIENT_INDEX,
    new Map(),
    { ...HOUSE, adults: 6 },
    NOW,
  );
  // Cooking the same dish for 6 people uses 3x the ingredients but feeds 3x the people,
  // so the per-adult figure must be roughly unchanged.
  assert.ok(
    Math.abs(two.kcalPerAdultPerDay - six.kcalPerAdultPerDay) <= 1,
    `per-adult kcal drifted with household size: ${two.kcalPerAdultPerDay} vs ${six.kcalPerAdultPerDay}`,
  );
});

test('waste is only counted for perishables that expired inside the window', () => {
  const pantry = new Map<string, PantryItem>([
    // Palak keeps 5 days in the fridge; confirmed 6 days ago, so it died 1 day ago.
    ['palak', item('palak', 300, 6)],
    // Atta is a staple with no shelf life and must never appear as waste.
    ['atta', item('atta', 5000, 40)],
    // Paneer confirmed today is still good.
    ['paneer', item('paneer', 200, 0)],
  ]);
  const i = weekInsights([], RECIPE_INDEX, INGREDIENT_INDEX, pantry, HOUSE, NOW);
  assert.deepEqual(i.wasted.map((w) => w.ingredientId), ['palak']);
  assert.ok(i.wastedPaise > 0);
});

test('every ingredient carries the data the insight and budget reads depend on', () => {
  for (const ing of INGREDIENTS) {
    assert.ok(ing.paisePerUnit > 0, `${ing.id} has no price`);
    assert.ok(ing.kcalPerUnit >= 0, `${ing.id} has a negative kcal rate`);
    assert.ok(ing.proteinPerUnit >= 0, `${ing.id} has a negative protein rate`);
    assert.equal(typeof ing.alliumFree, 'boolean', `${ing.id} missing alliumFree`);
    assert.equal(typeof ing.vratSafe, 'boolean', `${ing.id} missing vratSafe`);
  }
  // Onion and garlic are the only allium entries, and both are excluded from vrat.
  const allium = INGREDIENTS.filter((i) => !i.alliumFree).map((i) => i.id).sort();
  assert.deepEqual(allium, ['garlic', 'onion']);
  assert.ok(allium.every((id) => !INGREDIENT_INDEX.get(id)!.vratSafe));
});

test('rupee formatting stays readable across magnitudes', () => {
  assert.equal(rupees(0), 'Rs 0');
  assert.equal(rupees(4550), 'Rs 46');
  assert.equal(rupees(250_000), 'Rs 2.5k');
});
