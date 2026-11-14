import { pipelineResultFromStoredMeal } from '../src/lib/nutrition/pipeline/storedMealPipeline';
import { recomputePipelineFromReview } from '../src/lib/nutrition/pipeline/legacyAdapter';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

const nutrition = {
  meal: 'Joghurt mit Banane',
  inputType: 'text' as const,
  originalInput: '200g joghurt, banane',
  mealCategory: 'snack',
  cuisine: null,
  aiModelUsed: 'test',
  pipelineVersion: 'nutrition-v3',
  userReviewed: true,
};

const rows = [
  {
    component_id: 'c1',
    food_name: 'Joghurt',
    openfoodfacts_id: null,
    product_name: 'Griechischer Joghurt',
    brand: null,
    grams: 200,
    kcal: 118,
    protein_g: 20,
    carbs_g: 7,
    fat_g: 1,
    fiber_g: 0,
    data_source: 'estimated_fallback',
    confidence_score: 90,
    user_modified: false,
  },
  {
    component_id: 'c2',
    food_name: 'Banane',
    openfoodfacts_id: null,
    product_name: 'Banane',
    brand: null,
    grams: 120,
    kcal: 107,
    protein_g: 1.3,
    carbs_g: 28,
    fat_g: 0.4,
    fiber_g: 3,
    data_source: 'estimated_fallback',
    confidence_score: 92,
    user_modified: false,
  },
];

const result = pipelineResultFromStoredMeal(nutrition, rows);
assert(result.matches.length === 2, 'expected 2 matches');
assert(result.totals.kcal > 200, 'expected plausible kcal total');

const reviewed = result.matches.map((m) => ({
  component_id: m.component_id,
  grams: m.estimated_grams + 10,
  selectedRank: 1,
}));
const recomputed = recomputePipelineFromReview(result, reviewed);
assert(recomputed.totals.kcal >= result.totals.kcal, 'grams increase should raise kcal');

console.log('nutrition-v3-stored-meal-selftest: OK');
