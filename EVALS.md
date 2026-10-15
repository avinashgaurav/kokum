# Kokum AI evals

First-pass quality evals for the two model calls Kokum depends on: grocery parsing (`app/src/ai/parse.ts`) and tonight's rerank (`app/src/ai/rerank.ts`). Run on 2026-10-15, then rerun the same day after the fixes, which ship in the same PR (see "Before and after the fix").

**Method note.** Measured via the Claude Code CLI with the app's own prompts and schema, not the production API path; an API rerun is planned.

The harness calls the app's real `parseText`, `parseImage` and `rerank`. That means the real system prompts, closed vocabulary, JSON schemas, `normalise()` and `reattach()` all run. Only the transport changes: `evals/harness/claude-cli.mjs` is a stand-in for `@anthropic-ai/sdk` that runs `claude -p` with `--system-prompt`, `--json-schema`, `--tools ""`, `--strict-mcp-config`, `--setting-sources ""`, `--no-session-persistence` and `--model claude-opus-5-5`.

Differences from the API path, so the numbers are read correctly:

- `--bare` could not be used: it only accepts `ANTHROPIC_API_KEY`, and this run used a plan login. The isolation flags above were used instead. The CLI still adds a short environment block and an account-context reminder to every call.
- The CLI enforces the schema through its own structured-output tool, not the API's `output_config.format`. `max_tokens` is not passed through.
- Photos were sent as base64 image blocks via `--input-format stream-json`.

## Dataset

All data is fictional. Expected answers were written before any model run.

| Set | Size | What it is |
|---|---|---|
| Parse | 20 items, 45 expected lines | 18 typed or voice-transcript lists (English, Hinglish, Devanagari, number words such as pav, dedh, sawa, paune), plus 2 rendered images: a typed shopping list and a fictional store invoice. Includes out-of-vocabulary items (chicken, bread, dishwash liquid, toilet paper, delivery fee) and one pack with no weight. `evals/datasets/parse.json` |
| Rerank | 10 pantry states, 80 candidate dishes | One vegetarian household, each state run through the app's own `suggest()` in pull mode (limit 8). 7 of 10 states carry a free-text mood; 3 of those ask for dishes that are not candidates (butter chicken, biryani, Thai curry, pasta). `evals/datasets/rerank.json` |

Dish states and the expected cook-now set come from the deterministic engine and were frozen to `evals/datasets/rerank.expected.json` before any model call.

## Rubric and metrics

**Parse (deterministic).** An item passes only if all of these hold:

