// Computes the deterministic expectations for the rerank eval and freezes them to disk.
// Run once before any model call: bun run evals/harness/freeze-rerank.ts
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DS, buildState, loadRerank } from './fixtures';

const ds = loadRerank();
const out: any[] = [];
for (const st of ds.states) {
  const { suggestions } = buildState(ds, st);
  out.push({
    id: st.id,
    candidates: suggestions.map((s) => ({ recipeId: s.recipe.id, state: s.assessment.state, missing: s.assessment.missing.map((m) => m.ingredientId), uncertain: s.assessment.uncertain })),
    expect: {
      sameIdSet: suggestions.map((s) => s.recipe.id).sort(),
      cookNowFirst: suggestions.filter((s) => s.assessment.state === 'cook-now').map((s) => s.recipe.id).sort(),
      inventedIdsInOutput: 0,
    },
  });
}
writeFileSync(resolve(DS, 'rerank.expected.json'), JSON.stringify(out, null, 2));
for (const o of out) console.log(o.id, o.candidates.map((c: any) => `${c.recipeId}:${c.state}`).join(' '));
