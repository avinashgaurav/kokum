// AI review of the rerank sentences in a saved results file. This replaces the author's
// read-by-hand for the two questions the code checks cannot settle on their own:
//   1. Does the sentence say or imply they have something the pantry does not list?
//   2. Does it describe the dish as using an ingredient that is not in the recipe?
// The reviewer is a model (the same CLI path as the eval), NOT a person. Results are
// reported as "read by an AI reviewer", never as a human read.
// Usage: EVAL_SET=new bun --no-install evals/harness/review-sentences.ts evals/results/<file>.json
import { readFileSync, writeFileSync } from 'node:fs';
import { INGREDIENT_INDEX } from '../../app/src/data/ingredients';
import { RECIPE_INDEX } from '../../app/src/data/recipes';
import { CALL_LOG, callClaude } from './claude-cli.mjs';
import { buildState, loadRerank } from './fixtures';

const REVIEW_MODEL = 'claude-opus-5-5';
const file = process.argv[2]!;
const d = JSON.parse(readFileSync(file, 'utf8'));
const ds = loadRerank();
const name = (id: string) => INGREDIENT_INDEX.get(id)?.name ?? id;

const SYSTEM = `You check one-sentence dish descriptions from a cooking app for two kinds of factual error. Be strict and literal. You are given, for each sentence: the dish, its recipe ingredients (the complete list), the household's pantry (a closed list: anything not on it, they do not have), the dish's state (cook-now, check-first or need-items) and the exact items it is missing.

For each sentence answer:
- saysTheyHaveSomethingTheyLack: true if the sentence says or implies the household has an ingredient that is not in the pantry list, or that is in the dish's missing list. Naming a missing item as something to buy is fine.
- namesIngredientNotInDish: true if the sentence describes THIS dish as using, containing or being made with an ingredient that is not in its recipe ingredient list. Naming a food as a side dish or pairing ("goes well with rice", "with phulka") is not describing the dish's ingredients: mark false and say so in the note. A word that is only part of a dish name is not an ingredient claim.
- note: one short line explaining any true answer, or any pairing or dish-name mention you decided was fine. Empty string if nothing to say.

Return one verdict per sentence, in the same order, with the same index.`;

const SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          saysTheyHaveSomethingTheyLack: { type: 'boolean' },
          namesIngredientNotInDish: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['index', 'saysTheyHaveSomethingTheyLack', 'namesIngredientNotInDish', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdicts'],
  additionalProperties: false,
};

const out: any[] = [];
const CONC = 3;
let next = 0;
const pantries = d.rerank.filter((x: any) => x.finalOrder);
await Promise.all(Array.from({ length: CONC }, async () => {
  while (next < pantries.length) {
    const x = pantries[next++];
    const st = ds.states.find((s: any) => s.id === x.id);
    const { pantry, suggestions } = buildState(ds, st);
    const miss = new Map(suggestions.map((s) => [s.recipe.id, s.assessment.missing.map((m) => name(m.ingredientId))]));
    const items = x.finalOrder.map((e: any, i: number) => ({
      index: i,
      dish: RECIPE_INDEX.get(e.recipeId)!.name,
      recipeIngredients: RECIPE_INDEX.get(e.recipeId)!.ingredients.map((r) => name(r.ingredientId)),
      state: e.state,
      missing: miss.get(e.recipeId),
      sentence: e.reason,
    }));
    const user = JSON.stringify({ pantry: [...pantry.keys()].map(name), sentences: items }, null, 2);
    const r = await callClaude({ model: REVIEW_MODEL, system: SYSTEM, messages: [{ role: 'user', content: user }], schema: SCHEMA, label: `review-${x.id}` });
    const verdicts = r.ok ? (r.structured?.verdicts ?? []) : [];
    if (!r.ok || verdicts.length !== items.length) throw new Error(`review failed or incomplete for ${x.id}: ${r.rec.result_head}`);
    for (const v of verdicts) out.push({ pantry: x.id, recipeId: x.finalOrder[v.index].recipeId, state: x.finalOrder[v.index].state, sentence: x.finalOrder[v.index].reason, ...v });
  }
}));

const order = (a: any, b: any) => a.pantry.localeCompare(b.pantry);
out.sort(order);
const summary = {
  reviewer: `AI reviewer (${[...new Set(CALL_LOG.flatMap((c: any) => c.models))].join(', ') || REVIEW_MODEL}), not a person`,
  sentences: out.length,
  saysTheyHaveSomethingTheyLack: out.filter((v) => v.saysTheyHaveSomethingTheyLack).length,
  namesIngredientNotInDish: out.filter((v) => v.namesIngredientNotInDish).length,
  calls: CALL_LOG.length,
  costUsdCliReported: Math.round(CALL_LOG.reduce((a: number, c: any) => a + (c.cost_usd_list ?? 0), 0) * 10000) / 10000,
};
const target = file.replace(/\.json$/, '-ai-review.json');
writeFileSync(target, JSON.stringify({ source: file.split('/').pop(), summary, verdicts: out, calls: CALL_LOG }, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const v of out.filter((v) => v.saysTheyHaveSomethingTheyLack || v.namesIngredientNotInDish)) console.log(v.pantry, v.recipeId, '|', v.sentence, '|', v.note);
console.log('wrote', target);
