// Re-applies the deterministic sentence checks to a saved results file (no CLI calls).
// Usage: bun --no-install evals/harness/rescore.ts evals/results/<file>.json
import { readFileSync, writeFileSync } from 'node:fs';
import { buildState, loadRerank } from './fixtures';
import { sentenceIssues } from './sentences';
const f = process.argv[2]!;
const d = JSON.parse(readFileSync(f, 'utf8'));
const ds = loadRerank();
for (const x of d.rerank) {
  const st = ds.states.find((s: any) => s.id === x.id);
  const { pantry, suggestions } = buildState(ds, st);
  const miss = new Map(suggestions.map((s) => [s.recipe.id, s.assessment.missing.map((m) => m.ingredientId)]));
  x.contentFlags = x.finalOrder.flatMap((e: any) => sentenceIssues(e, [...pantry.keys()], miss.get(e.recipeId)!));
}
const all = d.rerank.flatMap((x: any) => x.contentFlags);
d.summary.rerank.sentences = d.rerank.reduce((a: number, x: any) => a + x.finalOrder.length, 0);
d.summary.rerank.sentencesMentioningItemNotInPantryOrMissing = all.filter((f: any) => f.kind === 'mentions-item-not-in-pantry-or-missing-list').length;
d.summary.rerank.sentencesMentioningItemNotInRecipe = all.filter((f: any) => f.kind === 'mentions-item-not-in-this-recipe').length;
writeFileSync(f, JSON.stringify(d, null, 2));
console.log(JSON.stringify(d.summary.rerank, null, 2));
for (const fl of all) console.log(fl.kind, fl.recipeId, fl.ingredient, '|', fl.reason);
