# Kokum: decision log

Every locked decision, with the reasoning. Append, never rewrite. If a decision is reversed,
strike it and add a new entry below with the date and the reason.

---

## D-001 · Product name: Kokum
**Date:** 2026-08-07 · **Status:** Locked

The Konkan coast's souring fruit, base of sol kadhi. Short, distinctive, easy to say, almost
certainly unclaimed as an app name, reads well outside India without losing its identity.

Considered and rejected: 20 alternatives across Mumbai street food (Bhel, Vada, Pav, Bhaji,
Misal, Batata, Poha, Frankie, Maska, Chaat) and the Konkan coast (Surmai, Solkadhi, Malvani,
Koliwada, Gassi, Kalvan, Ambot, Bombil, Sanna).

**Important constraint attached to this decision:** the name does NOT drive the design system.
An earlier revision derived the palette from the fruit's colour and drew the icon as a literal
kokum. That was wrong. A name is a label. See D-003.

---

## D-002 · Ordering integration: deep-link handoff
**Date:** 2026-08-07 · **Status:** Locked

None of Zepto, Blinkit, Swiggy Instamart, Swiggy or Zomato expose a public ordering or
cart-building API, and there is no partner programme a solo app can join. Anything that appears
to build carts programmatically is calling private endpoints, which breaks their terms of
service, breaks on every one of their releases, and risks the user's account.

Deep-link handoff is the only ToS-safe path. Built behind an `OrderProvider` interface so a real
partner API can be dropped in per platform later. Full analysis in `INTEGRATIONS.md`.

---

## D-003 · Design system: Route B, "Deep water"
**Date:** 2026-08-07 · **Status:** Locked

Petrol teal `#0E5A50` on a cool tinted canvas. Parents: Wise's structure (tinted canvas, rounded
white cards, numerals-forward) crossed with Starbucks' warmth.

Chosen against three alternatives (Route A "Quiet tool", ink-only with zero brand colour;
Route C "Appetite", ghee cream and chilli brick). Four constraints drove it, none of them
related to the name:

1. **The three-state system consumes green and amber.** Cook now, Need N items and Check first
   are load-bearing semantic colours, so the brand accent cannot be green or amber.
2. **The competitive shelf is saturated.** Swiggy orange, Zomato red, Blinkit yellow, BigBasket
   green, Zepto violet. Petrol teal is the only saturated hue left unclaimed in the category.
3. **Two opposite screens.** Today is photo-led and emotional; Pantry is a 60-row ledger. Wise's
   structure handles the ledger, which is where users actually spend time.
4. **7pm, kitchen, one hand.** Light canvas, 48px targets minimum.

Noted at decision time: teal can tip clinical, so the canvas must stay warm and the food
photography generous. Watch for this in review.

---

## D-004 · Depletion model: confirm-cook plus decay
**Date:** 2026-08-07 · **Status:** Locked

Tapping "I cooked this" subtracts recipe quantities scaled by covers. Perishables decay on a
shelf-life clock. Staples burn down at a learned daily rate. A 30-second weekly check corrects
drift. Full model in `INVENTORY.md`.

Rejected: fully automatic (drift compounds fast, produces the exact failure the product exists
to prevent) and manual-only (every pantry app in history has died from data-entry burden).

---

## D-005 · The core invariant: honest labelling, not suppression
**Date:** 2026-08-07 · **Status:** Locked · **Supersedes an earlier, wrong version**

The original wording was "never suggest a dish whose core ingredients are not confirmed
present." That was too blunt: sometimes you want a dish you don't have the ingredients for, and
the app's job is then to get you there, not to hide it.

Corrected invariant: **the app never asserts you have something you might not.** Every dish
carries a state computed in code. App-initiated suggestions show only Cook now. User-initiated
requests show everything, honestly labelled. See `AGENTS.md`.

---

## D-006 · App icon: mark 09, "five of six"
**Date:** 2026-08-07 · **Status:** Locked

Six segments around a ring, five in petrol, one in pale. Encodes the product's core moment: you
have almost everything, and here is the one thing you do not.

Chosen from ten premium marks in the Route B language (jar, bowl, tapered vessel, nested arcs,
split circle, lid, measuring cup, gauge ring, five of six, moon-phase fill).

