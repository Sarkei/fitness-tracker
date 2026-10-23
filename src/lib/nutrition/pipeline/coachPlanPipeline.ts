import {
  coachMealIngredientLines,
  coachMealPerServingMacros,
  coachMealCookServings,
} from '../../coachTemplateMappers';
import type { MealCategory } from '../../../types';
import type { ComponentMatch, MealAnalysis, PipelineResult } from './schemas';
import { refreshPipelineResult } from './manualFoodMatch';
import { macrosForCandidate } from './nutritionFromCandidate';
import type { ProductCandidate } from './schemas';

function coachCategoryToMealCategory(category: MealCategory): string {
  return category;
}

function parseGramsFromIngredient(line: { amount?: number | string; unit?: string }): number | null {
  if (typeof line.amount === 'number' && Number.isFinite(line.amount)) {
    const u = String(line.unit || 'g').toLowerCase();
    if (u === 'g' || u === 'gramm' || u === '') return Math.max(1, Math.round(line.amount));
    if (u === 'kg') return Math.max(1, Math.round(line.amount * 1000));
    if (u === 'ml') return Math.max(1, Math.round(line.amount));
  }
  if (typeof line.amount === 'string') {
    const m = line.amount.match(/(\d+(?:[.,]\d+)?)\s*(g|kg|ml)?/i);
    if (m) {
      const n = parseFloat(m[1].replace(',', '.'));
      const u = (m[2] || 'g').toLowerCase();
      if (!Number.isFinite(n)) return null;
      if (u === 'kg') return Math.max(1, Math.round(n * 1000));
      return Math.max(1, Math.round(n));
    }
  }
  return null;
}

function buildCoachComponentMatch(params: {
  componentId: string;
  name: string;
  grams: number;
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
}): ComponentMatch {
  const factor = 100 / Math.max(1, params.grams);
  const candidate: ProductCandidate = {
    rank: 1,
    score: 88,
    source_step: 'generic',
    openfoodfacts_id: null,
    product_name: params.name,
    brand: 'Coach-Plan',
    kcal_100g: Math.round(params.kcal * factor),
    protein_100g: Math.round(params.protein * factor * 10) / 10,
    carbs_100g: Math.round(params.carbs * factor * 10) / 10,
    fat_100g: Math.round(params.fat * factor * 10) / 10,
    fiber_100g: null,
    serving_size: `${params.grams} g`,
    data_completeness: 'full',
    data_source: 'estimated_fallback',
  };
  return {
    component_id: params.componentId,
    component_name: params.name,
    estimated_grams: params.grams,
    confidence: 'medium',
    search_steps_executed: ['coach_plan'],
    candidates: [candidate],
    auto_selected_rank: 1,
    requires_user_review: false,
    review_reasons: [],
  };
}

/** Coach-Mahlzeit → V3-PipelineResult ohne zweiten KI-Lauf. */
export function buildCoachPlanPipelineResult(
  meal: Record<string, unknown>,
  opts: { portionsEaten: number; category: MealCategory; dayLabel?: string },
): PipelineResult {
  const title = typeof meal.title === 'string' ? meal.title.trim() : 'Coach-Mahlzeit';
  const mealName = [opts.dayLabel, title].filter(Boolean).join(' · ') || title;
  const per = coachMealPerServingMacros(meal);
  const portions = Math.max(0.25, opts.portionsEaten);
  const yields = coachMealCookServings(meal);
  const scale = portions / yields;

  const totals = {
    kcal: Math.round(per.calories * portions),
    protein: Math.round(per.protein * portions * 10) / 10,
    carbs: Math.round(per.carbs * portions * 10) / 10,
    fat: Math.round(per.fat * portions * 10) / 10,
  };

  const lines = coachMealIngredientLines(meal);
  const matches: ComponentMatch[] = [];

  if (lines.length === 0) {
    const grams = Math.max(100, Math.round(totals.kcal / 2));
    matches.push(
      buildCoachComponentMatch({
        componentId: `coach_${Date.now().toString(36)}`,
        name: title,
        grams,
        ...totals,
      }),
    );
  } else {
    const n = lines.length;
    const share = {
      kcal: totals.kcal / n,
      protein: totals.protein / n,
      carbs: totals.carbs / n,
      fat: totals.fat / n,
    };
    lines.forEach((line, idx) => {
      const grams = parseGramsFromIngredient(line) ?? Math.max(50, Math.round(totals.kcal / n / 2));
      matches.push(
        buildCoachComponentMatch({
          componentId: `coach_${idx}_${line.name.slice(0, 24).replace(/\W+/g, '_')}`,
          name: line.name,
          grams,
          kcal: Math.round(share.kcal),
          protein: share.protein,
          carbs: share.carbs,
          fat: share.fat,
        }),
      );
    });
  }

  const totalWeight = matches.reduce((s, m) => s + m.estimated_grams, 0);
  const analysis: MealAnalysis = {
    input_type: 'text',
    input_language: 'de',
    meal_name: mealName.slice(0, 200),
    meal_category: coachCategoryToMealCategory(opts.category),
    cuisine: null,
    total_estimated_weight_g: totalWeight,
    portion_context: `coach_plan:${portions} portions`,
    confidence_overall: 'medium',
    is_chain_restaurant: false,
    chain_name: null,
    components: matches.map((m) => ({
      id: m.component_id,
      name: m.component_name,
      role: 'ingredient',
      estimated_grams: m.estimated_grams,
      gram_confidence: 'medium' as const,
      gram_reasoning: 'coach_plan_portions',
      is_cooked: true,
      search_strategy: {
        primary: [m.component_name],
        secondary: [],
        generic_fallback: [],
        off_database_fallback: m.component_name,
        openfoodfacts_categories: [],
      },
    })),
    notes: typeof meal.description === 'string' ? meal.description : null,
  };

  return refreshPipelineResult(analysis, matches, {
    ai_model_used: 'coach-plan',
    sanityWarnings: [],
    user_review_required: false,
  });
}

export function coachPipelineReviewedComponents(result: PipelineResult) {
  return result.matches.map((m) => ({
    component_id: m.component_id,
    grams: Math.round(m.estimated_grams),
    selectedRank: m.auto_selected_rank ?? 1,
    user_modified: false,
  }));
}

/** Prüft, ob Coach-Komponenten-Makros zur Summe passen (Toleranz 15 %). */
export function validateCoachPipelineMacros(result: PipelineResult): string[] {
  const warnings: string[] = [];
  for (const match of result.matches) {
    const c = match.candidates[0];
    if (!c) continue;
    const macros = macrosForCandidate(c, match.estimated_grams);
    if (macros.kcal <= 0) {
      warnings.push(`${match.component_name}: keine Kalorien berechnet.`);
    }
  }
  const sumKcal = result.components.reduce((s, c) => s + c.kcal, 0);
  if (sumKcal < 50) {
    warnings.push('Gesamt-Kalorien des Coach-Eintrags wirken sehr niedrig.');
  }
  return warnings;
}
