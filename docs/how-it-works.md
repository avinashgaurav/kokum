# How Kokum works

The product rules, how the pantry is tracked, and how groceries get in.

A pantry-aware cooking app. It works out what is actually in your kitchen from what you buy
and what you cook, then tells you what you can make tonight. When it is not sure, it asks
rather than guessing.

**Stocked. Planned. Cooked.**

## Why this exists

Every recipe app has the same failure: it tells you to cook something, and halfway through you
find out you are out of paneer. Kokum's whole job is to never do that, while still letting you
ask for a dish you do not have the ingredients for and helping you get there.

Product brief (user, problem, metrics, cost): [PRD.md](PRD.md).

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

Full rules in [AGENTS.md](../AGENTS.md). Decisions and their reasoning in [DECISIONS.md](../DECISIONS.md).

## How it knows

Four depletion mechanisms feed one confidence score, in `app/src/engine/confidence.ts`:

1. **Cook confirmation** (authoritative). "I cooked this" subtracts recipe quantities scaled to
   your household, and resets confidence because you just looked in the kitchen.
2. **Time decay.** Perishables die on a shelf-life clock. Coriander lasts 4 days in the fridge,
   palak 5, paneer 5. Confidence falls *before* the hard expiry, not after.
3. **Ambient burn.** Oil, atta and rice get used in ways nobody logs, so staples burn down at a
   learned daily rate scaled to household size.
4. **Manual correction.** Swipes and the weekly 30-second check, both of which reset confidence.

Detail in [INVENTORY.md](../INVENTORY.md).

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
pantry unreviewed. Detail in [AI-ENGINE.md](../AI-ENGINE.md).

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

## Design

Petrol teal `#0E5A50` on a cool tinted canvas. Chosen because the three-state system already
consumes green and amber, and because every Indian food app is orange, red, yellow or violet
already. Full reasoning in DECISIONS.md D-003.

The mark is "five of six": six segments, five filled. It draws the moment the product exists
for. `npm run icons` regenerates every size from the vector.
