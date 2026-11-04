// Computes the deterministic expectations for the rerank eval and freezes them to disk.
// Run once before any model call: bun run evals/harness/freeze-rerank.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { RECIPE_INDEX } from '../../app/src/data/recipes';
import { DS, NEW_FILE, SET, buildState, loadRerank } from './fixtures';

const ds = loadRerank();
const out: any[] = [];
for (const st of ds.states) {
  const { suggestions } = buildState(ds, st);
  out.push({
    id: st.id,
    candidates: suggestions.map((s) => ({
      recipeId: s.recipe.id, state: s.assessment.state, missing: s.assessment.missing.map((m) => m.ingredientId), uncertain: s.assessment.uncertain,
      // New set only: the ingredients a sentence about this dish may name (core and optional).
      ...(SET === 'new' ? { recipeIngredients: RECIPE_INDEX.get(s.recipe.id)!.ingredients.map((r) => r.ingredientId) } : {}),
    })),
    expect: {
      sameIdSet: suggestions.map((s) => s.recipe.id).sort(),
      cookNowFirst: suggestions.filter((s) => s.assessment.state === 'cook-now').map((s) => s.recipe.id).sort(),
      inventedIdsInOutput: 0,
    },
  });
}
if (SET === 'new') {
  // The answer key sits in the same file as the cases, one line per pantry.
  const raw = readFileSync(NEW_FILE, 'utf8');
  const key = `"answerKey": {\n    "rerank": [\n${out.map((o) => '      ' + JSON.stringify(o)).join(',\n')}\n    ]\n  }\n}\n`;
  const next = raw.replace(/"answerKey": [\s\S]*$/, key);
  if (next === raw && !raw.includes(key)) throw new Error('answerKey block not found');
  writeFileSync(NEW_FILE, next);
} else {
  writeFileSync(resolve(DS, 'rerank.expected.json'), JSON.stringify(out, null, 2));
}
for (const o of out) console.log(o.id, o.candidates.map((c: any) => `${c.recipeId}:${c.state}`).join(' '));
