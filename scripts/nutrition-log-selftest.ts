import assert from 'node:assert/strict';
import { segmentMealText } from '../src/lib/nutrition/textMealSegmenter';
import { buildMealItemFromDishPhrase, findDishTemplateId } from '../src/lib/nutrition/dishExpander';
import { buildPortionOptions, toGrams } from '../src/lib/nutrition/portionCatalog';
import { buildHeuristicMealIntent } from '../src/lib/nutrition/parseMealText';
import { isCompositeComponentName } from '../src/lib/nutrition/pipeline/atomicMealAnalysis';
import { mealAnalysisFromSegments } from '../src/lib/nutrition/pipeline/mealSegmentAnalysis';
import { normalizeLabelToPer100g } from '../src/lib/nutrition/nutritionLabelNormalize';
import { rankFoodCandidates, pickAutoMatch, pickMediumMatch } from '../src/lib/nutrition/matchRanker';
import { checkMealPlausibility } from '../src/lib/nutrition/plausibilityCheck';
import { requiresCandidatePick } from '../src/lib/nutrition/matchThresholds';
import { searchGenericBaselines } from '../src/lib/nutrition/catalog/genericBaselineResolver';
import type { Food } from '../src/lib/foodDatabase';
import { buildServingsFromOffProduct } from '../src/lib/openFoodFacts';

const segs = segmentMealText('Chicken Wings mit Kroketten, Apfel');
assert.equal(segs.length, 3, 'segment wings+kroketten+apfel');
const leberkaesSegs = segmentMealText('2 Leberkassemmeln mit süßem senf');
assert.deepEqual(leberkaesSegs, ['2 Leberkassemmeln', 'süßem senf'], 'segment leberkaessemmeln+senf');

const cheese = buildMealItemFromDishPhrase('1 Cheeseburger');
assert.ok(cheese && cheese.templateId === 'cheeseburger', 'cheeseburger template');
assert.ok(cheese!.components.length >= 5, 'cheeseburger components');

const doener = buildMealItemFromDishPhrase('1 Döner');
assert.ok(doener && doener.templateId === 'doener', 'doener template');
const leberkaes = buildMealItemFromDishPhrase('2 Leberkassemmeln');
assert.ok(leberkaes && leberkaes.templateId === 'leberkaessemmel', 'leberkaessemmel template');
assert.equal(leberkaes?.components.find((c) => /brötchen/i.test(c.foodHint))?.quantity?.value, 120, '2x broetchen grams');

const intent = buildHeuristicMealIntent('2 Leberkassemmeln mit süßem senf');
assert.equal(intent.items.length, 2, 'heuristic split into two meal items');
assert.ok(
  intent.items.some((i) => i.components.some((c) => /leberk[aä]se/i.test(c.foodHint))),
  'contains leberkaese component',
);
assert.ok(intent.items.some((i) => i.components.some((c) => /senf/i.test(c.foodHint))), 'contains senf component');

assert.ok(isCompositeComponentName('Leberkässemmel'), 'composite: leberkaessemmel');
assert.ok(!isCompositeComponentName('Semmel'), 'atomic: semmel');
assert.ok(!isCompositeComponentName('Leberkäse'), 'atomic: leberkaese');

const fromSeg = mealAnalysisFromSegments(
  {
    meal_name: 'Leberkässemmeln mit Senf',
    items: [
      { name: 'Leberkäse', quantity: 2, unit: 'scheibe' },
      { name: 'Semmel', quantity: 2, unit: 'stk' },
      { name: 'Süßer Senf', quantity: 15, unit: 'g' },
    ],
  },
  '2 Leberkässemmeln mit süßem Senf',
);
assert.equal(fromSeg.components.length, 3, 'segment → 3 OFF-Zeilen');
assert.ok(fromSeg.components.every((c) => c.search_strategy.primary[0] === c.name), 'OFF-Suche = Komponentenname');

assert.equal(findDishTemplateId('hot dog'), 'hotdog');

const redBullServings = buildServingsFromOffProduct({
  quantity: '330 ml',
  product_name: 'Red Bull Energy Drink',
});
const food: Food = {
  id: 'off_test',
  name: 'Red Bull Energy Drink',
  category: 'drink',
  nutrients: { calories: 45, protein: 0, carbs: 11, fat: 0 },
  servings: redBullServings,
  catalogSource: 'openfoodfacts',
};
const opts = buildPortionOptions(food);
const dose = opts.find((o) => /dose/i.test(o.label));
assert.ok(dose && dose.grams === 330, '330ml dose default');
const defaultRef = opts.find((o) => o.logUnit === 'ml' || o.logUnit === 'g');
if (defaultRef) {
  assert.ok(toGrams(defaultRef) <= 1000, 'no quantity*grams explosion for g/ml');
}

const norm = normalizeLabelToPer100g({
  basis: 'per_serving',
  serving_size_text: '30 g',
  nutrients: { calories: 150, protein: 10, carbs: 5, fat: 8 },
  confidence: 0.9,
  warnings: [],
});
assert.equal(norm.nutrients.calories, 500, 'per serving to per 100g');

const ranked = rankFoodCandidates('Hähnchenbrust', [
  {
    id: 'off_1',
    name: 'Chicken Nuggets TK',
    category: 'frozen',
    nutrients: { calories: 250, protein: 12, carbs: 20, fat: 14 },
    servings: [{ name: '100 g', grams: 100 }],
  },
  {
    id: 'generic_haehnchenbrust',
    name: 'Hähnchenbrust, roh',
    category: 'protein',
    nutrients: { calories: 120, protein: 22, carbs: 0, fat: 2.6 },
    servings: [{ name: '100 g', grams: 100 }],
  },
]);
assert.ok(ranked[0]?.food.name.includes('Hähnchen'), 'hähnchenbrust should rank above nuggets');
if ((ranked[0]?.score ?? 0) >= 0.85) {
  assert.equal(pickAutoMatch(ranked)?.food.id, 'generic_haehnchenbrust', 'auto match high confidence');
}

const weak = rankFoodCandidates('obscure xyz food', [
  {
    id: 'off_x',
    name: 'Random Snack',
    category: 'snack',
    nutrients: { calories: 100, protein: 1, carbs: 10, fat: 5 },
    servings: [{ name: '100 g', grams: 100 }],
  },
]);
assert.equal(pickAutoMatch(weak), null, 'weak match no auto');
assert.ok(pickMediumMatch(weak) === null || (weak[0]?.score ?? 0) < 0.7);

assert.ok(requiresCandidatePick(0.5, true), 'low score requires pick');

const gen = searchGenericBaselines('lachs', 3);
assert.ok(gen.some((f) => f.name.toLowerCase().includes('lachs')), 'expanded generic baselines');
const senf = searchGenericBaselines('senf', 3)[0];
assert.ok(senf, 'senf baseline exists');
const senfOpts = buildPortionOptions(senf!);
const senfRef = senfOpts.find((o) => o.logUnit === 'g' || o.logUnit === 'ml');
assert.ok(senfRef && toGrams(senfRef) <= 200, 'senf default amount stays plausible');

const plausible = checkMealPlausibility({ kcal: 600, protein: 40, carbs: 50, fat: 20 });
assert.equal(plausible.length, 0, 'reasonable meal no issues');

const extreme = checkMealPlausibility({ kcal: 5000, protein: 10, carbs: 10, fat: 10 });
assert.ok(extreme.some((i) => i.code === 'meal_too_high'), 'extreme kcal warned');

console.log('nutrition-log-selftest: OK');
