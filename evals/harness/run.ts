// Kokum AI eval: parse + rerank, through the app's real parseText/parseImage/rerank
// (real prompts, schema, normalise() and reattach()); only the transport is the Claude Code CLI.
// Usage: evals/harness/setup-shims.sh && bun --no-install evals/harness/run.ts [parse|rerank|adversarial|all]
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseImage, parseText } from '../../app/src/ai/parse';
import { rerank } from '../../app/src/ai/rerank';
import { MODEL } from '../../app/src/ai/client';
import { INGREDIENT_INDEX } from '../../app/src/data/ingredients';
import { CALL_LOG, EVAL_CTX } from './claude-cli.mjs';
import { DS, buildState, loadRerank } from './fixtures';
import { sentenceIssues } from './sentences';

const which = process.argv[2] ?? 'all';
const CONC = 3;

async function pool<T, R>(items: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONC }, async () => {
    while (i < items.length) { if (CALL_LOG.some((c: any) => c.limit_hit)) throw new Error('CLI usage limit hit; stopping'); const k = i++; const t = items[k]! as any; out[k] = await EVAL_CTX.run({ label: t.id }, () => fn(t)); }
  }));
  return out;
}

const close = (a: number, b: number) => Math.abs(a - b) <= Math.max(0.01 * Math.abs(b), 1e-9);

async function runParse() {
  const ds = JSON.parse(readFileSync(resolve(DS, 'parse.json'), 'utf8'));
  return pool(ds.items, async (it: any) => {
    const t0 = Date.now();
    const res = it.image
      ? await parseImage(readFileSync(resolve(DS, it.image)).toString('base64'), 'image/png', it.source)
      : await parseText(it.text, it.source);
    const ms = Date.now() - t0;
    const raw = (EVAL_CTX.getStore() as any)?.last?.structured ?? null;
    const misses: { category: string; detail: string }[] = [];
    if (!res.ok) {
      misses.push({ category: 'call-failed', detail: `${res.reason}: ${res.message}` });
      return { id: it.id, pass: false, ms, misses, output: null, raw };
    }
    const { lines, unparsed, totalPaise } = res.value;
    const expectIds = new Set(it.expect.map((e: any) => e[0]));
    for (const [id, qty] of it.expect) {
      const hits = lines.filter((l) => l.ingredientId === id);
      if (hits.length === 0) { misses.push({ category: 'missed-item', detail: `${id} not extracted` }); continue; }
      const sum = hits.reduce((a, l) => a + l.quantity, 0);
      if (qty !== null && !close(sum, qty)) misses.push({ category: 'wrong-quantity', detail: `${id}: got ${sum} ${hits[0]!.unit}, expected ${qty}` });
      const unit = INGREDIENT_INDEX.get(id)!.unit;
      if (hits.some((h) => h.unit !== unit)) misses.push({ category: 'wrong-unit', detail: `${id}: unit ${hits[0]!.unit}, dictionary ${unit}` });
      if (it.flexQty?.includes(id) && hits.some((h) => h.confidence > it.maxConfidence)) misses.push({ category: 'overconfident', detail: `${id}: confidence ${hits[0]!.confidence} > ${it.maxConfidence} for a pack with no weight` });
      if (it.expectPricePaise?.[id] !== undefined && hits[0]!.pricePaise !== it.expectPricePaise[id]) misses.push({ category: 'wrong-price', detail: `${id}: price ${hits[0]!.pricePaise}, expected ${it.expectPricePaise[id]}` });
    }
    for (const l of lines) {
      if (l.ingredientId && !expectIds.has(l.ingredientId)) misses.push({ category: 'invented-or-wrong-match', detail: `extra line ${l.ingredientId} from "${l.rawText}"` });
    }
    for (const kw of it.oov ?? []) {
      const mapped = lines.find((l) => l.ingredientId && l.rawText.toLowerCase().includes(kw));
      if (mapped) misses.push({ category: 'oov-forced-match', detail: `"${kw}" mapped to ${mapped.ingredientId}` });
      const surfaced = unparsed.some((u) => u.toLowerCase().includes(kw)) || lines.some((l) => !l.ingredientId && l.rawText.toLowerCase().includes(kw));
      if (it.source !== 'bill' && !surfaced) misses.push({ category: 'oov-vanished', detail: `"${kw}" neither in unparsed nor a null-id line` });
    }
    if (it.expectTotalPaise !== undefined && totalPaise !== it.expectTotalPaise) misses.push({ category: 'wrong-total', detail: `total ${totalPaise}, expected ${it.expectTotalPaise}` });
    return { id: it.id, source: it.source, pass: misses.length === 0, ms, misses, output: res.value, raw };
  });
}

