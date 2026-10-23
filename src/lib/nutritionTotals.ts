/**
 * Einheitliche Summen für Statistiken/Dashboard: bei Mahlzeiten mit Zutaten-Liste
 * sind die Kalorien oft nur sinnvoll über die Zutatenzeilen summiert.
 */

import type { Ingredient, Nutrition } from '../types';

function sumIngredients(ings: Ingredient[]): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  let calories = 0;
  let protein = 0;
  let carbs = 0;
  let fat = 0;
  for (const i of ings) {
    calories += Number(i.calories) || 0;
    protein += Number(i.protein) || 0;
    carbs += Number(i.carbs) || 0;
    fat += Number(i.fat) || 0;
  }
  return { calories, protein, carbs, fat };
}

/** Summierte Nährwerte einer gespeicherten Mahlzeit (Mahlzeit-Ebene vs. Zutaten). */
export function effectiveNutritionTotals(e: Nutrition): {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
} {
  const headerCalories = Math.round(Number(e.calories) || 0);
  if (e.pipelineVersion === 'nutrition-v3' && headerCalories > 0) {
    return {
      calories: headerCalories,
      protein: Math.round((Number(e.protein) || 0) * 10) / 10,
      carbs: Math.round((Number(e.carbs) || 0) * 10) / 10,
      fat: Math.round((Number(e.fat) || 0) * 10) / 10,
    };
  }

  const ings = e.ingredients;
  if (Array.isArray(ings) && ings.length > 0) {
    const fromIngs = sumIngredients(ings);
    if (fromIngs.calories > 0) {
      return {
        calories: Math.round(fromIngs.calories),
        protein: Math.round(fromIngs.protein * 10) / 10,
        carbs: Math.round(fromIngs.carbs * 10) / 10,
        fat: Math.round(fromIngs.fat * 10) / 10,
      };
    }
  }
  return {
    calories: headerCalories,
    protein: Math.round((Number(e.protein) || 0) * 10) / 10,
    carbs: Math.round((Number(e.carbs) || 0) * 10) / 10,
    fat: Math.round((Number(e.fat) || 0) * 10) / 10,
  };
}
