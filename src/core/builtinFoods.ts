import type { FoodItem, Macros } from './types';

/**
 * Everyday foods that work offline. Values are per 100 g, mostly from USDA data.
 * Home-cooked dishes vary a lot with oil and recipe, so those are marked as estimates.
 */
type Row = [name: string, kcal: number, protein: number, carbs: number, fat: number, servingLabel: string, servingGrams: number];

const ROWS: Row[] = [
  ['Egg, whole', 143, 12.6, 0.7, 9.5, '1 large egg', 50],
  ['Egg white', 52, 10.9, 0.7, 0.2, '1 large egg white', 33],
  ['Chicken breast, cooked', 165, 31, 0, 3.6, '4 oz cooked', 113],
  ['Chicken thigh, cooked, skinless', 179, 24.8, 0, 8.2, '1 thigh', 85],
  ['Ground beef 90/10, cooked', 217, 26.1, 0, 11.7, '4 oz cooked', 113],
  ['Salmon, cooked', 206, 22, 0, 12, '1 fillet', 154],
  ['Tofu, firm', 144, 17.3, 2.8, 8.7, '1/2 block', 126],
  ['Paneer', 300, 21, 4, 22, '100 g', 100],
  ['Greek yogurt, nonfat', 59, 10.3, 3.6, 0.4, '1 container', 170],
  ['Milk, 2%', 50, 3.3, 4.8, 2, '1 cup', 244],
  ['Milk, whole', 61, 3.2, 4.8, 3.3, '1 cup', 244],
  ['Whey protein', 400, 80, 10, 5, '1 scoop', 30],
  ['Cheddar cheese', 403, 23, 3, 33, '1 slice', 28],
  ['White rice, cooked', 130, 2.7, 28.2, 0.3, '1 cup', 158],
  ['Roti / chapati', 300, 10, 50, 7, '1 medium roti', 40],
  ['Whole wheat bread', 252, 12.4, 42.7, 3.5, '1 slice', 28],
  ['Oats, dry', 389, 16.9, 66.3, 6.9, '1/2 cup dry', 40],
  ['Potato, boiled', 87, 1.9, 20.1, 0.1, '1 medium', 173],
  ['Sweet potato, baked', 90, 2, 20.7, 0.2, '1 medium', 114],
  ['Dal, homemade (estimate)', 130, 7.5, 17, 3.5, '1 cup', 200],
  ['Rajma / kidney beans, cooked', 127, 8.7, 22.8, 0.5, '1 cup', 177],
  ['Chickpeas / chana, cooked', 164, 8.9, 27.4, 2.6, '1 cup', 164],
  ['Chicken curry, homemade (estimate)', 150, 14, 4, 9, '1 cup', 240],
  ['Banana', 89, 1.1, 22.8, 0.3, '1 medium', 118],
  ['Apple', 52, 0.3, 13.8, 0.2, '1 medium', 182],
  ['Broccoli, cooked', 35, 2.4, 7.2, 0.4, '1 cup', 156],
  ['Peanut butter', 588, 25, 20, 50, '1 tbsp', 16],
  ['Almonds', 579, 21.2, 21.6, 49.9, '1 oz (23 almonds)', 28],
  ['Olive oil', 884, 0, 0, 100, '1 tbsp', 13.5],
  ['Ghee', 900, 0, 0, 100, '1 tsp', 5],
];

const scale = (m: Macros, g: number): Macros => ({
  kcal: Math.round((m.kcal * g) / 100),
  protein: Math.round((m.protein * g) / 10) / 10,
  carbs: Math.round((m.carbs * g) / 10) / 10,
  fat: Math.round((m.fat * g) / 10) / 10,
});

export const BUILTIN_FOODS: FoodItem[] = ROWS.map(([name, kcal, protein, carbs, fat, label, grams]) => {
  const per100g = { kcal, protein, carbs, fat };
  return {
    name,
    per100g,
    serving: { label: `${label} (${grams} g)`, grams, macros: scale(per100g, grams) },
    source: 'builtin',
    sourceId: name,
    updatedAt: 0,
  };
});

export function searchBuiltin(q: string): FoodItem[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return BUILTIN_FOODS.filter((f) => words.every((w) => f.name.toLowerCase().includes(w)));
}