async function runRerank() {
  const ds = loadRerank();
  const frozen = JSON.parse(readFileSync(resolve(DS, 'rerank.expected.json'), 'utf8'));
  return pool(ds.states, async (st: any) => {
    const { household, pantry, suggestions } = buildState(ds, st);
    const exp = frozen.find((f: any) => f.id === st.id);
    const ids = suggestions.map((s) => s.recipe.id);
    if (JSON.stringify([...ids].sort()) !== JSON.stringify(exp.expect.sameIdSet)) throw new Error(`fixture drift on ${st.id}`);
    const t0 = Date.now();
    const res = await rerank(suggestions, household, [...pantry.keys()], st.mood ?? undefined);
    const ms = Date.now() - t0;
    const raw = (EVAL_CTX.getStore() as any)?.last?.structured ?? null;
    const misses: { category: string; detail: string }[] = [];
    if (!res.ok) {
      misses.push({ category: 'call-failed', detail: `${res.reason}: ${res.message}` });
      return { id: st.id, pass: false, ms, misses };
    }
    const rawIds: string[] = (raw?.ranked ?? []).map((r: any) => r.recipeId);
    const invented = rawIds.filter((r) => !ids.includes(r));
    const dupes = rawIds.filter((r, i) => rawIds.indexOf(r) !== i);
    const omittedByModel = ids.filter((r) => !rawIds.includes(r));
    const finalIds = res.value.map((r) => r.suggestion.recipe.id);
    const inventedSurvived = finalIds.filter((r) => !ids.includes(r));
    const retained = finalIds.length === ids.length && ids.every((r) => finalIds.includes(r));
    const stateOf = new Map(suggestions.map((s) => [s.recipe.id, s.assessment.state]));
    const firstNonCook = finalIds.findIndex((r) => stateOf.get(r) !== 'cook-now');
    const lastCook = finalIds.map((r) => stateOf.get(r)).lastIndexOf('cook-now');
    const cookFirst = firstNonCook === -1 || lastCook < firstNonCook;
    const top1Cook = stateOf.get(finalIds[0]!) === 'cook-now';
    const checkBeforeNeed = (() => {
      const firstNeed = finalIds.findIndex((r) => stateOf.get(r) === 'need-items');
      const lastCheck = finalIds.map((r) => stateOf.get(r)).lastIndexOf('check-first');
      return firstNeed === -1 || lastCheck === -1 || lastCheck < firstNeed;
    })();
    if (inventedSurvived.length) misses.push({ category: 'invented-id-survived', detail: inventedSurvived.join(',') });
    if (!retained) misses.push({ category: 'dish-dropped', detail: `final ${finalIds.join(',')}` });
    if (!cookFirst) misses.push({ category: 'non-cookable-ranked-above-cookable', detail: finalIds.map((r) => `${r}:${stateOf.get(r)}`).join(' ') });
    // Secondary, heuristic sentence checks (not part of pass/fail)
    const sentenceFlags: string[] = [];
    for (const r of res.value) {
      const st2 = r.suggestion.assessment.state;
      const txt = r.reason.toLowerCase();
      if (st2 === 'need-items') {
        const names = r.suggestion.assessment.missing.map((m) => INGREDIENT_INDEX.get(m.ingredientId)!);
        const named = names.some((n) => [n.name, ...n.aliases].some((a) => txt.includes(a.toLowerCase())));
        if (!named) sentenceFlags.push(`${r.suggestion.recipe.id}: need-items sentence names no missing item: "${r.reason}"`);
      }
      if (st2 === 'cook-now' && /\b(need to buy|pick up|you need|missing|buy )/.test(txt)) sentenceFlags.push(`${r.suggestion.recipe.id}: cook-now sentence implies shopping: "${r.reason}"`);
      if (r.reason.includes('!')) sentenceFlags.push(`${r.suggestion.recipe.id}: exclamation mark`);
    }
    const contentFlags = res.value.flatMap((r) => sentenceIssues({ recipeId: r.suggestion.recipe.id, state: r.suggestion.assessment.state, reason: r.reason }, [...pantry.keys()], r.suggestion.assessment.missing.map((m) => m.ingredientId)));
    return {
      id: st.id, mood: st.mood, pass: misses.length === 0, ms, misses,
      rawInventedIds: invented, rawDuplicateIds: dupes, rawOmittedIds: omittedByModel,
      retained, cookFirst, top1Cook, checkBeforeNeed, sentenceFlags, contentFlags,
      finalOrder: res.value.map((r) => ({ recipeId: r.suggestion.recipe.id, state: r.suggestion.assessment.state, reason: r.reason })),
    };
  });
}

