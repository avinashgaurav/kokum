# Kokum

A pantry-aware cooking app. It works out what is actually in your kitchen from what you buy
and what you cook, then tells you what you can make tonight. When it is not sure, it asks
rather than guessing.

**Stocked. Planned. Cooked.**

## Why this exists

Every recipe app has the same failure: it tells you to cook something, and halfway through you
find out you are out of paneer. Kokum's whole job is to never do that, while still letting you
ask for a dish you do not have the ingredients for and helping you get there.

Product brief (user, problem, metrics, cost): [docs/PRD.md](docs/PRD.md).

## Why AI here, why code there

| Step | Done by | Why |
|---|---|---|
| Read a bill, list or shelf photo, or a spoken list, into pantry lines | Model (`app/src/ai/parse.ts`) | Handwriting, Hinglish and messy invoices are a language problem. Code then drops any ingredient id not in the dictionary, and a person confirms every line. |
| Decide Cook now, Need N items or Check first | Code (`app/src/engine/dishState.ts`) | A wrong answer sends you to the stove without paneer. It must be deterministic and tested. |
| Diet, allergy, cooktop and fasting filters; depletion and scaling | Code (`app/src/engine/`) | Hard rules and arithmetic are never a judgment call. |
| Order the shortlist and write one sentence per dish | Model (`app/src/ai/rerank.ts`) | Tone and context are what a model is good at. Code drops any recipe id the model invents, re-adds any dish it skipped, and reattaches the state this device computed. |

## Run it

```bash
cd app
npm install
npm start          # then scan the QR with Expo Go
```

Optional: paste a Claude API key in Setup to turn on photo and voice capture. Optional: add
Supabase credentials to `.env` (see `.env.example`) to share a pantry across phones. Neither
is needed for the app to work.

## Verify before claiming anything works

```bash
cd app
npm run verify     # tsc --noEmit, then the engine test suite
npx expo export --platform android --output-dir dist && rm -rf dist
```

The SQL checks run the migration in PGlite (Postgres in WASM) as the `authenticated` role:

```bash
cd supabase/tests && npm install && npm test && rm -rf node_modules
```

Current status (re-run 2026-10-14): typecheck clean, **73 of 73 tests passing**, **54 of 54 SQL
checks passing**, Metro bundles 1138 modules.

## Status

Pre-release. Not yet run on a physical device. The AI layer (parsing and reranking) has no
eval yet; only the deterministic engine is tested. Free-text mood mapping (`interpretMood` in
`app/src/ai/rerank.ts`) is written but no screen calls it yet. The Supabase migration has still
not been applied to a live project. Details under Known gaps below.

## Sharing a pantry (optional)

With Supabase configured, two phones can share one household:

- **Invite.** An owner creates a one-use code in Setup, for a member or a cook (never an
  owner). Codes last 7 days by default, at most 30, and a household can hold 20 open codes.
- **Join.** The other person enters the code in Setup. Joining never moves them: their phone
  stays on their own household until they choose to switch, and Setup asks first.
- **Switch.** Setup lists every household the account belongs to. Each household keeps its own
  pantry on the phone, so switching swaps pantries instead of merging them.
- **Leave.** "Leave this household" asks first, then returns the phone to the user's own
  household. A sole owner cannot leave or be demoted.

Rules and reasoning in DECISIONS D-013 to D-015; the database side is checked in PGlite
(`supabase/tests/rls.mjs`).

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

Hard constraints (diet, allergies, equipment, cooktop, fasting observances) apply to both. A
search may surface a dish you lack ingredients for. It may never surface one you must not eat.

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

Detail in [INVENTORY.md](INVENTORY.md).

## Getting groceries in

One parser, four sources, because a bill, a handwritten list, a shelf photo and a spoken list
are the same extraction problem in different clothes:

| Source | Accuracy |
|---|---|
| **Photo of the bill** | Best. Exact items, quantities and prices. |
| **Photo of a list** | Good. Any script, but quantities are often missing. |
| **Photo of the shelf** | Fair. What is visible, never how much. The prompt caps confidence at 0.6 (an instruction to the model, not enforced in code). |
| **Voice** | Good. Uses your keyboard's own microphone, so Hinglish works as well as your phone does. |

Every path lands on a confirmation screen with editable quantity steppers. Nothing reaches the
pantry unreviewed. Detail in [AI-ENGINE.md](AI-ENGINE.md).

## Layout

```
kokum/
  AGENTS.md            rules for anyone, human or model, changing this
  DECISIONS.md         every locked decision with its reasoning
  INVENTORY.md         the depletion and confidence model
  AI-ENGINE.md         deterministic layer, Claude layer, and the boundary between them
  INTEGRATIONS.md      what is actually possible with Zepto, Blinkit, Swiggy and Zomato
  DATA-MODEL.md        local store, Supabase schema, sync rules, privacy
  docs/PRD.md          product brief: user, problem, metrics, cost per task
  supabase/migrations/ schema with row-level security, plus generated seed data
  supabase/tests/      PGlite checks of the RLS policies, triggers and join_household()
  app/
    src/
      engine/          deterministic core. No React, no I/O, fully testable.
        dishState.ts     the sacred function
        confidence.ts    depletion and confidence
        scaling.ts       household scaling. A bug here corrupts everything.
        suggest.ts       hard constraints, push/pull gate, scoring
        cook.ts          the four depletion events
        plan.ts          weekly plan, leftovers, guest mode
        insights.ts      nutrition, spend and waste for the week
        __tests__/       48 engine tests (invariant, features), 25 household, invite and sync tests
      ai/              Claude: parsing, reranking, mood interpretation (not yet wired)
      db/              Supabase client, pantry sync, households and invite codes
      store/           local state and AsyncStorage persistence
      data/            ingredient dictionary (37), recipe corpus (14, all verified)
      screens/         Today, Week, Pantry, Capture, Order, Setup (SettingsScreen.tsx)
      components/      the mark, shared UI
      integrations/    deep-link order handoff
      theme/           design tokens
    scripts/
      build-icons.mjs  every icon size from one vector source
      gen-seed.ts      projects the TS dictionary into seed SQL
```

## Design

Petrol teal `#0E5A50` on a cool tinted canvas. Chosen because the three-state system already
consumes green and amber, and because every Indian food app is orange, red, yellow or violet
already. Full reasoning in DECISIONS.md D-003.

The mark is "five of six": six segments, five filled. It draws the moment the product exists
for. `npm run icons` regenerates every size from the vector.

## Known gaps

- **Nothing has been tested on a physical device.** The deep-link URL schemes in
  `integrations/order.ts` all carry `[VERIFY]` and have never been tapped on a real handset.
- **The Supabase migration has never been applied to a live project.** The RLS policies and
  the invite flow are written, reviewed and exercised in PGlite as the `authenticated` role,
  and unverified against real Supabase.
- **Persistence is AsyncStorage, not SQLite.** Fine at 40 pantry rows, wrong at 400.
- **The recipe corpus is 14 dishes.** Enough to prove the engine, nowhere near enough to use
  daily. Getting to ~500 without flipping `verified` in bulk is the next real milestone.
- **Par levels and burn rates do not learn.** They are static defaults scaled by household size.
- **No home-screen widget.** WidgetKit and Glance need native code and cannot run in Expo Go,
  so this needs a development build before it can even be attempted.
- **Leftovers, meal plans and captures do not sync.** The tables exist; the sync does not touch
  them yet.
- **The icon may read as a spinner.** Open question Q-01. `Mark.tsx` takes segment count as a
  parameter, so trying three is a one-line change.
