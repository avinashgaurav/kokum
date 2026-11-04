// Positive control for the AI sentence reviewer: runs the same instructions (review-prompt.ts)
// on hand-written sentences with a known answer (datasets/review-control.json) and counts
// how many known-bad sentences it catches and how many known-good ones it wrongly flags.
// Usage: bun --no-install evals/harness/review-control.ts [runs=3]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INGREDIENT_INDEX } from '../../app/src/data/ingredients';
import { RECIPE_INDEX } from '../../app/src/data/recipes';
import { CALL_LOG, callClaude } from './claude-cli.mjs';
import { DS } from './fixtures';
import { REVIEW_MODEL, SCHEMA, SYSTEM } from './review-prompt';

const RUNS = Number(process.argv[2] ?? 3);
const ctl = JSON.parse(readFileSync(resolve(DS, 'review-control.json'), 'utf8'));
const name = (id: string) => INGREDIENT_INDEX.get(id)?.name ?? id;
const FIELDS = ['claimsItemTheyLack', 'contradictsStateOrMissing', 'namesIngredientNotInDish'];

const runs: any[] = [];
for (let run = 1; run <= RUNS; run++) {
  const verdicts: any[] = [];
  for (const g of ctl.groups) {
    // Same shape review-sentences.ts sends for a real pantry.
    const items = g.sentences.map((x: any, i: number) => ({
      index: i,
      dish: RECIPE_INDEX.get(x.recipeId)!.name,
      coreIngredients: RECIPE_INDEX.get(x.recipeId)!.ingredients.filter((r) => r.core).map((r) => name(r.ingredientId)),
      optionalIngredients: RECIPE_INDEX.get(x.recipeId)!.ingredients.filter((r) => !r.core).map((r) => name(r.ingredientId)),
      state: x.state,
      missing: x.missing,
      sentence: x.sentence,
    }));
    const user = JSON.stringify({ pantry: g.pantry, sentences: items }, null, 2);
    const r = await callClaude({ model: REVIEW_MODEL, system: SYSTEM, messages: [{ role: 'user', content: user }], schema: SCHEMA, label: `control-${g.id}-run${run}` });
    const vs = r.ok ? (r.structured?.verdicts ?? []) : [];
    if (!r.ok || vs.length !== items.length) throw new Error(`control review failed for ${g.id}: ${r.rec.result_head}`);
    for (const v of vs) {
      const x = g.sentences[v.index];
      const flagged = FIELDS.filter((f) => v[f]);
      verdicts.push({
        group: g.id, recipeId: x.recipeId, sentence: x.sentence, expect: x.expect, catch: x.catch ?? null, flagged, note: v.note,
        caught: x.expect === 'bad' ? !!v[x.catch] : null,
        caughtAnyField: x.expect === 'bad' ? flagged.length > 0 : null,
        falseAlarm: x.expect === 'good' ? flagged.length > 0 : null,
      });
    }
  }
  const bad = verdicts.filter((v) => v.expect === 'bad');
  const good = verdicts.filter((v) => v.expect === 'good');
  runs.push({
    run,
    badCaught: bad.filter((v) => v.caught).length,
    badCaughtAnyField: bad.filter((v) => v.caughtAnyField).length,
    bad: bad.length,
    goodFalseAlarms: good.filter((v) => v.falseAlarm).length,
    good: good.length,
    byCategory: Object.fromEntries(FIELDS.map((f) => [f, `${bad.filter((v) => v.catch === f && v.caught).length} / ${bad.filter((v) => v.catch === f).length}`])),
    misses: bad.filter((v) => !v.caught),
    falseAlarms: good.filter((v) => v.falseAlarm),
    verdicts,
  });
}
const summary = {
  reviewer: `AI reviewer (${[...new Set(CALL_LOG.flatMap((c: any) => c.models))].join(', ') || REVIEW_MODEL}), instructions v2`,
  runs: runs.map(({ run, badCaught, badCaughtAnyField, bad, goodFalseAlarms, good, byCategory }) => ({ run, badCaught, badCaughtAnyField, bad, goodFalseAlarms, good, byCategory })),
  calls: CALL_LOG.length,
  costUsdCliReported: Math.round(CALL_LOG.reduce((a: number, c: any) => a + (c.cost_usd_list ?? 0), 0) * 10000) / 10000,
};
const date = new Date().toISOString().slice(0, 10);
const file = resolve(import.meta.dir, '..', 'results', `${date}-review-control.json`);
writeFileSync(file, JSON.stringify({ summary, runs, calls: CALL_LOG }, null, 2));
console.log(JSON.stringify(summary, null, 2));
for (const r of runs) { for (const m of r.misses) console.log(`run${r.run} MISS`, m.recipeId, '|', m.sentence, '|', m.flagged.join(','), '|', m.note); for (const m of r.falseAlarms) console.log(`run${r.run} FALSE ALARM`, m.recipeId, '|', m.sentence, '|', m.flagged.join(','), '|', m.note); }
console.log('wrote', file);