/** Offline: feed rerank() a hostile canned response (no CLI call) to exercise reattach(). */
async function reattachAdversarial() {
  const ds = loadRerank();
  const st = ds.states[0];
  const { household, pantry, suggestions } = buildState(ds, st);
  const ids = suggestions.map((s) => s.recipe.id);
  const cookNow = suggestions.filter((s) => s.assessment.state === 'cook-now').map((s) => s.recipe.id);
  const canned = { ranked: [
    { recipeId: 'butter-chicken', reason: 'You have chicken.' },
    { recipeId: ids[ids.length - 1], reason: 'x'.repeat(250) },
    { recipeId: ids[ids.length - 1], reason: 'duplicate' },
    ...ids.slice(1, -1).map((r) => ({ recipeId: r, reason: 'ok' })),
  ] }; // ids[0] (a cook-now dish) deliberately omitted
  const res = await EVAL_CTX.run({ canned }, () => rerank(suggestions, household, [...pantry.keys()]));
  if (!res.ok) return { ok: false };
  const finalIds = res.value.map((r) => r.suggestion.recipe.id);
  return {
    inventedDropped: !finalIds.includes('butter-chicken'),
    duplicatesCollapsed: finalIds.length === ids.length,
    omittedRestored: finalIds.includes(ids[0]!),
    overlongReasonReplaced: res.value.find((r) => r.suggestion.recipe.id === ids[ids.length - 1])!.reason !== 'x'.repeat(250),
    omittedCookNowLandsAfterNeedItems: cookNow.includes(ids[0]!) && finalIds.indexOf(ids[0]!) === finalIds.length - 1,
    cookNowFirstEnforced: (() => { const st = finalIds.map((r) => suggestions.find((s) => s.recipe.id === r)!.assessment.state); const f = st.findIndex((x) => x !== 'cook-now'); return f === -1 || st.slice(f).every((x) => x !== 'cook-now'); })(),
    finalOrder: finalIds.map((r) => `${r}:${suggestions.find((s) => s.recipe.id === r)!.assessment.state}`),
  };
}

const started = new Date().toISOString();
const t0 = Date.now();
const parse = which === 'rerank' || which === 'adversarial' ? null : await runParse();
const rr = which === 'parse' || which === 'adversarial' ? null : await runRerank();
const wallMs = Date.now() - t0;
const adversarial = which === 'parse' ? null : await reattachAdversarial();

