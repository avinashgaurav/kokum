# Kokum: product brief

One page. Every number below is read from the code or a test run, or is labelled as a target or an estimate. Kokum is pre-release: it has not been run on a physical device and has no users yet.

## User

The person in an Indian household who decides what gets cooked tonight, often on a phone, in the kitchen, with one hand free. Possibly sharing the kitchen with a partner or a cook.

## Job to be done

"Tell me what I can actually cook tonight with what is in my kitchen, and when I want something I can't make, tell me exactly what to buy."

## Problem

Recipe apps suggest dishes without knowing your pantry, so you find out halfway through that you are out of paneer. Pantry apps die because nobody keeps typing in what they bought and used.

## Non-goals

- Not a recipe site. The corpus is 14 hand-verified dishes, enough to prove the engine.
- Does not build carts in grocery apps. None of them offer a public ordering API, so Kokum opens their search by deep link instead (INTEGRATIONS.md).
- No sensors. Pantry confidence is an estimate from cooking, shelf life and burn rates, never a claim to see inside the fridge.
- The model never decides whether a dish is cookable.

## How it works

- **Groceries in:** a bill, list or shelf photo, or a spoken list, is parsed by the model into lines; a person confirms every line before it reaches the pantry.
- **Pantry over time:** code subtracts what you cook, decays perishables on a shelf-life clock, and burns down staples at a set daily rate.
- **What can I cook:** code labels every dish Cook now, Need N items or Check first, and applies diet, allergy, cooktop and fasting filters.
- **Suggestions:** the app's own suggestions show only Cook now; when you ask for something, everything shows, honestly labelled. The model reorders the list and writes one sentence per dish; invented recipe ids are dropped.
- **Shopping and sharing:** missing items go to an order list that opens grocery apps by deep link; Supabase lets two phones share one household by invite code.

## North-star metric

**Trusted Cook now rate:** of Cook now suggestions a user acts on, the share they could actually cook with no missing core ingredient. This is the app's one promise, made measurable.

Target: **at least 95%** (target, not yet measured). Measuring it needs a "I was missing something" report next to "I cooked this", which is not built.

## Supporting metrics

1. **Parse accuracy:** share of parsed lines the user confirms without editing. The `capture` table already stores `parsed` and `confirmed` side by side, but capture sync is not built.
2. **Weekly check burden:** taps per weekly check. Capped by design at 8 items (`weeklyCheckQueue`).
3. **Model ids dropped:** recipe ids returned by rerank that do not resolve and are discarded by `reattach()`. Not logged yet.

## Release threshold

Before any public release (targets, not yet measured):

- typecheck clean, all engine tests passing (73 of 73 on 2026-10-14) and all SQL checks passing (54 of 54);
- every deep link in `integrations/order.ts` run through the device harness on a real phone;
- the Supabase migration applied to a live project and the RLS checks repeated there;
- a parse eval on a set of real-format bills and lists, with line accuracy of at least 90%.

## Cost per task

**Estimate, about $0.04 per photo capture and $0.02 to $0.03 per rerank.** Not yet measured; to be measured in EVALS.md (planned). The user pays with their own API key.

Arithmetic: model `claude-opus-5-5` at $4 input and $20 output per million tokens (DECISIONS D-011), about 4 characters per token. Opus 5.5 always thinks, at its default medium effort, so thinking tokens are counted as output.

- **Photo capture (`ai/parse.ts`):** system prompt about 3,400 characters (rules plus the 1,521-character, 37-ingredient vocabulary), about 850 tokens, plus about 1,600 tokens for the photo (assumption: the API scales a phone photo to roughly 1.2 megapixels). About 2,500 input tokens is $0.01. Output for a 15-line bill plus thinking, assumed about 1,600 tokens, is $0.03.
- **Rerank (`ai/rerank.ts`):** system prompt about 1,150 characters plus a JSON payload of 3 to 14 dishes and the pantry, about 1,000 to 2,000 input tokens, $0.004 to $0.008. Output of one sentence per dish plus thinking, assumed 650 to 1,200 tokens, $0.013 to $0.024.