**Open risk to resolve in production art:** a segmented ring is one visual step away from a
loading spinner. Mitigations are still to be written up; tracked as open question Q-01.

---

## D-007 · Tagline: "Stocked. Planned. Cooked."
**Date:** 2026-08-07 · **Status:** Locked

25 of 30 characters, so it fits the App Store subtitle ceiling with room to spare.

Three beats naming the three tabs, which makes it descriptive and immediately clear. Noted
honestly at decision time: it explains the app rather than making someone want it, so the
marketing site and store screenshots have to carry the desire that the line does not.

Useful consequence: the three beats and the icon can reinforce each other. See open
question Q-01 about reducing the mark from six segments to three.

---

## D-008 · Stack: Expo, TypeScript, React Native, local-first SQLite
**Date:** 2026-08-07 · **Status:** Locked

Matches the owner's existing working Expo setup from an earlier app. Local-first via `expo-sqlite`;
the app must be fully usable with no network. Cloud sync is opt-in and only needed for household
sharing.

---

## Open questions

| # | Question | Blocking |
|---|---|---|
| Q-01 | Does the six-segment mark read as a spinner in a real home-screen test? Three segments instead? | Phase 0 art |
| Q-02 | Recipe corpus: LLM-generate then verify, or license an existing structured dataset? | Phase 0 |
| Q-03 | Which OCR path for bill import: on-device Vision framework, or cloud with text-only egress? | Phase 1 |
| Q-04 | Is a brand line needed separately from the store subtitle? ("Cook with certainty." was the runner-up.) | Not blocking |
| Q-05 | Do the deep-link URL schemes in `INTEGRATIONS.md` still resolve on a real device? | Phase 2 |

---

## D-009 · Database: Supabase, additive to a local-first core
**Date:** 2026-08-07 · **Status:** Locked · **Supersedes the SQLite half of D-008**

Postgres with row-level security, used for exactly one thing: letting two phones share a
pantry. The device stays the source of truth. Every screen renders from local state and every
engine call runs offline, so the app is fully usable with no account and no network.

Sync is last-write-wins per row on `last_confirmed_at`. That is the correct rule for this
data, not a shortcut: a pantry row means "the last time a human looked, this was true", and
two people cannot both be right about how much atta is in the jar.

Note that D-008 said local SQLite. Local persistence is currently AsyncStorage, which is a
stopgap for both: it is fine at 40 pantry rows and wrong at 400. See DATA-MODEL.md.

---

## D-010 · Voice input: keyboard dictation, not a speech-recognition module
**Date:** 2026-08-07 · **Status:** Locked

The capture screen offers a text field and tells the user to press the microphone on their
own keyboard.

Considered and rejected: `expo-speech-recognition` and `@react-native-voice/voice`. Both need
a development build, so neither runs in Expo Go, and both add a native dependency and a
permissions flow.

The keyboard already does this well. It respects whatever language the user has configured,
handles Hinglish exactly as well as their phone already does, needs no permission prompt, and
works today. The parse quality is identical because both paths end up as text going to the
same parser.

---

## D-011 · Model: claude-opus-5-5
**Date:** 2026-08-07, revised 2026-10-14 · **Status:** Locked

Used for three things: parsing captures, reranking and explaining suggestions, and mapping
free-text moods onto tags.

The deterministic engine does all the load-bearing work, so the volume is low: one rerank per
meaningful state change, one parse per capture. Structured outputs (`output_config.format`)
are used everywhere, so the shape is guaranteed and only the meaning needs re-validating.

The API key lives in the device keychain and is entered by the user. That is right for a
personal app and wrong for a multi-tenant product, which would proxy through a server holding
one key. `src/ai/client.ts` is the seam where that proxy goes.

**2026-10-14:** moved from `claude-opus-5` (still a valid id) to `claude-opus-5-5`, the current
Opus. Same 1M context and feature set, cheaper per token ($4 / $20 per million against $5 / $25).
None of its breaking changes touch this code: no call sets `thinking`, forces `tool_choice`, or
uses computer use. One behaviour to know: its default effort is `medium`, one below Opus 5.
Sonnet 5.5 ($2 / $10) was considered and not taken. The reasoning above still holds: volume is
one parse per capture and one rerank per state change, the key is the user's own, and parse
accuracy on handwritten lists and Hinglish bills is where a mistake costs trust. Revisit once
the AI layer has an eval that can show Sonnet holding quality.

