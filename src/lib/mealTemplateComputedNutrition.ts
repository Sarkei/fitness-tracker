import type { Food } from './foodDatabase';

/** Statik-DB entfernt — Auflösung nur `off_*` über `extraFoodResolver` (Server: OFF-Barcode-Lookup). */
export function findStaticFoodById(_id: string | undefined | null): Food | null {
  return null;
}

/** Gramm für eine Zutatenzeile (grob); null wenn nicht ableitbar. */
export function ingredientAmountToGrams(amount: number, unitRaw: string): number | null {
  const u = String(unitRaw || '')
    .trim()
    .toLowerCase();
  if (!Number.isFinite(amount)) return null;
  if (u === 'g' || u === 'gram' || u === 'gramm') return amount;
  if (u === 'kg') return amount * 1000;
  if (u === 'ml' || u === 'milliliter') return amount;
  if (u === 'l' || u === 'liter') return amount * 1000;
  if (u === 'stk' || u === 'stück' || u === 'stueck' || u === 'piece' || u === 'pcs') return null;
  return null;
}

export interface ComputedTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface ComputeMealTemplateNutritionResult {
  computed: ComputedTotals;
  /** Anteil der Zutatenzeilen mit foodId (0–1). */
  rowCoverage: number;
  /** Anteil des geschätzten Kalorienbeitrags aus aufgelösten Zeilen (heuristisch 1/n pro Zeile). */
  caloriesCoverage: number;
}

/**
 * Summiert Nährwerte für yields_portions = N aus Zutaten mit foodId (Nährwerte pro 100g).
 * Zeilen ohne Gramm-Mapping oder ohne foodId zählen zur Coverage-Berechnung, aber nicht zur Summe.
 */
export function computeMealTemplateNutritionForRecipe(
  ingredients: Array<{
    name: string;
    amount: number;
    unit: string;
    foodId?: string;
    unresolved?: boolean;
  }>,
  extraFoodResolver?: (foodId: string) => Food | null,
): ComputeMealTemplateNutritionResult {
  const totals: ComputedTotals = { calories: 0, protein: 0, carbs: 0, fat: 0 };
  let resolvedRows = 0;
  let totalRows = 0;

  for (const ing of ingredients || []) {
    totalRows += 1;
    const grams = ingredientAmountToGrams(Number(ing.amount), ing.unit);
    const food =
      (ing.foodId && extraFoodResolver ? extraFoodResolver(ing.foodId) : null) ??
      findStaticFoodById(ing.foodId);
    if (!food || grams == null) continue;
    resolvedRows += 1;
    const f = 0.01 * grams;
    const c = food.nutrients.calories * f;
    totals.calories += c;
    totals.protein += food.nutrients.protein * f;
    totals.carbs += food.nutrients.carbs * f;
    totals.fat += food.nutrients.fat * f;
  }

  const rowCoverage = totalRows > 0 ? resolvedRows / totalRows : 0;
  const caloriesCoverage = totalRows > 0 ? resolvedRows / totalRows : 0;

  return {
    computed: {
      calories: Math.round(totals.calories * 10) / 10,
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
    },
    rowCoverage: Math.round(rowCoverage * 1000) / 1000,
    caloriesCoverage: Math.round(caloriesCoverage * 1000) / 1000,
  };
}
