import type { NutritionLabelScan } from './schemas';

export function normalizeLabelToPer100g(scan: NutritionLabelScan): {
  nutrients: { calories: number; protein: number; carbs: number; fat: number };
  warnings: string[];
} {
  const warnings = [...scan.warnings];
  const n = scan.nutrients;
  if (scan.basis === 'per_100g' || scan.basis === 'per_100ml') {
    return { nutrients: n, warnings };
  }
  if (scan.basis === 'per_serving') {
    const servingText = scan.serving_size_text ?? '';
    const m = servingText.match(/(\d+(?:[.,]\d+)?)\s*(g|ml)/i);
    if (!m) {
      warnings.push('serving_size_unknown');
      return { nutrients: n, warnings };
    }
    const amount = parseFloat(m[1].replace(',', '.'));
    const factor = 100 / amount;
    if (!Number.isFinite(factor) || factor <= 0) {
      return { nutrients: n, warnings };
    }
    return {
      nutrients: {
        calories: Math.round(n.calories * factor),
        protein: Math.round(n.protein * factor * 10) / 10,
        carbs: Math.round(n.carbs * factor * 10) / 10,
        fat: Math.round(n.fat * factor * 10) / 10,
      },
      warnings,
    };
  }
  return { nutrients: n, warnings };
}
