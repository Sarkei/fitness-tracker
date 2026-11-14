/**
 * Portion / Segmentierung für Meal-KI (ohne API).
 */
import {
  extractMealTextSegments,
  trySplitMitSideComponents,
  ingredientFromParsedItem,
} from '../src/lib/mealAiShared';
import { estimateTypicalMealGramsForPhrase } from '../src/lib/portionHeuristics';
import { buildServingsFromOffProduct } from '../src/lib/openFoodFacts';
import {
  hasMeaningfulStueckServing,
  inferDefaultLogPortionForFood,
  inferStueckGramsFromFood,
} from '../src/lib/portionUtils';
import type { Food } from '../src/lib/foodDatabase';

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(msg);
}

const mit = trySplitMitSideComponents('Chicken Wings mit Kroketten');
assert(mit?.length === 2, 'mit split length');
assert(/wing/i.test(mit![0]), 'wings main');
assert(/kroketten/i.test(mit![1]), 'kroketten side');

const segs = extractMealTextSegments('Chicken Wings mit Kroketten');
assert(segs.length === 2, 'extract segments mit');

const one = extractMealTextSegments('Nudeln mit Soße');
assert(one.length === 1, 'nudeln mit soße single dish');

assert(estimateTypicalMealGramsForPhrase('Chicken Wings') >= 150, 'wings typical g');
assert(estimateTypicalMealGramsForPhrase('Kroketten') >= 120, 'kroketten typical g');

const bulkWings: Food = {
  id: 'off_test_wings',
  name: 'aile poulet · chicken wings · 10kg',
  category: 'protein',
  nutrients: { calories: 250, protein: 20, carbs: 5, fat: 18 },
  servings: [{ name: '1 Stück (≈ 100 g)', grams: 100 }],
};

const ing = ingredientFromParsedItem(
  { name: 'Chicken Wings', amount: 25, unit: 'g' },
  bulkWings,
);
assert(ing.unit === 'g', `expected g unit got ${ing.unit}`);
assert(Number(ing.amount) >= 120, `expected >=120g got ${ing.amount}`);
assert(Number(ing.calories) > 0, 'calories should be > 0');

const only100g: Food = {
  id: 'off_only100',
  name: 'Generic cereal',
  category: 'carbs',
  nutrients: { calories: 380, protein: 8, carbs: 70, fat: 3 },
  servings: [{ name: '100 g', grams: 100 }],
};
assert(!hasMeaningfulStueckServing(only100g), 'only 100g → no stk');
assert(inferDefaultLogPortionForFood(only100g).unit === 'g', 'default unit g');
assert(inferStueckGramsFromFood(only100g) === 100, 'stk grams fallback when forced');

const offServings = buildServingsFromOffProduct({
  code: '123',
  product_name: 'Joghurt',
  serving_size: '150 g',
  serving_quantity: 150,
  serving_quantity_unit: 'g',
});
assert(
  offServings.some((s) => /portion|stück/i.test(s.name) && s.grams === 150),
  'OFF serving_quantity → portion/stück',
);

console.log('meal-portion-selftest: OK');
