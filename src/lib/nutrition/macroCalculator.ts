import type { Food } from '../foodDatabase';
import type { PortionOption } from './schemas';

export function macrosForGrams(
  food: Food,
  grams: number,
): { kcal: number; protein: number; carbs: number; fat: number } {
  const g = Math.max(0, grams);
  const factor = g / 100;
  const n = food.nutrients;
  return {
    kcal: Math.round(n.calories * factor),
    protein: Math.round(n.protein * factor * 10) / 10,
    carbs: Math.round(n.carbs * factor * 10) / 10,
    fat: Math.round(n.fat * factor * 10) / 10,
  };
}

export function macrosFromPortion(food: Food, option: PortionOption) {
  const qty = Math.max(0, option.quantity);
  const grams = Math.max(1, Math.round(option.grams * qty));
  return { grams, macros: macrosForGrams(food, grams) };
}

export function sumMacros(lines: { kcal: number; protein: number; carbs: number; fat: number }[]) {
  return lines.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein: acc.protein + m.protein,
      carbs: acc.carbs + m.carbs,
      fat: acc.fat + m.fat,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );
}
