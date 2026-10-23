import type { Pool } from 'pg';
import { pieceQuantityFromGrams } from '../pieceUnitHelpers';
import type { PipelineResult } from './schemas';
import { macrosForCandidate } from './nutritionFromCandidate';

type ReviewedComponentInput = {
  component_id: string;
  grams: number;
  selectedRank?: number;
  user_modified?: boolean;
  displayUnit?: 'g' | 'piece';
  pieceGrams?: number | null;
};

function ingredientPortionFromReview(item: ReviewedComponentInput, foodName: string, grams: number) {
  if (item.displayUnit === 'piece' && item.pieceGrams && item.pieceGrams > 0) {
    return {
      name: foodName,
      amount: pieceQuantityFromGrams(grams, item.pieceGrams),
      unit: 'stk' as const,
    };
  }
  return {
    name: foodName,
    amount: grams,
    unit: 'g' as const,
  };
}

export class MealLogRepository {
  constructor(private readonly pool: Pool) {}

  async saveReviewedMeal(params: {
    userId: number;
    result: PipelineResult;
    reviewedComponents: ReviewedComponentInput[];
    originalInput: string;
    date?: string;
    category?: string;
  }): Promise<string> {
    const componentById = new Map(params.result.components.map((c) => [c.component_id, c]));
    const matchById = new Map(params.result.matches.map((m) => [m.component_id, m]));
    const rows = params.reviewedComponents
      .map((item) => {
        const comp = componentById.get(item.component_id);
        const match = matchById.get(item.component_id);
        if (!comp || !match) return null;
        const selected = match.candidates[(item.selectedRank ?? 1) - 1] ?? match.candidates[0];
        if (!selected) return null;
        const macros = macrosForCandidate(selected, item.grams);
        return {
          componentId: item.component_id,
          food_name: comp.component_name,
          openfoodfacts_id: selected.openfoodfacts_id ?? null,
          product_name: selected.product_name,
          brand: selected.brand ?? null,
          grams: item.grams,
          kcal: macros.kcal,
          protein_g: macros.protein,
          carbs_g: macros.carbs,
          fat_g: macros.fat,
          fiber_g: macros.fiber,
          data_source: selected.data_source,
          confidence_score: selected.score,
          user_modified: item.user_modified === true,
        };
      })
      .filter((v): v is NonNullable<typeof v> => Boolean(v));

    const totals = rows.reduce(
      (acc, row) => ({
        kcal: acc.kcal + row.kcal,
        protein: Math.round((acc.protein + row.protein_g) * 10) / 10,
        carbs: Math.round((acc.carbs + row.carbs_g) * 10) / 10,
        fat: Math.round((acc.fat + row.fat_g) * 10) / 10,
        fiber: Math.round((acc.fiber + (row.fiber_g ?? 0)) * 10) / 10,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );

    const nutritionIns = await this.pool.query<{ id: string }>(
      `INSERT INTO nutrition (
         user_id, meal, category, calories, protein, carbs, fat, date,
         ingredients, quantity, unit, input_type, original_input, meal_category,
         cuisine, total_fiber, ai_model_used, pipeline_version, user_reviewed
       ) VALUES (
         $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19
       ) RETURNING id`,
      [
        params.userId,
        params.result.analysis.meal_name,
        params.category ?? this.mapMealCategory(params.result.analysis.meal_category),
        totals.kcal,
        totals.protein,
        totals.carbs,
        totals.fat,
        params.date || new Date().toISOString().split('T')[0],
        JSON.stringify(
          rows.map((r) => {
            const reviewed = params.reviewedComponents.find((c) => c.component_id === r.componentId);
            const portion = ingredientPortionFromReview(
              reviewed ?? { component_id: r.componentId, grams: r.grams, displayUnit: 'g' },
              r.food_name,
              r.grams,
            );
            return {
              id: r.openfoodfacts_id || undefined,
              name: portion.name,
              amount: portion.amount,
              unit: portion.unit,
              calories: r.kcal,
              protein: r.protein_g,
              carbs: r.carbs_g,
              fat: r.fat_g,
              nutrientSource: r.data_source === 'openfoodfacts' ? 'database' : 'model_estimate',
              matchScore: (r.confidence_score ?? 0) / 100,
              matchSource: r.data_source,
            };
          }),
        ),
        null,
        null,
        params.result.analysis.input_type,
        params.originalInput,
        params.result.analysis.meal_category,
        params.result.analysis.cuisine ?? null,
        totals.fiber,
        params.result.ai_model_used ?? null,
        params.result.pipeline_version,
        true,
      ],
    );
    const nutritionId = nutritionIns.rows[0]?.id;
    if (!nutritionId) throw new Error('nutrition-insert-failed');

    for (const row of rows) {
      await this.pool.query(
        `INSERT INTO nutrition_log_components (
          nutrition_id, component_id, food_name, openfoodfacts_id, product_name, brand,
          grams, kcal, protein_g, carbs_g, fat_g, fiber_g, data_source, confidence_score, user_modified
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          nutritionId,
          row.componentId,
          row.food_name,
          row.openfoodfacts_id,
          row.product_name,
          row.brand,
          row.grams,
          row.kcal,
          row.protein_g,
          row.carbs_g,
          row.fat_g,
          row.fiber_g,
          row.data_source,
          row.confidence_score,
          row.user_modified,
        ],
      );
    }

    return nutritionId;
  }

  async updateReviewedMeal(params: {
    nutritionId: string;
    userId: number;
    result: PipelineResult;
    reviewedComponents: ReviewedComponentInput[];
    originalInput?: string;
    date?: string;
    category?: string;
  }): Promise<void> {
    const owned = await this.pool.query<{ id: string }>(
      `SELECT id FROM nutrition WHERE id = $1 AND user_id = $2`,
      [params.nutritionId, params.userId],
    );
    if (!owned.rows[0]?.id) throw new Error('nutrition-not-found');

    const componentById = new Map(params.result.components.map((c) => [c.component_id, c]));
    const matchById = new Map(params.result.matches.map((m) => [m.component_id, m]));
    const rows = params.reviewedComponents
      .map((item) => {
        const comp = componentById.get(item.component_id);
        const match = matchById.get(item.component_id);
        if (!comp || !match) return null;
        const selected = match.candidates[(item.selectedRank ?? 1) - 1] ?? match.candidates[0];
        if (!selected) return null;
        const macros = macrosForCandidate(selected, item.grams);
        return {
          componentId: item.component_id,
          food_name: comp.component_name,
          openfoodfacts_id: selected.openfoodfacts_id ?? null,
          product_name: selected.product_name,
          brand: selected.brand ?? null,
          grams: item.grams,
          kcal: macros.kcal,
          protein_g: macros.protein,
          carbs_g: macros.carbs,
          fat_g: macros.fat,
          fiber_g: macros.fiber,
          data_source: selected.data_source,
          confidence_score: selected.score,
          user_modified: item.user_modified === true,
        };
      })
      .filter((v): v is NonNullable<typeof v> => Boolean(v));

    const totals = rows.reduce(
      (acc, row) => ({
        kcal: acc.kcal + row.kcal,
        protein: Math.round((acc.protein + row.protein_g) * 10) / 10,
        carbs: Math.round((acc.carbs + row.carbs_g) * 10) / 10,
        fat: Math.round((acc.fat + row.fat_g) * 10) / 10,
        fiber: Math.round((acc.fiber + (row.fiber_g ?? 0)) * 10) / 10,
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
    );

    const dateVal =
      params.date?.includes('T') ? params.date.split('T')[0] : params.date || new Date().toISOString().split('T')[0];

    await this.pool.query(
      `UPDATE nutrition SET
         meal=$1, category=$2, calories=$3, protein=$4, carbs=$5, fat=$6, date=$7,
         ingredients=$8::jsonb, original_input=COALESCE($9, original_input), meal_category=$10,
         cuisine=$11, total_fiber=$12, ai_model_used=$13, pipeline_version=$14, user_reviewed=true
       WHERE id=$15 AND user_id=$16`,
      [
        params.result.analysis.meal_name,
        params.category ?? this.mapMealCategory(params.result.analysis.meal_category),
        totals.kcal,
        totals.protein,
        totals.carbs,
        totals.fat,
        dateVal,
        JSON.stringify(
          rows.map((r) => {
            const reviewed = params.reviewedComponents.find((c) => c.component_id === r.componentId);
            const portion = ingredientPortionFromReview(
              reviewed ?? { component_id: r.componentId, grams: r.grams, displayUnit: 'g' },
              r.food_name,
              r.grams,
            );
            return {
              id: r.openfoodfacts_id || undefined,
              name: portion.name,
              amount: portion.amount,
              unit: portion.unit,
              calories: r.kcal,
              protein: r.protein_g,
              carbs: r.carbs_g,
              fat: r.fat_g,
              nutrientSource: r.data_source === 'openfoodfacts' ? 'database' : 'model_estimate',
              matchScore: (r.confidence_score ?? 0) / 100,
              matchSource: r.data_source,
            };
          }),
        ),
        params.originalInput ?? null,
        params.result.analysis.meal_category,
        params.result.analysis.cuisine ?? null,
        totals.fiber,
        params.result.ai_model_used ?? null,
        params.result.pipeline_version,
        params.nutritionId,
        params.userId,
      ],
    );

    await this.pool.query(`DELETE FROM nutrition_log_components WHERE nutrition_id = $1`, [params.nutritionId]);

    for (const row of rows) {
      await this.pool.query(
        `INSERT INTO nutrition_log_components (
          nutrition_id, component_id, food_name, openfoodfacts_id, product_name, brand,
          grams, kcal, protein_g, carbs_g, fat_g, fiber_g, data_source, confidence_score, user_modified
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          params.nutritionId,
          row.componentId,
          row.food_name,
          row.openfoodfacts_id,
          row.product_name,
          row.brand,
          row.grams,
          row.kcal,
          row.protein_g,
          row.carbs_g,
          row.fat_g,
          row.fiber_g,
          row.data_source,
          row.confidence_score,
          row.user_modified,
        ],
      );
    }
  }

  async upsertUserFoodPreference(params: {
    userId: number;
    ingredientKey: string;
    preferredOpenfoodfactsId: string;
    preferredProductName?: string | null;
    preferredGrams?: number | null;
  }): Promise<void> {
    await this.pool.query(
      `INSERT INTO user_food_preferences (
        user_id, ingredient_key, preferred_openfoodfacts_id, preferred_product_name, preferred_grams, updated_at
      ) VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (user_id, ingredient_key)
      DO UPDATE SET
        preferred_openfoodfacts_id = EXCLUDED.preferred_openfoodfacts_id,
        preferred_product_name = EXCLUDED.preferred_product_name,
        preferred_grams = EXCLUDED.preferred_grams,
        updated_at = NOW()`,
      [
        params.userId,
        params.ingredientKey.toLowerCase().trim(),
        params.preferredOpenfoodfactsId,
        params.preferredProductName ?? null,
        params.preferredGrams ?? null,
      ],
    );
  }

  private mapMealCategory(category: string): string {
    if (category === 'breakfast' || category === 'lunch' || category === 'dinner' || category === 'snack') {
      return category;
    }
    if (category.startsWith('drink')) return 'snack';
    if (category === 'street_food') return 'lunch';
    if (category === 'dessert') return 'snack';
    return 'lunch';
  }
}
