import type { Ingredient } from '../../../types';
import type { MealIntent, ResolvedFoodLine } from '../schemas';
import type { MealAnalysis, PipelineResult } from './schemas';
import { macrosForCandidate } from './nutritionFromCandidate';
import { calculateNutrition } from './NutritionCalculator';

export function intentToPipelineInput(intent: MealIntent): { text: string } {
  const parts = intent.items.flatMap((item) =>
    item.components.map((c) => {
      const hint = (c.foodHint || c.rawText || '').trim();
      const q =
        c.quantity?.explicit && typeof c.quantity.value === 'number'
          ? `${c.quantity.value}${c.quantity.unit === 'g' ? 'g' : c.quantity.unit === 'ml' ? 'ml' : ''} `
          : '';
      return `${q}${hint}`.trim();
    }),
  );
  const text = parts.filter(Boolean).join(', ');
  return { text: text || intent.items.map((i) => i.label).join(', ') };
}

export function analysisToMealIntent(analysis: MealAnalysis): MealIntent {
  const confidence =
    analysis.confidence_overall === 'high' ? 0.9 : analysis.confidence_overall === 'medium' ? 0.7 : 0.5;
  return {
    items: [
      {
        label: analysis.meal_name,
        dishType: 'composite_recipe',
        quantityMultiplier: 1,
        components: analysis.components.map((c) => ({
          rawText: c.name,
          foodHint: c.name,
          quantity: { explicit: true, value: c.estimated_grams, unit: 'g' },
          isPackaged: c.role === 'packaged_product',
        })),
      },
    ],
    parseConfidence: confidence,
  };
}

export function pipelineToLegacyResolve(result: PipelineResult): {
  lines: ResolvedFoodLine[];
  ingredients: Ingredient[];
  plausibilityIssues: Array<{ code: string; severity: 'warning' | 'error'; message: string }>;
} {
  const lines: ResolvedFoodLine[] = [];
  const ingredients: Ingredient[] = [];

  for (const match of result.matches) {
    const selected = match.candidates[(match.auto_selected_rank ?? 1) - 1] ?? match.candidates[0];
    if (!selected) continue;

    const grams = match.estimated_grams;
    const macros = macrosForCandidate(selected, grams);
    const foodId = selected.openfoodfacts_id ? `off_${selected.openfoodfacts_id}` : 'generic_unknown';
    const source =
      selected.data_source === 'openfoodfacts'
        ? 'openfoodfacts'
        : selected.data_source === 'estimated_fallback'
          ? 'generic_baseline'
          : 'app';

    const line: ResolvedFoodLine = {
      foodId,
      source: source as ResolvedFoodLine['source'],
      displayName: selected.product_name,
      grams,
      portionOptions: [
        {
          id: 'grams',
          label: `${grams} g`,
          logUnit: 'g',
          quantity: 1,
          grams,
          source: 'generic_default',
          isDefault: true,
        },
      ],
      selectedPortionId: 'grams',
      logUnit: 'g',
      quantity: grams,
      per100g: {
        kcal: selected.kcal_100g,
        protein: selected.protein_100g,
        carbs: selected.carbs_100g,
        fat: selected.fat_100g,
      },
      matchScore: selected.score / 100,
      matchReason: `v3:${selected.source_step}`,
      matchUncertainty: match.requires_user_review
        ? 'high'
        : selected.score >= 70
          ? 'low'
          : 'medium',
      requiresCandidatePick: match.requires_user_review,
      dataQuality: { complete: true, flags: [] },
      nutrientSource: 'database',
      candidates: match.candidates.slice(0, 3).map((c) => ({
        foodId: c.openfoodfacts_id ? `off_${c.openfoodfacts_id}` : foodId,
        displayName: c.product_name,
        matchScore: c.score / 100,
        source,
      })),
    };
    lines.push(line);
    ingredients.push({
      id: foodId.startsWith('off_') ? foodId : undefined,
      name: match.component_name,
      amount: grams,
      unit: 'g',
      calories: macros.kcal,
      protein: macros.protein,
      carbs: macros.carbs,
      fat: macros.fat,
      nutrientSource: selected.data_source === 'openfoodfacts' ? 'database' : 'model_estimate',
      matchScore: selected.score / 100,
      matchSource: selected.data_source,
    });
  }

  const plausibilityIssues = result.sanityWarnings.map((message, i) => ({
    code: `v3_sanity_${i}`,
    severity: 'warning' as const,
    message,
  }));

  return { lines, ingredients, plausibilityIssues };
}

export function recomputePipelineFromReview(
  result: PipelineResult,
  reviewed: Array<{ component_id: string; grams: number; selectedRank: number }>,
): PipelineResult {
  const reviewMap = new Map(reviewed.map((r) => [r.component_id, r]));
  const matches = result.matches.map((match) => {
    const row = reviewMap.get(match.component_id);
    const grams = row?.grams ?? match.estimated_grams;
    const rank = row?.selectedRank ?? match.auto_selected_rank ?? 1;
    const selected = match.candidates[rank - 1] ?? match.candidates[0];
    if (!selected) return { ...match, estimated_grams: grams };

    const reordered = [...match.candidates];
    const pickIdx = reordered.findIndex(
      (c) => c.rank === rank || c.product_name === selected.product_name,
    );
    if (pickIdx > 0) {
      const [picked] = reordered.splice(pickIdx, 1);
      reordered.unshift(picked);
    }

    return {
      ...match,
      estimated_grams: grams,
      candidates: reordered.map((c, i) => ({ ...c, rank: (i + 1) as 1 | 2 | 3 })),
      auto_selected_rank: 1,
    };
  });

  const matchById = new Map(matches.map((m) => [m.component_id, m]));
  const components = matches
    .map((m) => calculateNutrition(m))
    .filter((v): v is NonNullable<typeof v> => Boolean(v))
    .map((c) => {
      const row = reviewMap.get(c.component_id);
      const grams = row?.grams ?? c.grams;
      const match = matchById.get(c.component_id);
      const selected = match?.candidates[0];
      if (!selected) return { ...c, grams };
      const macros = macrosForCandidate(selected, grams);
      return {
        ...c,
        grams,
        data_source: selected.data_source,
        confidence_score: selected.score,
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
    ...result,
    matches,
    components,
    totals: { ...totals, fiber: totals.fiber || undefined },
    user_review_required: matches.some((m) => m.requires_user_review),
  };
}
