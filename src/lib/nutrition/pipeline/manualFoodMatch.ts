import type { Food } from '../../foodDatabase';
import type { ComponentMatch, MealAnalysis, PipelineResult, ProductCandidate } from './schemas';
import { calculateNutrition, sumNutrition } from './NutritionCalculator';

const PIPELINE_VERSION = 'nutrition-v3';

function newComponentId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

export function foodToProductCandidate(food: Food, sourceStep: ProductCandidate['source_step'] = 'primary'): ProductCandidate {
  const offId = food.id.startsWith('off_') ? food.id.slice(4) : null;
  const isOff = Boolean(offId);
  return {
    rank: 1,
    score: isOff ? 92 : food.catalogSource === 'app' ? 85 : 75,
    source_step: sourceStep,
    openfoodfacts_id: offId,
    product_name: food.name,
    brand: food.brand ?? null,
    kcal_100g: food.nutrients.calories,
    protein_100g: food.nutrients.protein ?? 0,
    carbs_100g: food.nutrients.carbs ?? 0,
    fat_100g: food.nutrients.fat ?? 0,
    fiber_100g: food.nutrients.fiber ?? null,
    serving_size: food.servings?.[0]?.name ?? null,
    data_completeness: 'full',
    data_source: isOff ? 'openfoodfacts' : 'estimated_fallback',
  };
}

export function foodToComponentMatch(food: Food, grams: number): ComponentMatch {
  const candidate = foodToProductCandidate(food);
  return {
    component_id: newComponentId('manual'),
    component_name: food.name,
    estimated_grams: Math.max(1, Math.round(grams)),
    confidence: 'high',
    search_steps_executed: ['manual_catalog'],
    candidates: [candidate],
    auto_selected_rank: 1,
    requires_user_review: false,
    review_reasons: [],
  };
}

function emptyAnalysis(mealName: string, inputType: 'text' | 'image' = 'text'): MealAnalysis {
  return {
    input_type: inputType,
    input_language: 'de',
    meal_name: mealName,
    meal_category: 'snack',
    cuisine: null,
    total_estimated_weight_g: 100,
    portion_context: 'manual_entry',
    confidence_overall: 'high',
    is_chain_restaurant: false,
    chain_name: null,
    components: [
      {
        id: 'manual_placeholder',
        name: mealName,
        role: 'packaged_product',
        estimated_grams: 100,
        gram_confidence: 'high',
        gram_reasoning: 'manual',
        is_cooked: false,
        search_strategy: {
          primary: [mealName],
          secondary: [],
          generic_fallback: [],
          off_database_fallback: mealName,
          openfoodfacts_categories: [],
        },
      },
    ],
    notes: 'manual_catalog_entry',
  };
}

export function refreshPipelineResult(
  analysis: MealAnalysis,
  matches: ComponentMatch[],
  extras?: Partial<Pick<PipelineResult, 'ai_model_used' | 'sanityWarnings' | 'user_review_required'>>,
): PipelineResult {
  const components = matches
    .map((m) => calculateNutrition(m))
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
  const totals = sumNutrition(components);
  const totalWeight = matches.reduce((s, m) => s + m.estimated_grams, 0);
  return {
    state: 'AWAITING_REVIEW',
    analysis: {
      ...analysis,
      total_estimated_weight_g: Math.max(1, totalWeight),
      meal_name: analysis.meal_name || matches.map((m) => m.component_name).join(', ').slice(0, 120),
    },
    matches,
    components,
    totals,
    sanityWarnings: extras?.sanityWarnings ?? [],
    user_review_required: extras?.user_review_required ?? matches.some((m) => m.requires_user_review),
    pipeline_version: PIPELINE_VERSION,
    ai_model_used: extras?.ai_model_used ?? null,
  };
}

/** Erstes manuelles Lebensmittel oder weiteres zur bestehenden V3-Session. */
export function appendManualFoodToPipeline(
  current: PipelineResult | null,
  food: Food,
  grams: number,
): PipelineResult {
  const match = foodToComponentMatch(food, grams);
  if (!current) {
    const analysis = emptyAnalysis(food.name);
    return refreshPipelineResult(analysis, [match]);
  }
  const analysis = {
    ...current.analysis,
    meal_name:
      current.matches.length === 0
        ? food.name
        : `${current.analysis.meal_name}, ${food.name}`.slice(0, 200),
  };
  return refreshPipelineResult(analysis, [...current.matches, match], {
    ai_model_used: current.ai_model_used,
    sanityWarnings: current.sanityWarnings,
  });
}

export function removeComponentFromPipeline(
  current: PipelineResult,
  componentId: string,
): PipelineResult | null {
  const matches = current.matches.filter((m) => m.component_id !== componentId);
  if (matches.length === 0) return null;
  const analysis = {
    ...current.analysis,
    components: current.analysis.components.filter((c) => c.id !== componentId),
    meal_name:
      matches.length > 0
        ? matches.map((m) => m.component_name).join(', ').slice(0, 200)
        : current.analysis.meal_name,
  };
  return refreshPipelineResult(analysis, matches, {
    ai_model_used: current.ai_model_used,
    sanityWarnings: current.sanityWarnings,
  });
}