---

## D-012 · Fasting and festival filters are hard constraints
**Date:** 2026-08-07 · **Status:** Locked

Navratri, Shravan, Ekadashi and a standing no-onion-garlic option filter suggestions at the
same severity as an allergy, in both push and pull.

The reasoning: a household keeping vrat that is served grain has been failed in the same way
as a household with a dairy allergy served paneer. Treating observances as a soft preference
would mean the app is only trustworthy for people who do not keep any.

---

## Open questions, updated 2026-08-07

| # | Question | Blocking |
|---|---|---|
| Q-01 | Does the six-segment mark read as a spinner on a real home screen? Three segments instead? | Store listing |
| Q-02 | Recipe corpus: how to get from 14 to ~500 without flipping `verified` in bulk | The next real milestone |
| Q-05 | Do the deep-link URL schemes still resolve on a real device? | Shipping. Nothing has been device-tested. |
| Q-06 | Has the Supabase migration ever been applied to a live project? | Sharing. RLS policies are unverified in practice. |
| Q-07 | Should par levels and burn rates learn per household, and what signal trains them? | Not blocking |

Closed since the last revision: Q-03 (OCR path, answered by Claude vision), Q-04 (brand line,
folded into the tagline decision).

---

## D-013 · Membership writes are owner-only
**Date:** 2026-10-14 · **Status:** Locked

The original `member_write` policy let any household member, including the `cook` role, insert,
update or delete any membership row, including the owner's. It is replaced by three policies:
insert and update require the `owner` role (via `is_household_owner`), and delete is allowed for
the owner or for a member removing their own row, which is how someone leaves a household.
Reading is unchanged.

Fixed in place in `0001_init.sql` because the migration has never been applied to a live
project. Consequence: `joinHousehold` in `app/src/db/supabase.ts`, which inserts the caller's
own row, was already rejected by RLS (the caller is not yet a member) and still is. Joining
needs an owner-issued invite, for example a security-definer RPC that redeems an invite code.
Not built yet.

Also hardened in place: the security-definer helpers are schema-qualified and executable by
`authenticated` only, and a `household_member_keep_owner` trigger refuses removing or demoting
a household's last owner, or changing a row's `household_id` or `user_id`.

---

## D-014 · Joining a household is by owner-issued invite code
**Date:** 2026-10-14 · **Status:** Locked

Closes the gap D-013 left open. An owner creates a row in `household_invite`; whoever redeems
the code through `public.join_household(code)` is added as a member with the role the owner
chose. The old flow, typing the household's uuid and inserting your own membership row, is gone.

- **The database makes the code.** Ten Crockford base32 symbols (no I, L, O or U), 50 bits from
  `gen_random_uuid()`. Column grants let a client set only the household, the role and an
  earlier expiry, so nobody can mint a guessable code or insert one already redeemed.
- **One use, 7 days by default, 30 at most.** `owner` is never grantable by code.
- **Only the owner sees a household's codes.** Nobody else can read the table, so codes cannot
  be listed; redemption goes only through the RPC.
- **The RPC is the one door.** Security definer, empty `search_path`, everything
  schema-qualified, executable by `authenticated` only. Unknown, expired, used and orphaned
  codes (issuer no longer an owner) get the same error, so it confirms nothing to a guesser.
  Already being a member is a separate error and leaves the code unused. A row lock stops two
  people redeeming one code at once.
- **The client normalises the same way** (`app/src/db/inviteCode.ts`), so `qy7nw-ltc8s` works
  and a pasted uuid is caught before a round trip.

A user who joins keeps the household created at signup; `currentSession` picks the most
recently joined. Not built: rate limiting on redemption (50 bits over 7 days makes guessing
impractical), and a screen to list or revoke codes, which RLS already allows.

Verified with PGlite against a stub `auth` schema, as role `authenticated` with RLS on:
33 checks covering invite, join, rejection paths, the cook role and the last-owner guard. Still
not applied to a live Supabase project (Q-06).
