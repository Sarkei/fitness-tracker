import type { Ingredient, Nutrition } from '@/src/types';
import type { PipelineResult } from './schemas';
import { buildReviewedComponent } from '../buildReviewedComponent';
import type { ReviewedComponent } from '@/src/components/nutrition/MealReviewScreen';
import { recomputePipelineFromReview } from './legacyAdapter';
import { removeComponentFromPipeline } from './manualFoodMatch';
import { pipelineResultFromStoredMeal } from './storedMealPipeline';
import {
  fetchNutritionLogComponents,
  updateNutritionPipelineV3,
} from '@/src/services/nutritionLogService';

export function resolveMatchIndexForIngredient(
  result: PipelineResult,
  ingredients: Ingredient[] | undefined,
  ingredientIndex: number,
): number {
  const ing = ingredients?.[ingredientIndex];
  if (!ing) return Math.min(Math.max(0, ingredientIndex), Math.max(0, result.matches.length - 1));
  const key = ing.name.trim().toLowerCase();
  const byName = result.matches.findIndex((m) => m.component_name.trim().toLowerCase() === key);
  if (byName >= 0) return byName;
  return Math.min(Math.max(0, ingredientIndex), Math.max(0, result.matches.length - 1));
}

export function initialReviewedFromPipeline(
  result: PipelineResult,
  savedIngredients?: Ingredient[],
): ReviewedComponent[] {
  const analysisById = new Map(result.analysis.components.map((c) => [c.id, c]));
  return result.matches.map((m) =>
    buildReviewedComponent(m, {
      savedIngredients,
      gramsOverride: Math.max(1, Math.round(m.estimated_grams)),
      analysisComponent: analysisById.get(m.component_id),
    }),
  );
}

/** Pipeline auf die noch vorhandenen Review-Zeilen beschränken (entfernte Komponenten bleiben weg). */
export function filterPipelineResultToReviewed(
  result: PipelineResult,
  reviewed: ReviewedComponent[],
): PipelineResult {
  const ids = new Set(reviewed.map((r) => r.component_id));
  const matches = result.matches.filter((m) => ids.has(m.component_id));
  const analysis = {
    ...result.analysis,
    components: result.analysis.components.filter((c) => ids.has(c.id)),
    meal_name:
      matches.length > 0
        ? matches.map((m) => m.component_name).join(', ').slice(0, 200)
        : result.analysis.meal_name,
  };
  return recomputePipelineFromReview(
    { ...result, analysis, matches },
    reviewed.map((row) => ({
      component_id: row.component_id,
      grams: row.grams,
      selectedRank: row.selectedRank,
    })),
  );
}

/**
 * V3-Mahlzeit: eine Zutat aus Tagesansicht entfernen und DB-Komponenten synchron halten.
 * @returns 'deleted' wenn keine Komponenten mehr übrig sind
 */
export async function syncRemoveV3MealIngredient(
  nutrition: Nutrition,
  ingredientIndex: number,
): Promise<'deleted' | 'updated'> {
  const rows = await fetchNutritionLogComponents(nutrition.id);
  const ings = nutrition.ingredients ?? [];
  const ing = ings[ingredientIndex];
  if (!ing) throw new Error('ingredient-not-found');

  const result = pipelineResultFromStoredMeal(nutrition, rows, ings);
  const matchIdx = resolveMatchIndexForIngredient(result, ings, ingredientIndex);
  const match = result.matches[matchIdx];
  if (!match) throw new Error('component-not-found');

  const next = removeComponentFromPipeline(result, match.component_id);
  if (!next) return 'deleted';

  const remainingIngs = ings.filter((_, i) => i !== ingredientIndex);
  const reviewed = initialReviewedFromPipeline(next, remainingIngs);
  const recomputed = filterPipelineResultToReviewed(next, reviewed);

  await updateNutritionPipelineV3({
    nutritionId: nutrition.id,
    result: recomputed,
    reviewedComponents: reviewed,
    originalInput: nutrition.originalInput || nutrition.meal || '',
    date: nutrition.date,
    category: nutrition.category,
  });
  return 'updated';
}
