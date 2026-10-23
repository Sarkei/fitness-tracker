import type { ProductCandidate } from './schemas';

export function macrosForCandidate(
  candidate: Pick<
    ProductCandidate,
    'kcal_100g' | 'protein_100g' | 'carbs_100g' | 'fat_100g' | 'fiber_100g'
  >,
  grams: number,
): { kcal: number; protein: number; carbs: number; fat: number; fiber: number | null } {
  const factor = grams / 100;
  return {
    kcal: Math.round(candidate.kcal_100g * factor),
    protein: Math.round(candidate.protein_100g * factor * 10) / 10,
    carbs: Math.round(candidate.carbs_100g * factor * 10) / 10,
    fat: Math.round(candidate.fat_100g * factor * 10) / 10,
    fiber:
      candidate.fiber_100g != null
        ? Math.round(candidate.fiber_100g * factor * 10) / 10
        : null,
  };
}
