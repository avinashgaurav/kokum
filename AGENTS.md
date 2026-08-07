# AGENTS.md: rules for AI agents working in Kokum

Read this before changing anything. It encodes the non-negotiables and how to verify your work.

## The one sacred rule

Kokum's entire reason to exist is that it does not lie to you about your own kitchen. Therefore:

> **The app never asserts you have something you might not.**
> Every dish's state is computed by deterministic code in `src/engine/dishState.ts`,
> **never by the language model.**

The LLM layer in `src/engine/rerank.ts` may rank, explain, substitute and converse. It may
never compute a dish's state and it may never edit a missing-item list.

### The three states

| State | Condition | What the user can do |
|---|---|---|
| `cook-now` | Every core ingredient above confidence 0.75 | Start cooking, I cooked this |
| `need-items` | One or more core ingredients absent, each named | Order the items, or order the dish |
| `check-first` | A core ingredient sits between 0.55 and 0.75 | One tap to confirm, which resolves to one of the above |

### Push versus pull

- **Push** surfaces (Today's three, Surprise Me, expiry nudges) return **only `cook-now`**.
  An unsolicited suggestion the user cannot act on is noise, and it is the exact failure this
  app exists to remove.
- **Pull** surfaces (mood or cuisine input, search, a named dish) return **everything**,
  honestly labelled, sorted `cook-now` first. Because sometimes you want a thing you don't have
  the ingredients for, and the job is then to get the user there, not to hide it.

Hard constraints (diet, allergy, equipment, fasting calendar) apply to **both**. A pull may
surface a dish you lack ingredients for. It may never surface one you must not eat.

If you touch `dishState.ts`, `confidence.ts` or `rerank.ts`, state in your PR which invariant
each change preserves, and flag it loudly. When unsure, round toward asking the user.

## Honesty discipline

- Recipe quantities that have not been verified against a reference carry `verified: false`.
  Unverified recipes may be **suggested** but are **excluded from depletion math**. Do not
  quietly flip the flag to make a test pass.
- Confidence is a **heuristic** built from cook logs, shelf-life clocks and learned burn rates.
  It is not a sensor. Never write copy or code implying Kokum can see inside the fridge.
- Deep-link URL schemes for Zepto, Blinkit, Instamart, Swiggy and Zomato are **unverified** and
  change without notice. Every one carries a `[VERIFY]` tag until it passes the device harness.
  Keep the tag.

## Numbers get double-checked

Quantity scaling (covers, child fractions at 0.6 of an adult portion, unit conversion) silently
corrupts the entire pantry when it is wrong, and the corruption is invisible until a user is
told to cook something they cannot. Any change to `src/engine/scaling.ts` needs a worked
example in the PR description and a passing drift simulation.

## Run and verify, always, before claiming done

```bash
cd app
npx tsc --noEmit
npx expo export --platform android --output-dir dist && rm -rf dist
npm test
```

All three must pass. Beyond that, specific to this product:

1. **Golden-set suggester tests** (`src/engine/__tests__/invariant.test.ts`). The sacred rule as
   executable assertions. This suite must be impossible to skip.
2. **Drift simulation.** Replay 8 weeks of synthetic cook logs against a known ground-truth
   pantry and assert the model stays within tolerance.
3. **Adversarial LLM test.** Feed the rerank layer a response that tries to change a dish state
   or invent an ingredient, and assert the code-computed values survive untouched.

## Conventions

- Consume semantic tokens from `src/theme`. Never hard-code colours. Green and amber belong to
  the state system only and are never used decoratively.
- Native modules that break Expo Go must be lazy-loaded behind a guarded `require` inside the
  function, so the app still runs in Expo Go. See the pattern in
  `~/Desktop/Personal/VehicleX/app/src/utils/reminders.ts`.
- `android/` and `ios/` are `expo prebuild` output and are gitignored. Never commit them.
- Hinglish is first-class. Ingredient search must match *dhaniya* and *coriander* equally. The
  alias table backs the UI, not just the engine.
- No emoji in the product. Line-art icons drawn to one stroke weight.

## Writing style

No em dashes in any authored text: code comments, commit messages, PR descriptions, docs, or
user-facing copy. Use a colon, semicolon, comma, parentheses, or a full stop.

## Decisions are recorded

Honour the locked entries in `DECISIONS.md` rather than re-litigating them. If you believe a
decision is wrong, add an entry proposing the reversal with your reasoning; do not silently
build against it.
