# Kokum AI tests (evals)

These are first checks on how well the two AI steps in Kokum work. The first step reads grocery lists (`app/src/ai/parse.ts`). The second puts tonight's dish suggestions in order (`app/src/ai/rerank.ts`). I ran the tests on 2026-10-15. I then fixed what they found and ran them again the same day. The fixes are in the same PR (see "Before and after the fix").

**How it was run.** I ran the tests through the Claude Code CLI (a command-line tool), using the app's own instructions to the AI and its own answer format. This is not the path the live app uses, which is the Claude API. I plan to run the tests again through the API.

The test setup calls the app's real `parseText`, `parseImage` and `rerank`. So everything the app really does still runs: the real instructions to the AI, the fixed list of allowed ingredient names, the required answer format (JSON schemas), `normalise()` and `reattach()`. Only the way each request is sent changes. `evals/harness/claude-cli.mjs` stands in for `@anthropic-ai/sdk`. It runs `claude -p` with `--system-prompt`, `--json-schema`, `--tools ""`, `--strict-mcp-config`, `--setting-sources ""`, `--no-session-persistence` and `--model claude-opus-5-5`.

How this differs from the live API path, so you read the numbers correctly:

- `--bare` could not be used. It only accepts `ANTHROPIC_API_KEY`, and this run used a plan login. The isolation flags above were used instead, to keep each call clean. The CLI still adds a short note about the environment and the account to every call.
- The CLI makes the AI follow the answer format with its own built-in tool, not the API's `output_config.format`. The `max_tokens` setting is not passed through.
- Photos were sent as images encoded as text (base64 image blocks) via `--input-format stream-json`.

## Test cases

All data is made up. The correct answers were written down before the AI saw any test.

| Set | Size | What it is |
|---|---|---|
| Parse (reading lists) | 20 test cases, 45 lines to find | 18 typed or spoken (voice-to-text) lists in English, Hinglish and Devanagari, with number words such as pav, dedh, sawa, paune. Plus 2 pictures made on a computer: a typed shopping list and a made-up store bill. Some items are not in the app's ingredient list (chicken, bread, dishwash liquid, toilet paper, delivery fee), and one pack has no weight. `evals/datasets/parse.json` |
| Rerank (ordering dishes) | 10 pantries, 80 possible dishes | One vegetarian household. Each pantry was run through the app's own `suggest()` in pull mode (limit 8). 7 of 10 pantries include a mood typed by the user. 3 of those ask for dishes that are not on the list (butter chicken, biryani, Thai curry, pasta). `evals/datasets/rerank.json` |

The app's rule-based engine (plain code, no AI) decided each dish's state and which dishes can be cooked now. Those answers were saved to `evals/datasets/rerank.expected.json` before the AI was asked anything.

## Scoring checklist and measures

**Parse (scored by code, not by AI).** A test case passes only if all of these are true:

