# Status and known gaps

What is and is not proven yet.

## Status

Pre-release. Not yet run on a physical device. The AI layer (parsing and reranking) has a
first-pass eval ([EVALS.md](../EVALS.md)); only the deterministic engine has unit tests. Free-text mood mapping (`interpretMood` in
`app/src/ai/rerank.ts`) is written but no screen calls it yet. The Supabase migration has still
not been applied to a live project. Details under Known gaps below.

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
