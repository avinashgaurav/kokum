# Development

Checks to run before claiming anything works, and where everything lives.

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

Current status (re-run 2026-10-15): typecheck clean, **75 of 75 tests passing**, **54 of 54 SQL
checks passing**, Metro bundles 1139 modules.

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
        __tests__/       48 engine tests (invariant, features), 25 household, invite and sync tests, 2 rerank reattach tests
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
