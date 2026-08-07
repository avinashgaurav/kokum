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
loading spinner. Mitigations to test before shipping, in `UI-UX.md` §4.

---

## D-007 · Tagline: "Stocked. Planned. Cooked."
**Date:** 2026-08-07 · **Status:** Locked

25 of 30 characters, so it fits the App Store subtitle ceiling with room to spare.

Three beats naming the three tabs, which makes it descriptive and immediately clear. Noted
honestly at decision time: it explains the app rather than making someone want it, so the
marketing site and store screenshots have to carry the desire that the line does not.

Useful consequence: the three beats and the icon can reinforce each other. See the open
question in `UI-UX.md` §4 about reducing the mark from six segments to three.

---

## D-008 · Stack: Expo, TypeScript, React Native, local-first SQLite
**Date:** 2026-08-07 · **Status:** Locked

Matches the working setup in `~/Desktop/Personal/VehicleX/app/`. Local-first via `expo-sqlite`;
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
