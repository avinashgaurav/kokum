# Inventory: how Kokum knows what is in your kitchen

The hardest part of the product, and the thing every other feature depends on. If this model
is wrong, the suggestions are wrong, the shopping list is wrong, and the app is worse than
useless because it is confidently wrong.

Code: `app/src/engine/confidence.ts`, `app/src/engine/cook.ts`, `app/src/engine/scaling.ts`.

---

## The item

```ts
PantryItem {
  ingredientId      // canonical; "tamatar" / "टमाटर" / "Tomatoes 1kg" all resolve here
  quantity, unit    // normalised to g / ml / piece / bunch
  storage           // counter | fridge | freezer, which changes shelf life
  lastConfirmedAt   // the load-bearing field: everything decays from here
}
```

`lastConfirmedAt` is not a modification timestamp. It means **the last moment a human looked
at their kitchen and this was true**. Every write that represents a real observation must
push it forward; no other write may.

---

## Four depletion mechanisms

### 1. Cook confirmation (authoritative)

Tapping *I cooked this* subtracts the recipe's ingredient quantities, scaled to the household,
and resets confidence to 1.0 on everything it touched. This is the highest-quality signal in
the system: the user was standing in the kitchen holding the ingredients.

Unverified recipes are skipped entirely (`applyCook` returns early). A wrong subtraction is
worse than no subtraction, because it is invisible.

### 2. Time decay (perishables)

Perishables die whether or not you cook them. Each ingredient carries a shelf life per storage
location: coriander 4 days in the fridge, palak 5, paneer 5, milk 3, onion 30.

```
projectedQuantity = daysSinceConfirmed >= shelfLife ? 0 : quantity
confidence        = clamp(1 - daysSinceConfirmed / shelfLife, 0, 1)
```

Note that confidence falls *across* the shelf life rather than at the end of it. Paneer
confirmed four days ago still has quantity but sits at 0.2 confidence, so it triggers
*Check first* rather than backing a promise. That gap is deliberate: it is the difference
between asking one question and telling someone to start cooking a dish they cannot finish.

Shelf lives are set conservatively. Calling coriander dead a day early costs a wasted bunch;
calling it alive a day late costs trust in the whole app.

### 3. Ambient burn (staples)

Oil, atta, rice and salt get used in ways nobody logs: a spoon here, a handful there. Modelling
these only through cook confirmations would leave a 5 kg bag of atta reading full forever.

```
projectedQuantity = max(0, quantity - burnPerAdultPerDay * adultEquivalents * days)
confidence        = clamp(1 - days / 90, 0.2, 1)
```

Atta burns at 80 g per adult per day, rice at 70, oil at 25 ml. A three-person household gets
through 5 kg of atta in about three weeks, which matches how often people actually buy it.

Staple confidence decays slowly to a 0.2 floor rather than to zero, because "there is probably
still some atta" stays a reasonable bet for a long time.

### 4. Manual correction

Swipe to mark finished, or the weekly check. Both reset `lastConfirmedAt`, which is the whole
point: they are observations, not edits.

---

## The confidence guard

```
COOK_THRESHOLD      = 0.75    we will vouch for it
UNCERTAIN_THRESHOLD = 0.55    below this we actively want to ask
```

Every recipe ingredient is tagged **core** or **optional**. The guard does not hide dishes; it
computes which of the three states a dish is in:

| Condition on core ingredients | State |
|---|---|
| All present in sufficient quantity, all above 0.75 | **Cook now** |
| One or more short on quantity | **Need N items**, each named |
| All present, one or more below 0.75 | **Check first** |

`need-items` beats `check-first`. If something is definitely absent, that is the more
actionable truth, and asking about the paneer when you are also out of onions wastes the tap.

Optional ingredients never change the state. They surface as *"without kasuri methi, which is
fine"*.

---

## Par levels and the shopping list

Each ingredient has a `parPerAdult`: the stock level a household of that size should keep.
When projected quantity falls below half of par, the gap goes onto the Next order list with
the quantity needed to get back to par.

The weekly plan (`app/src/engine/plan.ts`) extends this: it plans seven days, subtracting each
planned dish from a working copy of the pantry before planning the next, then computes the
shortfall against the whole week. This is why the same 200 g of paneer is never scheduled
twice, and it is the thing par levels exist for.

---

## Drift and the weekly check

The model will drift. Someone eats leftovers, a guest cooks, half a bag of onions goes soft
unnoticed. The correction mechanism is `weeklyCheckQueue`: the eight lowest-confidence items
with quantity remaining, one tap each, Yes / Running low / All finished / Skip.

Eight and not eighty. The whole reason every pantry app in history has died is data-entry
burden, so the correction pass is bounded by attention span rather than by completeness.

---

## Scaling

```
CHILD_FACTOR = 0.6
adultEquivalents = adults + children * 0.6
scaleQuantity(qtyPer2Adults, ae) = qtyPer2Adults * (ae / 2)
```

Recipe quantities are stored **per 2 adults, always**, and scaled at read time. Never store a
pre-scaled quantity: it becomes meaningless the moment someone changes the household size.

Guest mode (`withGuests`) returns a temporarily scaled household rather than mutating the
saved profile, so "four extra people tonight" rescales every quantity and shortfall without
permanently changing anything.

A scaling bug here silently corrupts the entire pantry and stays invisible until someone is
told to cook something they cannot. Any change to `scaling.ts` needs a worked example in the
PR and a passing drift simulation.

---

## Test coverage

`app/src/engine/__tests__/invariant.test.ts` and `features.test.ts`, 48 tests. The ones that
matter most here:

- perishables reach zero at their shelf life and stop backing suggestions
- staples burn down at a rate that scales with household size, and never go negative
- cooking subtracts scaled quantities and resets confidence
- cooking an already-exhausted staple clamps at zero
- unverified recipes are excluded from depletion math
- a bigger household needs more, and can fall short where a smaller one does not
- the week plan does not spend one stock of paneer twice

---

## Known gaps

- **Par levels are seeded, not learned.** The plan was to tune them from observed restock
  cadence. Today they are static per-ingredient defaults scaled by household size.
- **Burn rates are the same for every household.** They should adapt from how often each
  household actually restocks. The hook for this is the drift signal from the weekly check,
  which is not yet recorded.
- **No storage inference.** Items land in fridge or counter based on their class, not on
  where the user actually put them, which matters because it changes shelf life.
