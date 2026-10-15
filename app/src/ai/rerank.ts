import { INGREDIENT_INDEX } from '../data/ingredients';
import type { Household, Suggestion } from '../engine/types';
import { MODEL, getClient, noKey, toFailure, type AiResult } from './client';
import { reattach, type Reranked } from './reattach';

export type { Reranked } from './reattach';

/**
 * The LLM layer. It may reorder and describe. It may not decide anything.
 *
 * Dish states and missing-item lists are computed in src/engine/dishState.ts before this
 * file is reached, and this file reattaches them from the local objects afterwards. The
 * model's output is used for exactly two things: an ordering of ids, and a sentence per dish.
 * Even a maliciously wrong response can only produce an odd order or an odd sentence; it can
 * never tell the user they have paneer when they do not. See AGENTS.md.
 */

const SCHEMA = {
  type: 'object',
  properties: {
    ranked: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          recipeId: { type: 'string' },
          reason: { type: 'string' },
        },
        required: ['recipeId', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['ranked'],
  additionalProperties: false,
} as const;

const SYSTEM = `You help someone decide what to cook tonight. You are given candidate dishes that have already been checked against their kitchen.

Your job is to order them and write one short sentence per dish saying why it is worth cooking now.

Absolute rules:
- The pantry is a closed list. If an ingredient is not on it, they do not have it.
- Every dish arrives with a state and, where relevant, a list of exactly what is missing. Both were computed from their actual kitchen. Never contradict either. Never say or imply they have something the pantry does not list. Never claim a dish is ready when its state says otherwise.
- Return every recipeId you were given, exactly once, using the ids verbatim. Reorder them; do not add, drop, or rename any.

Writing the sentence:
- One sentence. Plain, warm, specific. No preamble, no emoji, no exclamation marks.
- Lead with the reason it suits tonight: something about to spoil, how long it takes, how long since they made it, how it fits the mood they asked for.
- For a dish that needs shopping, name what is missing and nothing more.
- Do not restate the dish name. They can already see it.
- Only mention ingredients that are in this dish: its "ingredients" or "optionalIngredients" list. Never describe a dish as using something that is not on those lists, even if the pantry has it.`;

function payload(
  suggestions: Suggestion[],
  household: Household,
  pantryNames: string[],
  mood: string | undefined,
): string {
  const dishes = suggestions.map((s) => ({
    recipeId: s.recipe.id,
    name: s.recipe.name,
    cuisine: s.recipe.cuisine,
    minutes: s.recipe.minutes,
    effort: s.recipe.effort,
    moods: s.recipe.moods,
    ingredients: s.recipe.ingredients
      .filter((ri) => ri.core)
      .map((ri) => INGREDIENT_INDEX.get(ri.ingredientId)?.name ?? ri.ingredientId),
    optionalIngredients: s.recipe.ingredients
      .filter((ri) => !ri.core)
      .map((ri) => INGREDIENT_INDEX.get(ri.ingredientId)?.name ?? ri.ingredientId),
    state: s.assessment.state,
    missing: s.assessment.missing.map(
      (m) => INGREDIENT_INDEX.get(m.ingredientId)?.name ?? m.ingredientId,
    ),
    uncertain: s.assessment.uncertain.map(
      (id) => INGREDIENT_INDEX.get(id)?.name ?? id,
    ),
  }));

  return JSON.stringify(
    {
      household: {
        eating: household.adults + household.children,
        cooktop: household.cooktop,
        burners: household.burners,
        diet: household.diet,
      },
      whatTheyAskedFor: mood ?? null,
      pantry: pantryNames,
      dishes,
    },
    null,
    2,
  );
}

/**
 * Returns the same suggestions, possibly reordered, with better sentences.
 *
 * On any failure the caller gets the deterministic order and the deterministic sentences.
 * That is the whole degradation story: no network means a slightly duller Today screen,
 * never a broken one.
 */
export async function rerank(
  suggestions: Suggestion[],
  household: Household,
  pantryIngredientIds: string[],
  mood?: string,
): Promise<AiResult<Reranked[]>> {
  if (suggestions.length === 0) return { ok: true, value: [] };

  const client = await getClient();
  if (!client) return noKey();

  const pantryNames = pantryIngredientIds
    .map((id) => INGREDIENT_INDEX.get(id)?.name)
    .filter((n): n is string => !!n);

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      messages: [
        { role: 'user', content: payload(suggestions, household, pantryNames, mood) },
      ],
    });

    if (response.stop_reason === 'refusal') {
      return { ok: false, reason: 'refused', message: 'Claude declined that request.' };
    }

    const text = response.content.find((b) => b.type === 'text');
    if (!text || text.type !== 'text') {
      return { ok: false, reason: 'bad-output', message: 'No ranking came back.' };
    }

    const parsed = JSON.parse(text.text) as { ranked: { recipeId: string; reason: string }[] };
    return { ok: true, value: reattach(suggestions, parsed.ranked) };
  } catch (err) {
    return toFailure<Reranked[]>(err);
  }
}

/**
 * Free-text mood to a search hint. Used when the deterministic keyword match finds nothing,
 * so "something to cure a hangover" still lands on egg bhurji.
 */
export async function interpretMood(text: string): Promise<AiResult<string[]>> {
  const client = await getClient();
  if (!client) return noKey();

  const MOOD_SCHEMA = {
    type: 'object',
    properties: {
      moods: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['comfort', 'quick', 'light', 'wholesome', 'weekend', 'impress', 'breakfast', 'hungover', 'everyday'],
        },
      },
    },
    required: ['moods'],
    additionalProperties: false,
  } as const;

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 300,
      system:
        'Map what someone says they feel like eating onto zero or more mood tags. Return only tags that genuinely fit. An empty list is a fine answer.',
      output_config: { format: { type: 'json_schema', schema: MOOD_SCHEMA } },
      messages: [{ role: 'user', content: text }],
    });

    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') {
      return { ok: false, reason: 'bad-output', message: 'No tags came back.' };
    }
    return { ok: true, value: (JSON.parse(block.text) as { moods: string[] }).moods };
  } catch (err) {
    return toFailure<string[]>(err);
  }
}
