import { validateV3ProcessBody } from '../src/lib/nutrition/pipeline/v3RequestValidation';
import { diffMacroTotals, macroTotalsFromPipeline } from '../src/lib/nutrition/pipeline/reprocessDiff';
import { buildE2eNutritionPipelineMock } from '../src/lib/nutrition/pipeline/e2eNutritionMock';
import { PipelineResultSchema } from '../src/lib/nutrition/pipeline/schemas';
import { recomputePipelineFromReview } from '../src/lib/nutrition/pipeline/legacyAdapter';

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

const missing = validateV3ProcessBody({});
if (missing.ok === false) {
  assert(missing.error === 'missing-input', 'expected missing-input');
} else {
  throw new Error('expected missing-input');
}

const longText = validateV3ProcessBody({ text: 'x'.repeat(9000) });
if (longText.ok === false) {
  assert(longText.error === 'text-too-long', 'expected text-too-long');
} else {
  throw new Error('expected text-too-long');
}

const badImage = validateV3ProcessBody({ imageDataUrl: 'not-a-data-url' });
if (badImage.ok === false) {
  assert(badImage.error === 'invalid-image-format', 'expected invalid-image-format');
} else {
  throw new Error('expected invalid-image-format');
}

const ok = validateV3ProcessBody({ text: 'Hähnchen mit Reis' });
assert(ok.ok, 'expected valid text input');

const base = buildE2eNutritionPipelineMock('Hähnchen mit Reis');
const parsed = PipelineResultSchema.parse(base);
const before = macroTotalsFromPipeline(parsed);
const reviewed = recomputePipelineFromReview(parsed, [
  { component_id: parsed.matches[0]!.component_id, grams: 250, selectedRank: 1 },
]);
const after = macroTotalsFromPipeline(reviewed);
const delta = diffMacroTotals(before, after);
assert(typeof delta.kcal === 'number', 'delta kcal should be number');

console.log('nutrition-v3-negative-selftest: OK');
