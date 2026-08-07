import type { Ingredient } from '../engine/types';

/**
 * Canonical ingredient dictionary, seed set.
 *
 * The alias list is load-bearing, not decoration: it is what turns "tamatar", "टमाटर" and
 * "Tomatoes (1kg pack)" into one row you can do arithmetic on. Every new ingredient needs
 * its Hinglish and Devanagari forms at minimum.
 *
 * Shelf lives are conservative on purpose. Telling someone their coriander died a day early
 * costs a wasted bunch; telling them a day late costs their trust in the whole app.
 */
export const INGREDIENTS: Ingredient[] = [
  // ---------- staples ----------
  {
    id: 'atta', name: 'Atta', aliases: ['wheat flour', 'gehu ka atta', 'आटा'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 80, parPerAdult: 2500, aisle: 'Staples',
    allergens: ['gluten'], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: false,
    paisePerUnit: 5, kcalPerUnit: 3.4, proteinPerUnit: 0.12,
  },
  {
    id: 'rice', name: 'Rice', aliases: ['chawal', 'चावल', 'basmati'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 70, parPerAdult: 2500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: false,
    paisePerUnit: 8, kcalPerUnit: 3.5, proteinPerUnit: 0.07,
  },
  {
    id: 'toor-dal', name: 'Toor dal', aliases: ['arhar', 'tuvar', 'तूर दाल'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 25, parPerAdult: 1000, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: false,
    paisePerUnit: 16, kcalPerUnit: 3.4, proteinPerUnit: 0.22,
  },
  {
    id: 'moong-dal', name: 'Moong dal', aliases: ['मूंग दाल'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 12, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: false,
    paisePerUnit: 14, kcalPerUnit: 3.5, proteinPerUnit: 0.24,
  },
  {
    id: 'chana-dal', name: 'Chana dal', aliases: ['चना दाल'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 8, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: false,
    paisePerUnit: 12, kcalPerUnit: 3.6, proteinPerUnit: 0.2,
  },
  {
    id: 'rajma', name: 'Rajma', aliases: ['kidney beans', 'राजमा'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 6, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: false,
    paisePerUnit: 18, kcalPerUnit: 3.3, proteinPerUnit: 0.24,
  },
  {
    id: 'besan', name: 'Besan', aliases: ['gram flour', 'बेसन'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 8, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: false,
    paisePerUnit: 12, kcalPerUnit: 3.9, proteinPerUnit: 0.22,
  },
  {
    id: 'poha', name: 'Poha', aliases: ['flattened rice', 'पोहा'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 10, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: false,
    paisePerUnit: 6, kcalPerUnit: 3.5, proteinPerUnit: 0.07,
  },
  {
    id: 'oil', name: 'Cooking oil', aliases: ['tel', 'तेल', 'sunflower oil'],
    cls: 'staple', unit: 'ml', shelfLifeDays: null,
    burnPerAdultPerDay: 25, parPerAdult: 1000, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 15, kcalPerUnit: 8.8, proteinPerUnit: 0.0,
  },
  {
    id: 'ghee', name: 'Ghee', aliases: ['घी', 'clarified butter'],
    cls: 'staple', unit: 'ml', shelfLifeDays: null,
    burnPerAdultPerDay: 8, parPerAdult: 500, aisle: 'Dairy',
    allergens: ['dairy'], jainSafe: true, vegan: false,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 65, kcalPerUnit: 9.0, proteinPerUnit: 0.0,
  },
  {
    id: 'salt', name: 'Salt', aliases: ['namak', 'नमक'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 6, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 2, kcalPerUnit: 0.0, proteinPerUnit: 0.0,
  },
  {
    id: 'sugar', name: 'Sugar', aliases: ['cheeni', 'चीनी'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 15, parPerAdult: 1000, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 5, kcalPerUnit: 4.0, proteinPerUnit: 0.0,
  },
  {
    id: 'turmeric', name: 'Haldi', aliases: ['turmeric', 'हल्दी'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 30, kcalPerUnit: 3.1, proteinPerUnit: 0.08,
  },
  {
    id: 'chilli-powder', name: 'Lal mirch', aliases: ['chilli powder', 'लाल मिर्च'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1.5, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 35, kcalPerUnit: 2.8, proteinPerUnit: 0.12,
  },
  {
    id: 'garam-masala', name: 'Garam masala', aliases: ['गरम मसाला'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 60, kcalPerUnit: 3.8, proteinPerUnit: 0.12,
  },
  {
    id: 'jeera', name: 'Jeera', aliases: ['cumin', 'जीरा'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1.5, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 45, kcalPerUnit: 3.75, proteinPerUnit: 0.18,
  },
  {
    id: 'mustard-seed', name: 'Rai', aliases: ['mustard seeds', 'राई', 'sarson'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 20, kcalPerUnit: 4.8, proteinPerUnit: 0.26,
  },
  {
    id: 'kasuri-methi', name: 'Kasuri methi', aliases: ['dried fenugreek', 'कसूरी मेथी'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 0.5, parPerAdult: 50, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 80, kcalPerUnit: 3.2, proteinPerUnit: 0.23,
  },

  // ---------- perishables ----------
  {
    id: 'onion', name: 'Onion', aliases: ['pyaaz', 'kanda', 'प्याज'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 21, fridge: 30 },
    burnPerAdultPerDay: 0, parPerAdult: 1000, aisle: 'Vegetables',
    allergens: [], jainSafe: false, vegan: true,
    alliumFree: false, vratSafe: false,
    paisePerUnit: 4, kcalPerUnit: 0.4, proteinPerUnit: 0.011,
  },
  {
    id: 'tomato', name: 'Tomato', aliases: ['tamatar', 'टमाटर'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 6, fridge: 12 },
    burnPerAdultPerDay: 0, parPerAdult: 750, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 4, kcalPerUnit: 0.18, proteinPerUnit: 0.009,
  },
  {
    id: 'potato', name: 'Potato', aliases: ['aloo', 'batata', 'आलू'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 25, fridge: 30 },
    burnPerAdultPerDay: 0, parPerAdult: 1000, aisle: 'Vegetables',
    allergens: [], jainSafe: false, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 3, kcalPerUnit: 0.77, proteinPerUnit: 0.02,
  },
  {
    id: 'garlic', name: 'Garlic', aliases: ['lehsun', 'लहसुन'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 30, fridge: 45 },
    burnPerAdultPerDay: 0, parPerAdult: 150, aisle: 'Vegetables',
    allergens: [], jainSafe: false, vegan: true,
    alliumFree: false, vratSafe: false,
    paisePerUnit: 30, kcalPerUnit: 1.49, proteinPerUnit: 0.064,
  },
  {
    id: 'ginger', name: 'Ginger', aliases: ['adrak', 'अदरक'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 10, fridge: 21 },
    burnPerAdultPerDay: 0, parPerAdult: 150, aisle: 'Vegetables',
    allergens: [], jainSafe: false, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 20, kcalPerUnit: 0.8, proteinPerUnit: 0.018,
  },
  {
    id: 'palak', name: 'Palak', aliases: ['spinach', 'पालक'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 2, fridge: 5 },
    burnPerAdultPerDay: 0, parPerAdult: 250, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 5, kcalPerUnit: 0.23, proteinPerUnit: 0.029,
  },
  {
    id: 'dhaniya', name: 'Dhaniya', aliases: ['coriander', 'cilantro', 'धनिया', 'kothmir'],
    cls: 'perishable', unit: 'bunch', shelfLifeDays: { counter: 2, fridge: 4 },
    burnPerAdultPerDay: 0, parPerAdult: 1, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 1000, kcalPerUnit: 8.0, proteinPerUnit: 0.7,
  },
  {
    id: 'green-chilli', name: 'Green chilli', aliases: ['hari mirch', 'हरी मिर्च'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 5, fridge: 12 },
    burnPerAdultPerDay: 0, parPerAdult: 100, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 12, kcalPerUnit: 0.4, proteinPerUnit: 0.019,
  },
  {
    id: 'capsicum', name: 'Capsicum', aliases: ['shimla mirch', 'bell pepper', 'शिमला मिर्च'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 5, fridge: 10 },
    burnPerAdultPerDay: 0, parPerAdult: 250, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 10, kcalPerUnit: 0.26, proteinPerUnit: 0.01,
  },
  {
    id: 'cauliflower', name: 'Cauliflower', aliases: ['gobi', 'phool gobi', 'गोभी'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 4, fridge: 8 },
    burnPerAdultPerDay: 0, parPerAdult: 500, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 5, kcalPerUnit: 0.25, proteinPerUnit: 0.019,
  },
  {
    id: 'bhindi', name: 'Bhindi', aliases: ['okra', 'ladies finger', 'भिंडी'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 3, fridge: 6 },
    burnPerAdultPerDay: 0, parPerAdult: 400, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 8, kcalPerUnit: 0.33, proteinPerUnit: 0.019,
  },
  {
    id: 'baingan', name: 'Baingan', aliases: ['brinjal', 'eggplant', 'बैंगन'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 4, fridge: 8 },
    burnPerAdultPerDay: 0, parPerAdult: 400, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 5, kcalPerUnit: 0.25, proteinPerUnit: 0.01,
  },
  {
    id: 'paneer', name: 'Paneer', aliases: ['cottage cheese', 'पनीर'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { fridge: 5, counter: 1 },
    burnPerAdultPerDay: 0, parPerAdult: 200, aisle: 'Dairy',
    allergens: ['dairy'], jainSafe: true, vegan: false,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 45, kcalPerUnit: 2.65, proteinPerUnit: 0.18,
  },
  {
    id: 'milk', name: 'Milk', aliases: ['doodh', 'दूध'],
    cls: 'perishable', unit: 'ml', shelfLifeDays: { fridge: 3, counter: 1 },
    burnPerAdultPerDay: 0, parPerAdult: 1500, aisle: 'Dairy',
    allergens: ['dairy'], jainSafe: true, vegan: false,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 6, kcalPerUnit: 0.62, proteinPerUnit: 0.032,
  },
  {
    id: 'curd', name: 'Curd', aliases: ['dahi', 'yoghurt', 'दही'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { fridge: 6, counter: 1 },
    burnPerAdultPerDay: 0, parPerAdult: 500, aisle: 'Dairy',
    allergens: ['dairy'], jainSafe: true, vegan: false,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 8, kcalPerUnit: 0.6, proteinPerUnit: 0.031,
  },
  {
    id: 'egg', name: 'Egg', aliases: ['anda', 'अंडा'],
    cls: 'perishable', unit: 'piece', shelfLifeDays: { fridge: 21, counter: 7 },
    burnPerAdultPerDay: 0, parPerAdult: 6, aisle: 'Dairy',
    allergens: ['egg'], jainSafe: false, vegan: false,
    alliumFree: true, vratSafe: false,
    paisePerUnit: 700, kcalPerUnit: 78.0, proteinPerUnit: 6.3,
  },
  {
    id: 'curry-leaves', name: 'Curry leaves', aliases: ['kadi patta', 'कढ़ी पत्ता'],
    cls: 'perishable', unit: 'bunch', shelfLifeDays: { fridge: 7, counter: 3 },
    burnPerAdultPerDay: 0, parPerAdult: 1, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 800, kcalPerUnit: 3.0, proteinPerUnit: 0.3,
  },
  {
    id: 'lemon', name: 'Lemon', aliases: ['nimbu', 'नींबू'],
    cls: 'perishable', unit: 'piece', shelfLifeDays: { counter: 7, fridge: 18 },
    burnPerAdultPerDay: 0, parPerAdult: 3, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 500, kcalPerUnit: 17.0, proteinPerUnit: 0.6,
  },
  {
    id: 'peas', name: 'Green peas', aliases: ['matar', 'मटर'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { freezer: 120, fridge: 6, counter: 2 },
    burnPerAdultPerDay: 0, parPerAdult: 250, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
    alliumFree: true, vratSafe: true,
    paisePerUnit: 12, kcalPerUnit: 0.81, proteinPerUnit: 0.054,
  },
];

export const INGREDIENT_INDEX: Map<string, Ingredient> = new Map(
  INGREDIENTS.map((i) => [i.id, i]),
);

/** Hinglish-first search. Matches canonical name and every alias equally. */
export function searchIngredients(q: string): Ingredient[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return INGREDIENTS;
  return INGREDIENTS.filter(
    (i) =>
      i.name.toLowerCase().includes(needle) ||
      i.aliases.some((a) => a.toLowerCase().includes(needle)),
  );
}