- every ingredient it should find is found (by its ingredient id)
- the amount is within 1% of the right amount, in the dictionary's unit
- no extra ingredients appear
- items that are not in the app's ingredient list are not matched to one
- those items are listed in `unparsed`, not thrown away (except the bill's delivery fee, which the instructions tell the AI to ignore)
- the pack with no weight gets a confidence score of 0.6 or lower
- prices and the total on the bill match, in paise

**Rerank (scored by code).** A pantry passes only if:

- no made-up recipe id gets past `reattach`
- every possible dish is kept, exactly once
- every cook-now dish is ranked above every check-first or need-items dish

Also reported:

- made-up, repeated and missing ids in the AI's raw answer, before `reattach` cleans it up
- whether the top dish is cook-now
- whether check-first dishes come before need-items dishes
- checks on the sentences: exclamation marks; need-items sentences that do not name a missing item; cook-now sentences that suggest shopping; a rough word match against the ingredient list, to spot ingredients a sentence mentions

**Reattach stress test (offline, no AI).** A deliberately bad, prewritten answer is fed to the real `rerank()`. It has:

- a made-up id
- a repeated id
- a 250-character reason
- a cook-now dish left out
- a need-items dish placed first

**Reading by hand.** I read all 80 rerank sentences once. I looked for sentences that say you have something you do not have, and for sentences that describe the dish wrongly.

## Results (first run, before the fix)

| Measure | Result |
|---|---|
| Lists read fully correctly | **20 / 20** |
| Lines found | 45 / 45 |
| Lines with the right amount and unit | 45 / 45 |
| Items not in the ingredient list wrongly matched to one | 0 / 5 |
| Pantries passed (rerank) | **10 / 10** |
| Made-up ids in the AI's raw answer | 0 |
| Made-up ids getting past `reattach` | 0 |
| Pantries with every dish kept | 10 / 10 |
| Pantries with cook-now dishes ranked first | 10 / 10 |
| Top dish is cook-now | 10 / 10 |
| Check-first ranked before need-items | 10 / 10 |
| Sentences saying you have something not in the pantry (read by hand) | 0 / 80 |
| Sentences describing a dish with an ingredient it does not use (read by hand) | **3 / 80** |
| Stress test: made-up id dropped, repeated id merged, missing dish put back, long reason replaced | 4 / 4 |
| Stress test: cook-now order enforced by code | **No** |

## What went wrong (first run)

**Parse:** nothing.

**Rerank, by type of problem:**

1. **Dish described wrongly (AI, 3 sentences).** These sentences do not claim you have something you lack. But they describe the recipe wrongly:
   - r01 `veg-pulao`: "using your onion and tomato". The recipe has no tomato.
   - r03 `veg-pulao`: "made with ghee ... with potato and cauliflower stirred through". The recipe uses oil and has no cauliflower.
   - r09 `kanda-poha`: "uses your onion and peas". The recipe has no peas.
2. **Order is not enforced in code (a design gap, found by the offline stress test).** `reattach()` checks which dishes are there, but trusts the AI's order. If the AI puts a need-items dish first, the app shows it first. If the AI leaves out a cook-now dish, the app adds it at the very end, below need-items dishes. The live AI never did either in 10 pantries, so this cost no points above. It is still the only thing stopping a bad answer from ranking "go shopping" above "cook now".
3. **Noise from the word-match check.** The rough word-match check flagged 8 sentences. 5 of those were not real problems: pairing mentions such as "goes well with rice", and "aloo gobi" matching potato and cauliflower.

## Before and after the fix

The fixes (to the app's real code, in the same PR as these results):

- `reattach()` moved to `app/src/ai/reattach.ts` (no SDK imports). After it applies the AI's order, it now groups dishes by state, keeping the AI's order inside each group. A test that replays the bad answer above, so this cannot quietly break again, is in `app/src/engine/__tests__/reattach.test.ts`.
- The rerank request now includes each dish's `ingredients` and `optionalIngredients`. The instructions to the AI now say: "Only mention ingredients that are in this dish: its "ingredients" or "optionalIngredients" list."

Code checks after the fix: `npm run typecheck` passes. `npm test` passes 75/75 (73 before, plus 2 new reattach tests).

Same 20 parse test cases, same 10 pantries, same scoring checklist, same AI model. Results: `evals/results/2026-10-15-claude-cli.json` (before) and `evals/results/2026-10-15-claude-cli-after-fix.json` (after).

| Measure | Before fix | After fix |
|---|---|---|
| Lists read fully correctly | 20 / 20 | 20 / 20 |
| Lines with the right amount and unit | 45 / 45 | 45 / 45 |
| Pantries passed (rerank) | 10 / 10 | 10 / 10 |
| Made-up ids getting past `reattach` | 0 | 0 |
| Pantries with cook-now dishes ranked first | 10 / 10 | 10 / 10 |
| Sentences saying you have something not in the pantry (read by hand) | 0 / 80 | 0 / 80 |
| **Sentences describing a dish with an ingredient it does not use (read by hand)** | **3 / 80** | **0 / 80** |
| Word-match flags (each one checked by hand) | 8 (5 not real problems) | 6 (6 not real problems) |
| **Stress test: cook-now order enforced by code** | **No** | **Yes** |
| Stress test: made-up id dropped, repeated id merged, missing dish put back, long reason replaced | 4 / 4 | 4 / 4 |

After the fix, the bad answer's need-items dish moves below every cook-now and check-first dish. The missing cook-now dish goes back into the cook-now group.

Problems left after the fix: none in these test cases. The 6 word-match flags are 4 pairing mentions ("goes well with the aloo gobi") and 2 cook-now sentences saying "atta is all you need". The shopping check looks for set phrases, and it wrongly reads that as a hint to go shopping. The limits are the same as before: 80 sentences is a small sample to judge a change from 3/80 to 0/80, and both photos are typed lists made on a computer.

Speed on the second run: reading lists took 4.6 s for a typical call (p50, the middle value) and 5.5 s at p90 (the slow end; most calls were faster). Ordering dishes took 8.8 s at p50 and 10.0 s at p90. All 30 calls took 62 s from start to finish. Model: `claude-opus-5-5`.

## Speed and usage (first run)

| | Calls | p50 (middle) | p90 (slow end) | Slowest | Total time (3 at once) |
|---|---|---|---|---|---|
| Parse | 20 | 4.7 s | 6.3 s | 7.1 s | 34 s |
| Rerank | 10 | 8.7 s | 12.4 s | 12.4 s | 30 s |

- Model that answered every call: `claude-opus-5-5`, the `MODEL` the app is set to use.
- Total usage reported by the CLI: about 82k input tokens (text sent in, mostly stored for reuse) and 11k output tokens (text the AI wrote). This is usage on the CLI path, not what the live app would cost.
- 0 CLI errors.

## What this means

Reading lists worked perfectly on these test cases. But the cases do not test handwriting: both photos are typed lists made on a computer. Before quoting a parsing number in public, the next step is to add real photos of handwritten lists.

Ordering dishes passed every safety measure. The first run pointed to two fixes. Both are now done (see above):

1. **Code (recommended).** In `reattach()`, after applying the AI's order, group dishes by state (cook-now, then check-first, then need-items), keeping the AI's order inside each group. The AI then only decides the order inside a group. A cook-now dish the AI leaves out goes back to its group instead of the bottom.
2. **Instructions to the AI.** Add one rule to the rerank instructions: "Only mention ingredients that are in this dish." Also send each dish's main ingredient names with the request, so each sentence is based on the real recipe.

## Run it yourself

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

Needs Bun and a logged-in `claude` CLI. To run one set only: `run.ts parse`, `run.ts rerank`, `run.ts adversarial` (offline).