- every expected ingredient id is extracted
- the quantity is within 1% in the dictionary unit
- no extra ids appear
- out-of-vocabulary items do not resolve to an id
- out-of-vocabulary items are surfaced in `unparsed`, not dropped (except the invoice's delivery fee, which the prompt says to ignore)
- the no-weight pack has confidence of 0.6 or lower
- invoice prices and total match, in paise

**Rerank (deterministic).** A state passes only if:

- no invented recipe id survives `reattach`
- every candidate dish is retained exactly once
- every cook-now dish is ranked above every check-first or need-items dish

Also reported:

- raw invented, duplicate and omitted ids before `reattach`
- whether the top dish is cook-now
- whether check-first ranks before need-items
- sentence checks: exclamation marks; need-items sentences that name no missing item; cook-now sentences that imply shopping; a dictionary-match heuristic for ingredients mentioned in a sentence

**Reattach adversarial check (offline, no model).** A hostile canned response is fed to the real `rerank()`. It has:

- an invented id
- a duplicate id
- a 250-character reason
- a cook-now dish left out
- a need-items dish placed first

**Manual review.** I read all 80 rerank sentences once for false possession claims and for wrong descriptions of the dish.

## Results (first run, before the fix)

| Metric | Result |
|---|---|
| Parse items fully correct | **20 / 20** |
| Parse lines extracted | 45 / 45 |
| Parse lines with correct quantity and unit | 45 / 45 |
| Out-of-vocabulary items forced onto an id | 0 / 5 |
| Rerank states passed | **10 / 10** |
| Invented ids in raw model output | 0 |
| Invented ids surviving `reattach` | 0 |
| States with every dish retained | 10 / 10 |
| States with cook-now dishes ranked first | 10 / 10 |
| Top dish is cook-now | 10 / 10 |
| Check-first ranked before need-items | 10 / 10 |
| Sentences claiming the user has an item not in the pantry (manual) | 0 / 80 |
| Sentences describing a dish with an ingredient it does not use (manual) | **3 / 80** |
| Adversarial: invented id dropped, duplicate collapsed, omitted dish restored, long reason replaced | 4 / 4 |
| Adversarial: cook-now ordering enforced by code | **No** |

## Misses (first run)

**Parse:** none.

**Rerank, by failure category:**

1. **Dish description drift (model, 3 sentences).** These are not pantry-possession claims, but they misdescribe the recipe:
   - r01 `veg-pulao`: "using your onion and tomato". The recipe has no tomato.
   - r03 `veg-pulao`: "made with ghee ... with potato and cauliflower stirred through". The recipe uses oil and has no cauliflower.
   - r09 `kanda-poha`: "uses your onion and peas". The recipe has no peas.
2. **Ordering is not enforced in code (design gap, found by the offline check).** `reattach()` enforces the id set but trusts the model's order. A response that puts a need-items dish first is shown first. A cook-now dish the model leaves out is appended last, below need-items dishes. The live model never did either in 10 states, so this did not cost any points above. It is still the only thing between a bad response and "go shopping" being ranked above "cook now".
3. **Heuristic noise.** The dictionary-match heuristic flagged 8 sentences. 5 were false positives: pairing mentions such as "goes well with rice", and "aloo gobi" matching potato and cauliflower.

## Before and after the fix

The fixes (production code, in the same PR as these results):

- `reattach()` moved to `app/src/ai/reattach.ts` (no SDK imports) and now stable-sorts by dish state after applying the model's order. A regression test built from the hostile reply above is in `app/src/engine/__tests__/reattach.test.ts`.
- The rerank payload now carries each dish's `ingredients` and `optionalIngredients`, and the prompt says: "Only mention ingredients that are in this dish: its "ingredients" or "optionalIngredients" list."

Tests after the fix: `npm run typecheck` passes; `npm test` passes 75/75 (73 before, plus 2 new reattach tests).

Same 20 parse items, same 10 pantry states, same rubric, same model. Results: `evals/results/2026-10-15-claude-cli.json` (before) and `evals/results/2026-10-15-claude-cli-after-fix.json` (after).

| Metric | Before | After |
|---|---|---|
| Parse items fully correct | 20 / 20 | 20 / 20 |
| Parse lines with correct quantity and unit | 45 / 45 | 45 / 45 |
| Rerank states passed | 10 / 10 | 10 / 10 |
| Invented ids surviving `reattach` | 0 | 0 |
| States with cook-now dishes ranked first | 10 / 10 | 10 / 10 |
| Sentences claiming the user has an item not in the pantry (manual) | 0 / 80 | 0 / 80 |
| **Sentences describing a dish with an ingredient it does not use (manual)** | **3 / 80** | **0 / 80** |
| Heuristic flags (all adjudicated by hand) | 8 (5 false positives) | 6 (6 false positives) |
| **Adversarial: cook-now ordering enforced by code** | **No** | **Yes** |
| Adversarial: invented id dropped, duplicate collapsed, omitted dish restored, long reason replaced | 4 / 4 | 4 / 4 |

After the fix, the hostile reply's need-items dish moves below every cook-now and check-first dish, and the omitted cook-now dish returns to the cook-now group.

Remaining misses after the fix: none on these sets. The 6 heuristic flags are 4 pairing mentions ("goes well with the aloo gobi") and 2 cook-now sentences saying "atta is all you need", which the shopping regex mistakes for a shopping hint. Caveats are unchanged: 80 sentences is a small sample for a 3/80 to 0/80 change, and both photos are typed renders.

Rerun latency: parse p50 4.6 s, p90 5.5 s; rerank p50 8.8 s, p90 10.0 s; wall time 62 s for all 30 calls. Model: `claude-opus-5-5`.

## Latency and usage (first run)

| | Calls | p50 | p90 | Max | Wall time (3 concurrent) |
|---|---|---|---|---|---|
| Parse | 20 | 4.7 s | 6.3 s | 7.1 s | 34 s |
| Rerank | 10 | 8.7 s | 12.4 s | 12.4 s | 30 s |

- Model that answered every call: `claude-opus-5-5`, the app's configured `MODEL`.
- Total usage reported by the CLI: about 82k input tokens (mostly cache creation) and 11k output tokens. That is CLI-path usage, not production cost.
- 0 CLI errors.

## Reading the result

Parsing is clean on this set. The set is not adversarial for handwriting: both photos are typed renders. A real handwritten-photo set is the next thing to add before quoting a parse number publicly.

Rerank was clean on the safety metrics. The first run recommended two fixes, both now applied (see above):

1. **Code (recommended).** In `reattach()`, after applying the model's order, stable-sort by state rank (cook-now, then check-first, then need-items). The model then only orders within a state group, and an omitted cook-now dish returns to its group instead of the bottom.
2. **Prompt.** Add one rule to the rerank system prompt: "Only mention ingredients that are in this dish." Also send each dish's core ingredient names in the payload, so the sentence can be grounded.

## Reproduce

```sh
cd kokum
evals/harness/setup-shims.sh                      # throwaway shim packages in ./node_modules (gitignored)
python3 evals/harness/make-images.py              # renders the two synthetic photos
bun --no-install evals/harness/freeze-rerank.ts   # freezes engine expectations (no model)
bun --no-install evals/harness/run.ts all         # 30 CLI calls; writes evals/results/<date>-claude-cli.json
EVAL_TAG=after-fix bun --no-install evals/harness/run.ts all   # same, written with an -after-fix suffix
bun --no-install evals/harness/rescore.ts evals/results/<date>-claude-cli.json   # optional, no model
rm -rf node_modules/@anthropic-ai/sdk node_modules/expo-secure-store   # removes only the two shims
```

Requires Bun and a logged-in `claude` CLI. Single sets: `run.ts parse`, `run.ts rerank`, `run.ts adversarial` (offline).
