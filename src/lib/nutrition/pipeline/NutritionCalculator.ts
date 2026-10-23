import type { ComponentMatch, ComponentNutrition } from './schemas';
import { macrosForCandidate } from './nutritionFromCandidate';

export function calculateNutrition(match: ComponentMatch): ComponentNutrition | null {
  const selected = match.candidates[0];
  if (!selected) return null;
  const macros = macrosForCandidate(selected, match.estimated_grams);
  return {
    component_id: match.component_id,
    component_name: match.component_name,
    grams: match.estimated_grams,
    data_source: selected.data_source,
    confidence_score: selected.score,
    ...macros,
  };
}

export function sumNutrition(lines: ComponentNutrition[]): {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
} {
  return lines.reduce(
    (acc, line) => ({
      kcal: acc.kcal + line.kcal,
      protein: Math.round((acc.protein + line.protein) * 10) / 10,
      carbs: Math.round((acc.carbs + line.carbs) * 10) / 10,
      fat: Math.round((acc.fat + line.fat) * 10) / 10,
      fiber: Math.round((acc.fiber + (line.fiber ?? 0)) * 10) / 10,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}
