import { diffMacroTotals, formatDeltaLabel, macroTotalsFromPipeline } from '../src/lib/nutrition/pipeline/reprocessDiff';
import { buildE2eNutritionPipelineMock } from '../src/lib/nutrition/pipeline/e2eNutritionMock';

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

const a = macroTotalsFromPipeline(buildE2eNutritionPipelineMock('Pizza Margherita'));
const b = macroTotalsFromPipeline(buildE2eNutritionPipelineMock('Salat mit Hähnchen'));
const delta = diffMacroTotals(a, b);
assert(formatDeltaLabel(delta.kcal, 'kcal').includes('kcal'), 'delta label should include unit');
assert(Number.isFinite(delta.protein), 'protein delta finite');

console.log('nutrition-v3-reprocess-selftest: OK');
