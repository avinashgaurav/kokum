# Kokum

Recipe apps tell you to cook something and halfway through you find you are out of paneer, so Kokum tracks what is actually in your kitchen and only promises dishes it can back.

**Live demo:** https://kokum-six.vercel.app (runs in your browser; your pantry is saved on this device; AI ranking needs your own Claude key in Setup)

<img src="docs/demo.gif" alt="Kokum on web: tonight's Cook now dishes, a comfort mood showing Check first dishes, the pantry with items that need a look, and the week plan." width="300" />

> [!NOTE]
> **Tests of the two AI steps, before and after the fix**
>
> | Measure | Before fix | After fix |
> |---|---|---|
> | Grocery lists read fully correctly | 20 / 20 | **20 / 20** |
> | Made-up recipe IDs reaching the user | 0 | **0** |
> | Dish descriptions that name an ingredient the dish does not use | 3 / 80 | **0 / 80** |
> | Cook-now dishes kept first, even if the AI reorders them | No | **Yes, enforced in code** |
>
> The tests used made-up data and ran through the Claude Code CLI, not the API path the live app uses. The new rule for dish sentences was written using the same 80 sentences it was then scored on. How it was tested, and every miss: [EVALS.md](EVALS.md).

## Why AI here, why code there

| Step | Done by | Why |
|---|---|---|
| Read a bill, list or shelf photo, or a spoken list, into pantry lines | Model (`app/src/ai/parse.ts`) | Handwriting, Hinglish and messy invoices are a language problem. Code then throws out any ingredient the app does not know, and a person checks every line. |
| Decide Cook now, Need N items or Check first | Code (`app/src/engine/dishState.ts`) | A wrong answer sends you to the stove without paneer. It must give the same answer every time, and be tested. |
| Diet, allergy, cooktop and fasting filters; depletion and scaling | Code (`app/src/engine/`) | Hard rules and arithmetic are never a judgment call. |
| Order the shortlist and write one sentence per dish | Model (`app/src/ai/rerank.ts`) | Tone and context are what a model is good at. Code throws out any recipe the model makes up, puts back any dish it skipped, and adds back the dish state worked out on this device. |

## Quick start

```bash
cd app
npm install
npm start          # then scan the QR with Expo Go
```

Optional: paste a Claude API key in Setup to turn on photo and voice capture. Optional: add
Supabase credentials to `.env` (see `.env.example`) to share a pantry across phones. Neither
is needed for the app to work.

## More

- [How it works](docs/how-it-works.md): the one rule, how it knows, getting groceries in, sharing a pantry, design
- [Status and known gaps](docs/status.md): pre-release status and what is not proven yet
- [Development](docs/development.md): verify commands, current test status, repo layout
- [Product brief](docs/PRD.md) · [Evals](EVALS.md) · [Decisions](DECISIONS.md) · [Agent rules](AGENTS.md)
- [AI engine](AI-ENGINE.md) · [Inventory model](INVENTORY.md) · [Data model](DATA-MODEL.md) · [Integrations](INTEGRATIONS.md)
- [MIT License](LICENSE)
