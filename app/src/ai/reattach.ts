import type { DishState, Suggestion } from '../engine/types';

/**
 * The enforcement point for the rerank call, kept free of SDK imports so it can be tested
 * offline. See rerank.ts and AGENTS.md.
 */

export interface Reranked {
  suggestion: Suggestion;
  /** Claude's sentence, or the deterministic one if the call failed or was ignored. */
  reason: string;
}

/** Cook-now first, then check-first, then need-items. The model never overrides this. */
const STATE_RANK: Record<DishState, number> = { 'cook-now': 0, 'check-first': 1, 'need-items': 2 };

export function sanitise(reason: string): string {
  const one = reason.trim().replace(/\s+/g, ' ');
  if (one.length === 0 || one.length > 200) return '';
  return one;
}

/**
 * Walks the model's ordering, resolves each id against our own suggestion objects, and keeps
 * only the sentence. A hallucinated id resolves to nothing and is dropped. Any dish the model
 * forgot is kept with its deterministic sentence. The assessment attached to each result is
 * the one this device computed, never anything the model sent back.
 *
 * Finally the list is stable-sorted by dish state, so the model's order only applies within a
 * state: a response that puts a need-items dish first cannot rank it above a dish the user
 * can cook now, and a cook-now dish the model left out returns to the cook-now group.
 */
export function reattach(
  suggestions: Suggestion[],
  ranked: { recipeId: string; reason: string }[],
): Reranked[] {
  const byId = new Map(suggestions.map((s) => [s.recipe.id, s]));
  const out: Reranked[] = [];
  const used = new Set<string>();

  for (const entry of ranked) {
    const s = byId.get(entry.recipeId);
    if (!s || used.has(entry.recipeId)) continue;
    used.add(entry.recipeId);
    out.push({ suggestion: s, reason: sanitise(entry.reason) || s.reason });
  }

  // Anything the model dropped still gets shown, with its deterministic sentence.
  for (const s of suggestions) {
    if (!used.has(s.recipe.id)) out.push({ suggestion: s, reason: s.reason });
  }

  return out
    .map((r, i) => ({ r, i }))
    .sort(
      (a, b) =>
        STATE_RANK[a.r.suggestion.assessment.state] - STATE_RANK[b.r.suggestion.assessment.state] ||
        a.i - b.i,
    )
    .map((x) => x.r);
}
