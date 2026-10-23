/**
 * Bridges logged {@link Nutrition} entries to detail rows and Ration Composer {@link Food} lines.
 */

import type { Food } from '@/src/lib/foodDatabase';
import {
  DEFAULT_STUECK_GRAMS_FALLBACK,
  inferDoseGramsFromFood,
  inferFlascheGramsFromFood,
  inferGlasMlFromFood,
  inferStueckGramsFromFood,
} from '@/src/lib/portionUtils';
import type { Ingredient, MealTemplate, Nutrition } from '@/src/types';

const UNIT_TO_GRAMS: Record<string, number> = {
  g: 1,
  ml: 1,
  tl: 5,
  el: 15,
};

export type NutritionDetailRow = {
  name: string;
  portionLabel: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** Human-readable portion for one logged ingredient line. */
export function formatIngredientPortion(ing: Ingredient): string {
  if (ing.servingName?.trim()) return `${ing.amount} (${ing.servingName.trim()})`;
  const u = (ing.unit || '').trim();
  return u ? `${ing.amount} ${u}` : String(ing.amount);
}

/**
 * Rows for a modal / list: uses stored `ingredients` when present, otherwise one summary row from the entry.
 */
export function nutritionEntryToDetailRows(entry: Nutrition): NutritionDetailRow[] {
  const ingredients = entry.ingredients;
  if (ingredients && ingredients.length > 0) {
    return ingredients.map(i => ({
      name: i.name,
      portionLabel: formatIngredientPortion(i),
      calories: Math.round(i.calories),
      protein: i.protein,
      carbs: i.carbs,
      fat: i.fat,
    }));
  }
  const portion =
    entry.quantity != null && entry.unit !== undefined && `${entry.unit}`.length > 0
      ? `${entry.quantity} ${entry.unit}`
      : '—';
  return [
    {
      name: entry.meal,
      portionLabel: portion,
      calories: Math.round(entry.calories),
      protein: entry.protein ?? 0,
      carbs: entry.carbs ?? 0,
      fat: entry.fat ?? 0,
    },
  ];
}

function makeSyntheticFood(
  idSuffix: string,
  name: string,
  gramsPortion: number,
  calories: number,
  protein: number,
  carbs: number,
  fat: number,
): Food {
  const g = Math.max(1, Math.round(gramsPortion));
  const safeId = `synth_${idSuffix}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 96);
  return {
    id: safeId,
    name,
    category: 'readymeal',
    nutrients: {
      calories: Math.round((calories * 100) / g),
      protein: Math.round((protein * 100) / g * 10) / 10,
      carbs: Math.round((carbs * 100) / g * 10) / 10,
      fat: Math.round((fat * 100) / g * 10) / 10,
    },
    servings: [{ name: 'Referenz', grams: g }],
  };
}

/** Gram-equivalent mass for ration composer (grams column). */
function gramsForIngredient(ing: Ingredient, stkFallbackGrams: number, food?: Food): number {
  const uRaw = (ing.unit || 'g').trim().toLowerCase();
  const u = uRaw.replace(/\./g, '');
  const a = Number(ing.amount);
  if (!Number.isFinite(a) || a <= 0) return 1;
  if (u === 'g' || u === 'ml' || u === '') return Math.max(1, Math.round(a));
  if (u === 'tl') return Math.max(1, Math.round(a * UNIT_TO_GRAMS.tl));
  if (u === 'el') return Math.max(1, Math.round(a * UNIT_TO_GRAMS.el));
  if (u === 'stk' || u === 'stück' || u === 'stueck') return Math.max(1, Math.round(a * stkFallbackGrams));
  if (food) {
    const dg = inferDoseGramsFromFood(food);
    if (u === 'dose' && dg) return Math.max(1, Math.round(a * dg));
    const gm = inferGlasMlFromFood(food);
    if (u === 'glas' && gm != null) return Math.max(1, Math.round(a * gm));
    const fl = inferFlascheGramsFromFood(food);
    if (u === 'flasche' && fl) return Math.max(1, Math.round(a * fl));
  }
  // Portion / unknown: treat amount as meaningful mass if already large, else default reference.
  if (a >= 25) return Math.max(1, Math.round(a));
  return Math.max(1, Math.round(a * 100));
}

function gramsForTopLevelEntry(entry: Nutrition, baseFood?: Food): number {
  const q = entry.quantity ?? 100;
  const unit = (entry.unit || 'g').trim().toLowerCase().replace(/\./g, '');
  const piece = baseFood ? inferStueckGramsFromFood(baseFood) : DEFAULT_STUECK_GRAMS_FALLBACK;
  const map: Record<string, number> = { ...UNIT_TO_GRAMS, stk: piece, stück: piece, stueck: piece };
  if (baseFood) {
    const dg = inferDoseGramsFromFood(baseFood);
    if (dg) map.dose = dg;
    const gm = inferGlasMlFromFood(baseFood);
    if (gm != null) map.glas = gm;
    const fl = inferFlascheGramsFromFood(baseFood);
    if (fl) map.flasche = fl;
  }
  const mult = map[unit] ?? 1;
  return Math.max(1, Math.round(q * mult));
}

/**
 * Expands one nutrition log into composer lines ({@link Food} + grams).
 * Keeps totals consistent with `nutsForGrams`-style scaling in the composer.
 */
export function nutritionEntryToComposerSeeds(entry: Nutrition): { food: Food; grams: number }[] {
  const ingredients = entry.ingredients;
  if (ingredients && ingredients.length > 0) {
    return ingredients.map((ing, i) => {
      const stkFallback = DEFAULT_STUECK_GRAMS_FALLBACK;
      let resolvedFood: Food | undefined;
      const stk = resolvedFood ? inferStueckGramsFromFood(resolvedFood) : stkFallback;
      const g = gramsForIngredient(ing, stk, resolvedFood);
      const food = makeSyntheticFood(
        `${entry.id}_ing_${i}`,
        ing.name,
        g,
        ing.calories,
        ing.protein,
        ing.carbs,
        ing.fat,
      );
      return { food, grams: g };
    });
  }
  const grams = gramsForTopLevelEntry(entry, undefined);
  const food = makeSyntheticFood(
    entry.id,
    entry.meal,
    grams,
    entry.calories,
    entry.protein ?? 0,
    entry.carbs ?? 0,
    entry.fat ?? 0,
  );
  return [{ food, grams }];
}

/** Combine several logs (e.g. multi-select) into one composer seed list (order preserved). */
export function nutritionEntriesToMergedComposerSeeds(entries: Nutrition[]): { food: Food; grams: number }[] {
  const out: { food: Food; grams: number }[] = [];
  for (const e of entries) {
    out.push(...nutritionEntryToComposerSeeds(e));
  }
  return out;
}

/**
 * Gespeicherte Vorlage → Composer-Zeilen: echtes {@link Food} aus der DB wenn möglich,
 * sonst synthetische Zeile aus den gespeicherten Nährwerten (wie beim Merge aus Logs).
 */
export function mealTemplateToComposerSeeds(tmpl: MealTemplate): { food: Food; grams: number }[] {
  const ingredients = tmpl.ingredients ?? [];
  return ingredients.map((ing, i) => {
    let resolvedFood: Food | undefined;
    const stkFallback = resolvedFood ? inferStueckGramsFromFood(resolvedFood) : DEFAULT_STUECK_GRAMS_FALLBACK;
    const grams = gramsForIngredient(ing, stkFallback, resolvedFood);
    if (resolvedFood && !String(resolvedFood.id).startsWith('synth_')) {
      return { food: resolvedFood, grams };
    }
    return {
      food: makeSyntheticFood(`${tmpl.id}_tpl_${i}`, ing.name, grams, ing.calories, ing.protein, ing.carbs, ing.fat),
      grams,
    };
  });
}
