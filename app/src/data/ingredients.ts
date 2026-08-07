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
  },
  {
    id: 'rice', name: 'Rice', aliases: ['chawal', 'चावल', 'basmati'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 70, parPerAdult: 2500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'toor-dal', name: 'Toor dal', aliases: ['arhar', 'tuvar', 'तूर दाल'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 25, parPerAdult: 1000, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'moong-dal', name: 'Moong dal', aliases: ['मूंग दाल'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 12, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'chana-dal', name: 'Chana dal', aliases: ['चना दाल'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 8, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'rajma', name: 'Rajma', aliases: ['kidney beans', 'राजमा'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 6, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'besan', name: 'Besan', aliases: ['gram flour', 'बेसन'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 8, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'poha', name: 'Poha', aliases: ['flattened rice', 'पोहा'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 10, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'oil', name: 'Cooking oil', aliases: ['tel', 'तेल', 'sunflower oil'],
    cls: 'staple', unit: 'ml', shelfLifeDays: null,
    burnPerAdultPerDay: 25, parPerAdult: 1000, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'ghee', name: 'Ghee', aliases: ['घी', 'clarified butter'],
    cls: 'staple', unit: 'ml', shelfLifeDays: null,
    burnPerAdultPerDay: 8, parPerAdult: 500, aisle: 'Dairy',
    allergens: ['dairy'], jainSafe: true, vegan: false,
  },
  {
    id: 'salt', name: 'Salt', aliases: ['namak', 'नमक'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 6, parPerAdult: 500, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'sugar', name: 'Sugar', aliases: ['cheeni', 'चीनी'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 15, parPerAdult: 1000, aisle: 'Staples',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'turmeric', name: 'Haldi', aliases: ['turmeric', 'हल्दी'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'chilli-powder', name: 'Lal mirch', aliases: ['chilli powder', 'लाल मिर्च'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1.5, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'garam-masala', name: 'Garam masala', aliases: ['गरम मसाला'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'jeera', name: 'Jeera', aliases: ['cumin', 'जीरा'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1.5, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'mustard-seed', name: 'Rai', aliases: ['mustard seeds', 'राई', 'sarson'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 1, parPerAdult: 100, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'kasuri-methi', name: 'Kasuri methi', aliases: ['dried fenugreek', 'कसूरी मेथी'],
    cls: 'staple', unit: 'g', shelfLifeDays: null,
    burnPerAdultPerDay: 0.5, parPerAdult: 50, aisle: 'Masala',
    allergens: [], jainSafe: true, vegan: true,
  },

  // ---------- perishables ----------
  {
    id: 'onion', name: 'Onion', aliases: ['pyaaz', 'kanda', 'प्याज'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 21, fridge: 30 },
    burnPerAdultPerDay: 0, parPerAdult: 1000, aisle: 'Vegetables',
    allergens: [], jainSafe: false, vegan: true,
  },
  {
    id: 'tomato', name: 'Tomato', aliases: ['tamatar', 'टमाटर'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 6, fridge: 12 },
    burnPerAdultPerDay: 0, parPerAdult: 750, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'potato', name: 'Potato', aliases: ['aloo', 'batata', 'आलू'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 25, fridge: 30 },
    burnPerAdultPerDay: 0, parPerAdult: 1000, aisle: 'Vegetables',
    allergens: [], jainSafe: false, vegan: true,
  },
  {
    id: 'garlic', name: 'Garlic', aliases: ['lehsun', 'लहसुन'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 30, fridge: 45 },
    burnPerAdultPerDay: 0, parPerAdult: 150, aisle: 'Vegetables',
    allergens: [], jainSafe: false, vegan: true,
  },
  {
    id: 'ginger', name: 'Ginger', aliases: ['adrak', 'अदरक'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 10, fridge: 21 },
    burnPerAdultPerDay: 0, parPerAdult: 150, aisle: 'Vegetables',
    allergens: [], jainSafe: false, vegan: true,
  },
  {
    id: 'palak', name: 'Palak', aliases: ['spinach', 'पालक'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 2, fridge: 5 },
    burnPerAdultPerDay: 0, parPerAdult: 250, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'dhaniya', name: 'Dhaniya', aliases: ['coriander', 'cilantro', 'धनिया', 'kothmir'],
    cls: 'perishable', unit: 'bunch', shelfLifeDays: { counter: 2, fridge: 4 },
    burnPerAdultPerDay: 0, parPerAdult: 1, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'green-chilli', name: 'Green chilli', aliases: ['hari mirch', 'हरी मिर्च'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 5, fridge: 12 },
    burnPerAdultPerDay: 0, parPerAdult: 100, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'capsicum', name: 'Capsicum', aliases: ['shimla mirch', 'bell pepper', 'शिमला मिर्च'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 5, fridge: 10 },
    burnPerAdultPerDay: 0, parPerAdult: 250, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'cauliflower', name: 'Cauliflower', aliases: ['gobi', 'phool gobi', 'गोभी'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 4, fridge: 8 },
    burnPerAdultPerDay: 0, parPerAdult: 500, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'bhindi', name: 'Bhindi', aliases: ['okra', 'ladies finger', 'भिंडी'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 3, fridge: 6 },
    burnPerAdultPerDay: 0, parPerAdult: 400, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'baingan', name: 'Baingan', aliases: ['brinjal', 'eggplant', 'बैंगन'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { counter: 4, fridge: 8 },
    burnPerAdultPerDay: 0, parPerAdult: 400, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'paneer', name: 'Paneer', aliases: ['cottage cheese', 'पनीर'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { fridge: 5, counter: 1 },
    burnPerAdultPerDay: 0, parPerAdult: 200, aisle: 'Dairy',
    allergens: ['dairy'], jainSafe: true, vegan: false,
  },
  {
    id: 'milk', name: 'Milk', aliases: ['doodh', 'दूध'],
    cls: 'perishable', unit: 'ml', shelfLifeDays: { fridge: 3, counter: 1 },
    burnPerAdultPerDay: 0, parPerAdult: 1500, aisle: 'Dairy',
    allergens: ['dairy'], jainSafe: true, vegan: false,
  },
  {
    id: 'curd', name: 'Curd', aliases: ['dahi', 'yoghurt', 'दही'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { fridge: 6, counter: 1 },
    burnPerAdultPerDay: 0, parPerAdult: 500, aisle: 'Dairy',
    allergens: ['dairy'], jainSafe: true, vegan: false,
  },
  {
    id: 'egg', name: 'Egg', aliases: ['anda', 'अंडा'],
    cls: 'perishable', unit: 'piece', shelfLifeDays: { fridge: 21, counter: 7 },
    burnPerAdultPerDay: 0, parPerAdult: 6, aisle: 'Dairy',
    allergens: ['egg'], jainSafe: false, vegan: false,
  },
  {
    id: 'curry-leaves', name: 'Curry leaves', aliases: ['kadi patta', 'कढ़ी पत्ता'],
    cls: 'perishable', unit: 'bunch', shelfLifeDays: { fridge: 7, counter: 3 },
    burnPerAdultPerDay: 0, parPerAdult: 1, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'lemon', name: 'Lemon', aliases: ['nimbu', 'नींबू'],
    cls: 'perishable', unit: 'piece', shelfLifeDays: { counter: 7, fridge: 18 },
    burnPerAdultPerDay: 0, parPerAdult: 3, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
  },
  {
    id: 'peas', name: 'Green peas', aliases: ['matar', 'मटर'],
    cls: 'perishable', unit: 'g', shelfLifeDays: { freezer: 120, fridge: 6, counter: 2 },
    burnPerAdultPerDay: 0, parPerAdult: 250, aisle: 'Vegetables',
    allergens: [], jainSafe: true, vegan: true,
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
