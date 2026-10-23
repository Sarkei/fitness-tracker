/**
 * Selftest: Coach-Plan → V3-Pipeline + manuelle Katalog-Lebensmittel.
 */
import assert from 'node:assert/strict';
import type { Food } from '../src/lib/foodDatabase';
import {
  appendManualFoodToPipeline,
  foodToComponentMatch,
  removeComponentFromPipeline,
} from '../src/lib/nutrition/pipeline/manualFoodMatch';
import {
  buildCoachPlanPipelineResult,
  coachPipelineReviewedComponents,
  validateCoachPipelineMacros,
} from '../src/lib/nutrition/pipeline/coachPlanPipeline';
import { recomputePipelineFromReview } from '../src/lib/nutrition/pipeline/legacyAdapter';

const sampleFood: Food = {
  id: 'off_1234567890123',
  name: 'Griechischer Joghurt 10%',
  category: 'dairy',
  nutrients: { calories: 120, protein: 9, carbs: 4, fat: 8 },
  servings: [{ name: '100 g', grams: 100 }],
  catalogSource: 'openfoodfacts',
};

assert.equal(foodToComponentMatch(sampleFood, 150).estimated_grams, 150);
assert.equal(foodToComponentMatch(sampleFood, 150).candidates[0]?.data_source, 'openfoodfacts');

let manual = appendManualFoodToPipeline(null, sampleFood, 150);
assert.equal(manual.matches.length, 1);
assert.ok(manual.totals.kcal > 0);

const second: Food = {
  id: 'generic_oats',
  name: 'Haferflocken',
  category: 'carbs',
  nutrients: { calories: 370, protein: 13, carbs: 58, fat: 7 },
  servings: [{ name: '100 g', grams: 100 }],
  catalogSource: 'app',
};
manual = appendManualFoodToPipeline(manual, second, 80);
assert.equal(manual.matches.length, 2);

const removed = removeComponentFromPipeline(manual, manual.matches[0].component_id);
assert.ok(removed);
assert.equal(removed!.matches.length, 1);

const coachMeal = {
  title: 'Hähnchen-Reis-Bowl',
  type: 'lunch',
  calories: 620,
  protein: 45,
  carbs: 62,
  fat: 14,
  servings: 1,
  ingredients: [
    { name: 'Hähnchenbrust', amount: 150, unit: 'g' },
    { name: 'Reis gekocht', amount: 200, unit: 'g' },
  ],
};
const coachResult = buildCoachPlanPipelineResult(coachMeal, {
  portionsEaten: 1,
  category: 'lunch',
  dayLabel: 'Montag',
});
assert.equal(coachResult.matches.length, 2);
assert.ok(coachResult.totals.kcal >= 400);
const reviewed = coachPipelineReviewedComponents(coachResult);
assert.equal(reviewed.length, 2);
const recomputed = recomputePipelineFromReview(coachResult, reviewed);
assert.ok(recomputed.totals.kcal > 0);
assert.equal(validateCoachPipelineMacros(coachResult).length, 0);

console.log('nutrition-v3-coach-manual-selftest: OK');
