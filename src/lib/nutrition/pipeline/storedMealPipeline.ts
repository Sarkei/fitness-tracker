import type { Ingredient, Nutrition } from '../../../types';
import type { ComponentMatch, PipelineResult, ProductCandidate } from './schemas';

export type StoredComponentRow = {
  component_id: string | null;
  food_name: string;
  openfoodfacts_id: string | null;
  product_name: string;
  brand: string | null;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  data_source: string;
  confidence_score: number;
  user_modified: boolean;
};

function per100FromRow(row: StoredComponentRow, field: 'kcal' | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'): number {
  const grams = Math.max(1, Number(row.grams) || 1);
  const total =
    field === 'kcal'
      ? Number(row.kcal) || 0
      : field === 'protein_g'
        ? Number(row.protein_g) || 0
        : field === 'carbs_g'
          ? Number(row.carbs_g) || 0
          : field === 'fat_g'
            ? Number(row.fat_g) || 0
            : Number(row.fiber_g) || 0;
  return Math.round((total / grams) * 1000) / 10;
}

function findSavedIngredient(ingredients: Ingredient[] | undefined, foodName: string): Ingredient | undefined {
  if (!ingredients?.length) return undefined;
  const key = foodName.trim().toLowerCase();
  return ingredients.find((i) => i.name.trim().toLowerCase() === key);
}

function storedRowMacros(row: StoredComponentRow, savedIngredient?: Ingredient): {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number | null;
} {
  if (savedIngredient && Number(savedIngredient.calories) > 0) {
    return {
      kcal: Math.round(Number(savedIngredient.calories) || 0),
      protein: Math.round((Number(savedIngredient.protein) || 0) * 10) / 10,
      carbs: Math.round((Number(savedIngredient.carbs) || 0) * 10) / 10,
      fat: Math.round((Number(savedIngredient.fat) || 0) * 10) / 10,
      fiber: null,
    };
  }
  return {
    kcal: Math.round(Number(row.kcal) || 0),
    protein: Math.round((Number(row.protein_g) || 0) * 10) / 10,
    carbs: Math.round((Number(row.carbs_g) || 0) * 10) / 10,
    fat: Math.round((Number(row.fat_g) || 0) * 10) / 10,
    fiber: row.fiber_g != null ? Math.round((Number(row.fiber_g) || 0) * 10) / 10 : null,
  };
}

function rowToCandidate(row: StoredComponentRow, rank: 1 | 2 | 3 = 1): ProductCandidate {
  const source =
    row.data_source === 'openfoodfacts'
      ? 'openfoodfacts'
      : row.data_source === 'chain_menu_data'
        ? 'chain_menu_data'
        : 'estimated_fallback';
  return {
    rank,
    score: Number(row.confidence_score) || 70,
    source_step: source === 'openfoodfacts' ? 'primary' : 'generic',
    openfoodfacts_id: row.openfoodfacts_id,
    product_name: row.product_name || row.food_name,
    brand: row.brand,
    kcal_100g: per100FromRow(row, 'kcal'),
    protein_100g: per100FromRow(row, 'protein_g'),
    carbs_100g: per100FromRow(row, 'carbs_g'),
    fat_100g: per100FromRow(row, 'fat_g'),
    fiber_100g: row.fiber_g != null ? per100FromRow(row, 'fiber_g') : null,
    serving_size: null,
    data_completeness: 'full',
    data_source: source,
  };
}

