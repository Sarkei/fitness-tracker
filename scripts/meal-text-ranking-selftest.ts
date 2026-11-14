/**
 * Ranking/Semantik für Text-KI — npx tsx scripts/meal-text-ranking-selftest.ts
 */
import type { Food } from '../src/lib/foodDatabase.ts';
import {
  mealTextDescribesSingleComposedDish,
  mealTextSuggestsDecompose,
  rankFoodsForMealDescription,
  scoreFoodRelevanceForMealText,
  findBestSemanticFoodForPhrase,
  extractMealTextSegments,
} from '../src/lib/mealAiShared.ts';

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

const baseNutrients = { calories: 100, protein: 10, carbs: 10, fat: 5 };
const baseServing = [{ name: '100g', grams: 100 }];
const mk = (partial: Partial<Food> & Pick<Food, 'id' | 'name'>): Food => ({
  category: 'readymeal',
  nutrients: { ...baseNutrients },
  servings: baseServing,
  ...partial,
});

const pool: Food[] = [
  mk({ id: 'fk', name: 'Fleischkäse (Leberkaas)' }),
  mk({ id: 'lw', name: 'Leberwurst' }),
  mk({ id: 'sem', name: 'Semmel (Weizenbrötchen)' }),
  mk({ id: 'choc', name: 'Schokoladen-Müsli Crunch Max Brand XXL' }),
  mk({ id: 'apfel', name: 'Apfel' }),
  mk({ id: 'pizza', name: 'Pizzateig (TK)' }),
];

assert(!mealTextSuggestsDecompose('Leberkässemmel'), 'ein Gericht → kein Zerlegen');
assert(
  mealTextDescribesSingleComposedDish(
    'Nudeln mit einer Tomaten-Sahne-Soße und mit käse überbacken',
  ),
  'Pasta mit Soße und Käse = ein Gericht',
);
assert(!mealTextSuggestsDecompose('Nudeln mit einer Tomaten-Sahne-Soße und mit käse überbacken'), 'Rezept-und ≠ Zerlegen');
assert(mealTextSuggestsDecompose('Semmel und Pommes'), 'zwei Speisen → Zerlegen');
const zweiGerichte = 'Eine Leberkässemmel und einen Nudelauflauf';
assert(!mealTextDescribesSingleComposedDish(zweiGerichte), 'zwei Gerichte ≠ ein Rezept');
assert(mealTextSuggestsDecompose(zweiGerichte), 'Leberkässemmel + Nudelauflauf → Zerlegen');
const zweiSegs = extractMealTextSegments(zweiGerichte);
assert(zweiSegs.length >= 2, 'zwei Segmente');
assert(/leberk/i.test(zweiSegs[0] ?? ''), 'Segment 1 Leberkäse');
assert(/nudel|auflauf/i.test(zweiSegs[1] ?? ''), 'Segment 2 Nudelauflauf');

const segs = extractMealTextSegments('2 Scheiben Leberkäse und Semmel');
assert(segs.length >= 2, 'Segmente splitten');

const ranked = rankFoodsForMealDescription('2 Scheiben Leberkäse', 20, pool);
assert(ranked[0]?.name.includes('Fleischkäse'), 'Leberkäse vor Leberwurst/Müsli');
assert(!ranked[0]?.name.includes('Müsli'), 'kein Müsli bei Leberkäse');

const apfelRank = rankFoodsForMealDescription('ein Apfel', 10, pool);
assert(apfelRank[0]?.id === 'apfel', 'Apfel top');

const chocScore = scoreFoodRelevanceForMealText(pool.find(f => f.id === 'choc')!, 'Apfel');
const apfelScore = scoreFoodRelevanceForMealText(pool.find(f => f.id === 'apfel')!, 'Apfel');
assert(apfelScore > chocScore, 'Apfel schlägt Schoko-Müsli');

const best = findBestSemanticFoodForPhrase('Leberkäse', pool);
assert(best?.id === 'fk', 'semantischer Best Match Fleischkäse');

console.log('meal-text-ranking-selftest: OK');
