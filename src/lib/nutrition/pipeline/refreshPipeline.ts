import { calculateNutrition, sumNutrition } from './NutritionCalculator';
import type { PipelineResult } from './schemas';

export function refreshPipelineTotals(result: PipelineResult): PipelineResult {
  const components = result.matches
    .map((m) => calculateNutrition(m))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
  const totals = sumNutrition(components);
  return { ...result, components, totals };
}