/** Rekonstruiert ein editierbares PipelineResult aus gespeicherten DB-Komponenten. */
export function pipelineResultFromStoredMeal(
  nutrition: Pick<
    Nutrition,
    | 'meal'
    | 'inputType'
    | 'originalInput'
    | 'mealCategory'
    | 'cuisine'
    | 'aiModelUsed'
    | 'pipelineVersion'
    | 'userReviewed'
  >,
  rows: StoredComponentRow[],
  savedIngredients?: Ingredient[],
): PipelineResult {
  const matches: ComponentMatch[] = rows.map((row, idx) => {
    const componentId = row.component_id || `stored_${idx}_${row.food_name.slice(0, 20)}`;
    const grams = Math.max(1, Math.round(Number(row.grams) || 1));
    const candidate = rowToCandidate(row, 1);
    return {
      component_id: componentId,
      component_name: row.food_name,
      estimated_grams: grams,
      confidence: Number(row.confidence_score) >= 80 ? 'high' : 'medium',
      search_steps_executed: ['stored_meal_reload'],
      candidates: [candidate],
      auto_selected_rank: 1,
      requires_user_review: false,
      review_reasons: row.user_modified ? ['user-modified'] : [],
    };
  });

  const components = rows.map((row, idx) => {
    const componentId = row.component_id || `stored_${idx}_${row.food_name.slice(0, 20)}`;
    const grams = Math.max(1, Math.round(Number(row.grams) || 1));
    const savedIng = findSavedIngredient(savedIngredients, row.food_name);
    const macros = storedRowMacros(row, savedIng);
    const candidate = rowToCandidate(row, 1);
    if (savedIng && macros.kcal > 0) {
      const grams = Math.max(1, Math.round(Number(row.grams) || 1));
      candidate.kcal_100g = per100FromRow(
        { ...row, kcal: macros.kcal, protein_g: macros.protein, carbs_g: macros.carbs, fat_g: macros.fat },
        'kcal',
      );
      candidate.protein_100g = per100FromRow(
        { ...row, kcal: macros.kcal, protein_g: macros.protein, carbs_g: macros.carbs, fat_g: macros.fat },
        'protein_g',
      );
      candidate.carbs_100g = per100FromRow(
        { ...row, kcal: macros.kcal, protein_g: macros.protein, carbs_g: macros.carbs, fat_g: macros.fat },
        'carbs_g',
      );
      candidate.fat_100g = per100FromRow(
        { ...row, kcal: macros.kcal, protein_g: macros.protein, carbs_g: macros.carbs, fat_g: macros.fat },
        'fat_g',
      );
    }
    return {
      component_id: componentId,
      component_name: row.food_name,
      grams,
      data_source: candidate.data_source,
      confidence_score: candidate.score,
      kcal: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      fiber: macros.fiber,
    };
  });

  const totals = components.reduce(
    (acc, c) => ({
      kcal: acc.kcal + c.kcal,
      protein: Math.round((acc.protein + c.protein) * 10) / 10,
      carbs: Math.round((acc.carbs + c.carbs) * 10) / 10,
      fat: Math.round((acc.fat + c.fat) * 10) / 10,
      fiber: Math.round((acc.fiber + (c.fiber ?? 0)) * 10) / 10,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );

  return {
    state: 'AWAITING_REVIEW',
    analysis: {
      input_type: nutrition.inputType === 'image' ? 'image' : 'text',
      input_language: 'de',
      meal_name: nutrition.meal,
      meal_category: nutrition.mealCategory || 'snack',
      cuisine: nutrition.cuisine ?? null,
      total_estimated_weight_g: components.reduce((s, c) => s + c.grams, 0),
      portion_context: 'stored_meal_edit',
      confidence_overall: 'high',
      is_chain_restaurant: false,
      chain_name: null,
      components: matches.map((m) => ({
        id: m.component_id,
        name: m.component_name,
        role: 'ingredient',
        estimated_grams: m.estimated_grams,
        gram_confidence: 'high',
        gram_reasoning: 'from stored log',
        is_cooked: true,
        search_strategy: {
          primary: [m.component_name],
          secondary: [],
          generic_fallback: [],
          off_database_fallback: m.component_name,
          openfoodfacts_categories: [],
        },
      })),
      notes: null,
    },
    matches,
    components,
    totals,
    sanityWarnings: [],
    user_review_required: false,
    pipeline_version: nutrition.pipelineVersion || 'nutrition-v3',
    ai_model_used: nutrition.aiModelUsed ?? null,
  };
}
