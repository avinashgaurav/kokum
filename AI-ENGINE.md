# The suggestion engine

Two layers. The split between them is the whole design, and it is what lets the app use a
language model without ever letting the model lie to you about your own kitchen.

Code: `app/src/engine/suggest.ts` (deterministic), `app/src/ai/` (Claude).

---

## Layer 1: deterministic, offline, authoritative

Runs on-device with no network. This layer decides everything that matters.

```
1. Hard constraints        both push and pull
2. State every candidate   cook-now / need-items / check-first
3. Gate by request kind    push keeps only cook-now; pull keeps everything
4. Score within each group
```

### Hard constraints

Absolute, and identical for push and pull. A search may surface a dish you lack ingredients
for. It may never surface one you must not eat.

- **Diet**: veg, egg, non-veg, jain, vegan
- **Allergies**: matched against ingredient allergen tags, checked across *all* ingredients
  including optional ones
- **Dislikes**: per-ingredient opt-outs
- **Equipment**: no oven, no oven dishes
- **Cooktop**: `gas-only` recipes are hidden from induction households. Phulka puffed on the
  flame and charred baingan for bharta genuinely cannot be done on induction, so this is a
  capability filter, not a preference.
- **Observances**: Navratri, Shravan, Ekadashi, no-onion-garlic. Treated at the same severity
  as allergies, because a household keeping vrat that is served grain has been failed in the
  same way.
- **Time**: weekday and weekend caps

### Scoring

```
+ expiryUrgency * 100      heaviest term by far
- repetitionPenalty        up to 56 points inside a 14-day window
+ 6                        never cooked before
- (effort - 1) * 3
- missingCount * 25        pull only, so fewer missing items ranks higher
- 10                       check-first
```

Expiry urgency dominates on purpose. Telling you to use the palak before it dies is the single
most valuable thing the app can say, and it is the thing no recipe app does.

Ties break on recipe id, so the list is stable across renders. Nothing here uses `Math.random`
or `Date.now` inside the scoring path, which is what makes Surprise Me testable.

### Surprise Me

Constrained randomness. Filters to `cook-now`, prefers dishes never cooked or not cooked in
60+ days, then indexes by a caller-supplied seed. Deterministic for a given seed, so it does
not reshuffle on re-render, and it returns `null` rather than something uncookable.

---

## Layer 2: Claude

Model: `claude-opus-5-5` (see DECISIONS D-011). Three uses, all optional, all degrading to nothing.
Two are wired into screens today (parsing on Capture, reranking on Today); mood interpretation
is written but not yet called.

### Parsing (`src/ai/parse.ts`)

One parser, four sources: bill photo, list photo, shelf photo, voice transcript. They are the
same extraction problem with different confidence characteristics, so they share a schema and
differ only in the tail of the system prompt.

The ingredient dictionary is passed in as a **closed vocabulary**, id plus every alias. This
is what makes "kothmir", "dhaniya" and "coriander" resolve to one row instead of three.

Structured outputs (`output_config.format` with a JSON schema) guarantee the shape. They do
not guarantee the meaning, so `normalise()` re-validates every returned `ingredientId` against
the real dictionary and moves anything unrecognised to `unparsed` rather than writing a
dangling reference into the pantry.

Source-specific rules that matter:

| Source | Rule |
|---|---|
| Bill | High confidence, prices in paise, ignore delivery fees and taxes |
| List photo | Handwriting is ambiguous; lower confidence rather than guess |
| Shelf photo | Cap confidence at 0.6. You cannot judge weight from a photo. |
| Voice | Speech-to-text mangles names; use aliases generously |

Indian quantity words are in the prompt explicitly: pav = 250 g, adha = half, dedh = 1.5,
sawa = 1.25, paune = 0.75, and the number words ek through paanch.

**Everything lands on a confirm screen.** Lines below 0.7 confidence are flagged. Nothing
reaches the pantry unreviewed.

### Reranking (`src/ai/rerank.ts`)

This is where the sacred rule is enforced at the boundary.

Claude receives candidates whose **state and missing-item list were already computed in code**.
It returns an array of `{recipeId, reason}`. Then `reattach()`:

- resolves each id against our own local suggestion objects
- keeps only the sentence
- drops any id that does not resolve (hallucination)
- appends any dish the model forgot (after the ranked ones), with its deterministic sentence
- attaches the assessment **this device computed**, never anything the model sent

So the worst a maliciously wrong response can do is order the list oddly or write an odd
sentence. It cannot tell you that you have paneer when you do not. That property comes from
the architecture, not from the prompt being well written.

The prompt still says it plainly, because defence in depth is cheap:

> The pantry is a closed list. If an ingredient is not on it, they do not have it. Every dish
> arrives with a state and a list of exactly what is missing. Never contradict either.

### Mood interpretation (`interpretMood`)

Maps free text onto a closed enum of mood tags, so "something to cure a hangover" reaches egg
bhurji. Constrained by the schema to the tags that exist. Not yet called from any screen; today
the typed mood or search text reaches the model only as context for reranking.

---

## Degradation

The Today screen renders the deterministic result immediately and swaps in Claude's ordering
when it arrives. There is no spinner and no blocked render.

| Failure | Behaviour |
|---|---|
| No API key | Deterministic order and sentences. Photo and voice capture disabled with an explanation. |
| Offline | Same. `APIConnectionError` maps to a message that says the app works offline too. |
| Rate limited | Same, with a retry hint. |
| Refusal | Same. `stop_reason === 'refusal'` is checked before reading content. |
| Malformed output | Same. Schema violations and unparseable JSON both fall through to deterministic. |
| Stale response | Discarded. A sequence counter drops any response that arrives after the user has moved on. |

The app has never needed the network to tell you what to cook, and it never will.

---

## Cost

One rerank call per meaningful state change, one parse call per capture. A per-call estimate
with the arithmetic is in [docs/PRD.md](docs/PRD.md); nothing has been measured yet. The deterministic
layer does all the load-bearing work, which is what keeps this cheap: Claude is doing
presentation and extraction, not decision-making.

The API key lives in the device keychain (`expo-secure-store`) and is entered by the user.
That is correct for a personal app and wrong for a multi-tenant product, which would proxy
through a server holding one key. `src/ai/client.ts` is the seam where that proxy goes.

---

## The recipe corpus, and the biggest remaining risk

14 recipes, all hand-verified, quantities per 2 adults.

Quantity accuracy is the root dependency of the whole depletion model. A wrong number here
silently corrupts the pantry and eventually produces the exact failure this app exists to
prevent. The `verified` flag exists for this: unverified recipes may be suggested but are
excluded from depletion math.

Scaling to ~500 dishes is the main outstanding work, and it must not be done by generating
500 recipes and flipping `verified: true` in bulk. The honest path is LLM-generated structured
drafts, verified in batches against references, with the flag set per recipe as it is checked.
