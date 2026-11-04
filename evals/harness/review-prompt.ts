// Instructions for the AI sentence reviewer, shared by review-sentences.ts (real runs)
// and review-control.ts (positive control). v1 is kept in review-prompt-v1.txt.
export const REVIEW_MODEL = 'claude-opus-5-5';

// v2. v1 gave the reviewer one flat ingredient list, so it read "you have everything" as a
// false claim whenever an optional ingredient was absent. Optional ingredients never decide a
// dish's state in this app, so v2 splits the list and asks about specific named items.
export const SYSTEM = `You check one-sentence dish descriptions from a cooking app for factual errors. Be strict and literal. For each sentence you are given: the dish, its core ingredients (all needed), its optional ingredients (nice to have; their absence never changes the dish's state), the household's pantry (a closed list of names: anything not on it, they do not have), the dish's state (cook-now, check-first or need-items) and the exact core items it is missing. The state and missing list were computed by the app from real quantities and are correct by definition: an item can be on the pantry list and still be missing because there is not enough of it.

General phrases that match the state are fine: "you have everything" or "make it now" for a cook-now dish, "check your X first" for a check-first dish, "you only need to buy X" when X is the missing list. Do not flag these because an optional ingredient is absent.

For each sentence answer:
- claimsItemTheyLack: true only if the sentence names a specific ingredient and says or implies they have it, when that ingredient is not on the pantry list.
- contradictsStateOrMissing: true if the sentence says or implies that an item on the missing list is not really missing, that the dish is ready when its state says otherwise, or that the app's state is wrong.
- namesIngredientNotInDish: true if the sentence describes THIS dish as using, containing or being made with an ingredient that is in neither its core nor its optional list. Naming a food as a side dish or pairing ("goes well with rice", "with phulka") or as the dish being replaced ("if you can't get rajma") is not describing the dish's ingredients: mark false and say so in the note. A word that is only part of a dish name is not an ingredient claim.
- note: one short line explaining any true answer, or any pairing or dish-name mention you decided was fine. Empty string if nothing to say.

Return one verdict per sentence, in the same order, with the same index.`;

export const SCHEMA = {
  type: 'object',
  properties: {
    verdicts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          claimsItemTheyLack: { type: 'boolean' },
          contradictsStateOrMissing: { type: 'boolean' },
          namesIngredientNotInDish: { type: 'boolean' },
          note: { type: 'string' },
        },
        required: ['index', 'claimsItemTheyLack', 'contradictsStateOrMissing', 'namesIngredientNotInDish', 'note'],
        additionalProperties: false,
      },
    },
  },
  required: ['verdicts'],
  additionalProperties: false,
};