const lat = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return { n: s.length, p50: s[Math.floor(s.length / 2)], p90: s[Math.floor(s.length * 0.9)] ?? s[s.length - 1], max: s[s.length - 1] }; };
const sumUsage = CALL_LOG.reduce((a: any, c: any) => { if (c.usage) { a.input += c.usage.input_tokens + (c.usage.cache_read_input_tokens ?? 0) + (c.usage.cache_creation_input_tokens ?? 0); a.output += c.usage.output_tokens; } return a; }, { input: 0, output: 0 });

const summary: any = { started, wallMs, configuredModel: MODEL, modelsAnswered: [...new Set(CALL_LOG.flatMap((c: any) => c.models))], cliCalls: CALL_LOG.length, cliErrors: CALL_LOG.filter((c: any) => c.is_error).length, usageTotals: sumUsage, callLatencyMs: lat(CALL_LOG.map((c: any) => c.ms)) };
if (parse) {
  const allExpected = parse.reduce((a, p: any) => a, 0);
  const missCats: Record<string, number> = {};
  for (const p of parse as any[]) for (const m of p.misses) missCats[m.category] = (missCats[m.category] ?? 0) + 1;
  const ds = JSON.parse(readFileSync(resolve(DS, 'parse.json'), 'utf8'));
  const totalLines = ds.items.reduce((a: number, i: any) => a + i.expect.length, 0);
  const missedLines = (parse as any[]).reduce((a, p) => a + p.misses.filter((m: any) => m.category === 'missed-item' || m.category === 'call-failed').length, 0);
  const qtyWrong = (parse as any[]).reduce((a, p) => a + p.misses.filter((m: any) => m.category === 'wrong-quantity').length, 0);
  summary.parse = { items: parse.length, itemsPassed: parse.filter((p: any) => p.pass).length, expectedLines: totalLines, linesExtracted: totalLines - missedLines, linesQtyCorrect: totalLines - missedLines - qtyWrong, missCategories: missCats };
  void allExpected;
}
if (rr) {
  const r = rr as any[];
  summary.rerank = {
    states: r.length, statesPassed: r.filter((x) => x.pass).length,
    rawInventedIdCount: r.reduce((a, x) => a + (x.rawInventedIds?.length ?? 0), 0),
    inventedIdsSurvivingReattach: r.reduce((a, x) => a + x.misses.filter((m: any) => m.category === 'invented-id-survived').length, 0),
    rawOmittedIdCount: r.reduce((a, x) => a + (x.rawOmittedIds?.length ?? 0), 0),
    allDishesRetained: r.filter((x) => x.retained).length,
    cookableFirst: r.filter((x) => x.cookFirst).length,
    top1Cookable: r.filter((x) => x.top1Cook).length,
    checkFirstBeforeNeedItems: r.filter((x) => x.checkBeforeNeed).length,
    sentenceFlags: r.reduce((a, x) => a + (x.sentenceFlags?.length ?? 0), 0),
    sentences: r.reduce((a, x) => a + (x.finalOrder?.length ?? 0), 0),
    sentencesMentioningItemNotInPantryOrMissing: r.flatMap((x) => x.contentFlags ?? []).filter((f: any) => f.kind === 'mentions-item-not-in-pantry-or-missing-list').length,
    sentencesMentioningItemNotInRecipe: r.flatMap((x) => x.contentFlags ?? []).filter((f: any) => f.kind === 'mentions-item-not-in-this-recipe').length,
  };
}
const date = started.slice(0, 10);
const file = resolve(import.meta.dir, '..', 'results', `${date}-claude-cli${which === 'all' ? '' : '-' + which}${process.env.EVAL_TAG ? '-' + process.env.EVAL_TAG : ''}.json`);
writeFileSync(file, JSON.stringify({ method: 'Claude Code CLI (claude -p) with the app\'s own prompts, schema and post-processing; not the production API path', summary, parse, rerank: rr, reattachAdversarial: adversarial, calls: CALL_LOG }, null, 2));
console.log(JSON.stringify({ ...summary, reattachAdversarial: adversarial }, null, 2));
console.log('wrote', file);
