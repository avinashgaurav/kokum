# Kokum

A pantry-aware cooking app. It works out what is actually in your kitchen from what you buy
and what you cook, then tells you what you can make tonight. When it is not sure, it asks
rather than guessing.

**Stocked. Planned. Cooked.**

## Why this exists

Every recipe app has the same failure: it tells you to cook something, and halfway through you
find out you are out of paneer. Kokum's whole job is to never do that, while still letting you
ask for a dish you do not have the ingredients for and helping you get there.

## Run it

```bash
cd app
npm install
npm start          # then scan the QR with Expo Go
```

## Verify before claiming anything works

```bash
cd app
npm run verify     # tsc --noEmit, then the engine test suite
npx expo export --platform android --output-dir dist && rm -rf dist
```

Current status: typecheck clean, 27 of 27 engine tests passing, Metro bundles 947 modules.

## The one rule

The app never asserts you have something you might not. Every dish carries a state computed by
deterministic code in `app/src/engine/dishState.ts`, never by a language model:

| State | Meaning |
|---|---|
| **Cook now** | Every core ingredient confirmed |
| **Need N items** | Cookable, and here is exactly what to buy |
| **Check first** | An ingredient has gone quiet. One tap resolves it. |

App-initiated suggestions (Today, Surprise Me) show only *Cook now*, because an unsolicited
suggestion you cannot act on is noise. When **you** ask (mood, cuisine, "I want biryani"),
everything shows, honestly labelled, with two exits: order the missing items, or order the dish.

Hard constraints (diet, allergies, equipment, cooktop) apply to both. A search may surface a
dish you lack ingredients for. It may never surface one you must not eat.

Full rules in [AGENTS.md](AGENTS.md). Decisions and their reasoning in [DECISIONS.md](DECISIONS.md).

## How it knows

Four depletion mechanisms feed one confidence score, in `app/src/engine/confidence.ts`:

1. **Cook confirmation** (authoritative). "I cooked this" subtracts recipe quantities scaled to
   your household, and resets confidence because you just looked in the kitchen.
2. **Time decay.** Perishables die on a shelf-life clock. Coriander lasts 4 days in the fridge,
   palak 5, paneer 5. Confidence falls *before* the hard expiry, not after.
3. **Ambient burn.** Oil, atta and rice get used in ways nobody logs, so staples burn down at a
   learned daily rate scaled to household size.
4. **Manual correction.** Swipes and the weekly 30-second check, both of which reset confidence.

## Layout

```
Guess/
  AGENTS.md            rules for anyone, human or model, changing this
  DECISIONS.md         every locked decision with its reasoning
  app/
    src/
      engine/          the deterministic core. No React, no I/O, fully testable.
        dishState.ts     the sacred function
        confidence.ts    depletion and confidence
        scaling.ts       household scaling. A bug here corrupts everything.
        suggest.ts       hard constraints, push/pull gate, scoring
        cook.ts          the four depletion events
        __tests__/       27 golden-set invariant tests
      data/            canonical ingredient dictionary (38), recipe corpus (14, all verified)
      screens/         Today, Pantry, Order, Setup
      components/      the mark, shared UI
      integrations/    deep-link order handoff
      theme/           design tokens
    scripts/
      build-icons.mjs  generates every icon size from one vector source
```

## Design

Petrol teal `#0E5A50` on a cool tinted canvas. Chosen because the three-state system already
consumes green and amber, and because every Indian food app is orange, red, yellow or violet
already. Full reasoning in DECISIONS.md D-003.

The mark is "five of six": six segments, five filled. It draws the moment the product exists
for. `npm run icons` regenerates every size from the vector.

## Known gaps

- **Persistence is AsyncStorage, not SQLite.** The repository shape is right, but swap in
  `expo-sqlite` before the pantry gets large.
- **Ingestion is not built.** Photo and voice capture of grocery lists is the biggest missing
  feature; today you correct the pantry by hand.
- **Deep-link URLs are unverified.** Every scheme in `integrations/order.ts` carries a
  `[VERIFY]` note. Test on a real handset before shipping.
- **The recipe corpus is 14 dishes.** Enough to prove the engine, nowhere near enough to use.
- **The icon may read as a spinner.** Open question Q-01 in DECISIONS.md. Three segments
  instead of six is the leading fix, and `Mark.tsx` takes it as a parameter.
