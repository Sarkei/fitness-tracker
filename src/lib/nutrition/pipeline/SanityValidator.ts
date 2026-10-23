import type { MealAnalysis } from './schemas';

export const MEAL_SANITY_RANGES: Record<string, { min: number; max: number }> = {
  snack: { min: 50, max: 400 },
  breakfast: { min: 200, max: 900 },
  lunch: { min: 300, max: 1200 },
  dinner: { min: 300, max: 1200 },
  street_food: { min: 350, max: 1100 },
  drink_cold: { min: 0, max: 600 },
  drink_hot: { min: 0, max: 400 },
  dessert: { min: 100, max: 800 },
};

export function validateSanity(
  analysis: MealAnalysis,
  totalKcal: number,
  totals?: { protein: number; carbs: number; fat: number },
): string[] {
  const warnings: string[] = [];
  const key = analysis.meal_category;
  const range = MEAL_SANITY_RANGES[key];
  if (range && (totalKcal < range.min || totalKcal > range.max)) {
    warnings.push(
      `Kalorien wirken unplausibel für ${analysis.meal_name}: ${totalKcal} kcal (erwartet ${range.min}-${range.max}).`,
    );
  }
  if (totals && totalKcal > 80) {
    const macroKcal = totals.protein * 4 + totals.carbs * 4 + totals.fat * 9;
    const diff = Math.abs(macroKcal - totalKcal);
    if (diff > totalKcal * 0.35) {
      warnings.push(
        `Makro-Summe (${Math.round(macroKcal)} kcal) weicht stark von Gesamt-${totalKcal} kcal ab — bitte Zutaten prüfen.`,
      );
    }
  }
  return warnings;
}
