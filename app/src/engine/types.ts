export type Unit = 'g' | 'ml' | 'piece' | 'bunch';
export type Storage = 'counter' | 'fridge' | 'freezer';
export type IngredientClass = 'staple' | 'perishable';

export type Diet = 'veg' | 'egg' | 'nonveg' | 'jain' | 'vegan';
export type RecipeDiet = 'veg' | 'egg' | 'nonveg';
export type Cooktop = 'gas' | 'induction' | 'both';
export type Equipment = 'cooker' | 'mixer' | 'oven' | 'airfryer' | 'microwave' | 'tawa' | 'kadhai';

/**
 * Fasting and festival observances. Each is a hard filter, not a preference: a household
 * keeping vrat during Navratri cannot eat onion, garlic or grain, and offering them a dish
 * containing any is the same class of mistake as ignoring an allergy.
 */
export type Observance = 'navratri' | 'shravan' | 'ekadashi' | 'no-onion-garlic';

export interface Ingredient {
  id: string;
  name: string;
  /** Hinglish and regional names. Search must match these as well as `name`. */
  aliases: string[];
  cls: IngredientClass;
  unit: Unit;
  /** Days before the item is gone. null for a staple, which does not spoil on this timescale. */
  shelfLifeDays: Partial<Record<Storage, number>> | null;
  /** Ambient use per adult per day, in `unit`. Only meaningful for staples. */
  burnPerAdultPerDay: number;
  /** Target stock per adult, in `unit`. Seeds the par level before learning kicks in. */
  parPerAdult: number;
  aisle: string;
  /** Populated for allergy filtering, e.g. 'dairy', 'nuts', 'gluten'. */
  allergens: string[];
  /** False for onion, garlic and root vegetables. */
  jainSafe: boolean;
  vegan: boolean;
  /** False for onion and garlic. Several observances exclude them. */
  alliumFree: boolean;
  /** False for wheat, rice and pulses, which vrat observances exclude. */
  vratSafe: boolean;
  /** Rough retail cost per base unit, in paise. Drives the budget read. */
  paisePerUnit: number;
  /**
   * Per ONE base unit, not per 100. Per gram for g, per ml for ml, per egg for piece.
   * Keeping it per-unit means every calculation is a plain multiply by quantity, with no
   * unit-dependent divisor to get wrong.
   */
  kcalPerUnit: number;
  proteinPerUnit: number;
}

export interface PantryItem {
  ingredientId: string;
  quantity: number;
  unit: Unit;
  storage: Storage;
  /** Epoch ms of the last time a human confirmed this, by restock, cook log or tap. */
  lastConfirmedAt: number;
}

export interface RecipeIngredient {
  ingredientId: string;
  /** Always stored for 2 adults. Scaled at read time. Never store a pre-scaled quantity. */
  qtyPer2Adults: number;
  unit: Unit;
  /** Core ingredients decide the dish state. Optional ones never do. */
  core: boolean;
}

export interface Recipe {
  id: string;
  name: string;
  cuisine: string;
  moods: string[];
  minutes: number;
  /** 1 easy, 2 moderate, 3 involved. */
  effort: 1 | 2 | 3;
  diet: RecipeDiet;
  jainSafe: boolean;
  vegan: boolean;
  equipment: Equipment[];
  /** 'gas-only' for anything needing an open flame: phulka on the fire, charred baingan. */
  cooktop: 'any' | 'gas-only';
  ingredients: RecipeIngredient[];
  /**
   * False until the quantities have been checked against a reference.
   * Unverified recipes may be suggested but are excluded from depletion math.
   * See AGENTS.md.
   */
  verified: boolean;
}

export interface Household {
  adults: number;
  children: number;
  cooktop: Cooktop;
  burners: number;
  diet: Diet;
  /** Allergen tags, matched against Ingredient.allergens. */
  allergies: string[];
  /** Ingredient ids the household will not eat, regardless of diet. */
  dislikes: string[];
  equipment: Equipment[];
  maxMinutesWeekday: number;
  maxMinutesWeekend: number;
  /** Active fasting or festival filters. Empty means no filter. */
  observances: Observance[];
  /** Weekly grocery budget in paise. Undefined means not tracked. */
  weeklyBudgetPaise?: number;
}

/** Cooked food already in the fridge. Always beats cooking something new from scratch. */
export interface Leftover {
  id: string;
  recipeId: string | null;
  label: string;
  portions: number;
  createdAt: number;
  /** Cooked food keeps about two days refrigerated. */
  expiresAt: number;
}

export interface CookLogEntry {
  recipeId: string;
  at: number;
  /**
   * The shared household this was cooked in, so sync only uploads it there. Absent while the
   * phone has never synced; the first sync stamps it.
   */
  householdId?: string;
}

/** The three states. Computed in code, never by the model. See AGENTS.md. */
export type DishState = 'cook-now' | 'need-items' | 'check-first';

export interface MissingItem {
  ingredientId: string;
  needed: number;
  have: number;
  unit: Unit;
}

export interface DishAssessment {
  recipeId: string;
  state: DishState;
  /** Core ingredients you do not have enough of. Empty unless state is 'need-items'. */
  missing: MissingItem[];
  /** Core ingredients present but stale enough that we will not vouch for them. */
  uncertain: string[];
  /** Optional ingredients that are absent. Never affects state. */
  optionalMissing: string[];
}

export type RequestKind = 'push' | 'pull';

export interface Suggestion {
  recipe: Recipe;
  assessment: DishAssessment;
  score: number;
  /** Plain-language reason, generated in code so it works with no network. */
  reason: string;
}
