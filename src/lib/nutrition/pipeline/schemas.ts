import { z } from 'zod';

export const PipelineStateSchema = z.enum([
  'IDLE',
  'ANALYZING',
  'SEARCHING',
  'CALCULATING',
  'AWAITING_REVIEW',
  'SAVING',
  'COMPLETE',
  'ERROR',
]);

export const SearchStrategySchema = z.object({
  primary: z.array(z.string()).min(1),
  secondary: z.array(z.string()).default([]),
  generic_fallback: z.array(z.string()).default([]),
  off_database_fallback: z.string().min(1),
  openfoodfacts_categories: z.array(z.string()).default([]),
  barcode_hint: z.string().nullable().optional(),
});

export const MealComponentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  role: z.string().min(1),
  estimated_grams: z.number().positive(),
  /** Stückzahl, wenn die KI nach Stück gezählt hat (z. B. 2 Semmeln). */
  estimated_piece_count: z.number().positive().nullable().optional(),
  /** Gramm pro Stück/Scheibe, wenn sinnvoll (z. B. 60 für eine Semmel). */
  grams_per_piece: z.number().positive().nullable().optional(),
  gram_confidence: z.enum(['high', 'medium', 'low']),
  gram_reasoning: z.string().min(1),
  is_cooked: z.boolean(),
  cooking_method: z.string().nullable().optional(),
  visual_confidence: z.enum(['high', 'medium', 'low']).optional(),
  search_strategy: SearchStrategySchema,
});

export const MealAnalysisSchema = z.object({
  input_type: z.enum(['text', 'image']),
  input_language: z.string().default('de'),
  meal_name: z.string().min(1),
  meal_category: z.string().min(1),
  cuisine: z.string().nullable().optional(),
  total_estimated_weight_g: z.number().positive(),
  portion_context: z.string().nullable().optional(),
  confidence_overall: z.enum(['high', 'medium', 'low']),
  is_chain_restaurant: z.boolean().optional(),
  chain_name: z.string().nullable().optional(),
  components: z.array(MealComponentSchema).min(1),
  notes: z.string().nullable().optional(),
  image_analysis: z
    .object({
      visible_items: z.array(z.string()).default([]),
      container_estimate: z.string().nullable().optional(),
      uncertainty_factors: z.array(z.string()).default([]),
    })
    .nullable()
    .optional(),
});

export const ProductCandidateSchema = z.object({
  rank: z.number().int().min(1).max(3),
  score: z.number(),
  source_step: z.enum(['primary', 'secondary', 'synonym', 'category', 'generic']),
  openfoodfacts_id: z.string().nullable().optional(),
  product_name: z.string(),
  brand: z.string().nullable().optional(),
  /** OFF generic_name (nicht Brand) — für Strict-Match / Debug. */
  generic_name: z.string().nullable().optional(),
  /** Suchterm, mit dem dieser Kandidat gescored wurde. */
  match_term: z.string().nullable().optional(),
  kcal_100g: z.number(),
  protein_100g: z.number(),
  carbs_100g: z.number(),
  fat_100g: z.number(),
  fiber_100g: z.number().nullable().optional(),
  serving_size: z.string().nullable().optional(),
  data_completeness: z.enum(['full', 'partial']),
  data_source: z.enum(['openfoodfacts', 'estimated_fallback', 'chain_menu_data']),
});

export const ComponentMatchSchema = z.object({
  component_id: z.string(),
  component_name: z.string(),
  estimated_grams: z.number(),
  confidence: z.enum(['high', 'medium', 'low']),
  search_steps_executed: z.array(z.string()).default([]),
  candidates: z.array(ProductCandidateSchema).max(3),
  auto_selected_rank: z.number().int().min(1).max(3).nullable(),
  requires_user_review: z.boolean(),
  review_reasons: z.array(z.string()).default([]),
});

export const ComponentNutritionSchema = z.object({
  component_id: z.string(),
  component_name: z.string(),
  grams: z.number().positive(),
  data_source: z.enum(['openfoodfacts', 'estimated_fallback', 'chain_menu_data']),
  confidence_score: z.number().min(0).max(100),
  kcal: z.number(),
  protein: z.number(),
  carbs: z.number(),
  fat: z.number(),
  fiber: z.number().nullable().optional(),
});

export const PipelineResultSchema = z.object({
  state: PipelineStateSchema,
  analysis: MealAnalysisSchema,
  matches: z.array(ComponentMatchSchema),
  components: z.array(ComponentNutritionSchema),
  totals: z.object({
    kcal: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
    fiber: z.number().nullable().optional(),
  }),
  sanityWarnings: z.array(z.string()).default([]),
  user_review_required: z.boolean(),
  pipeline_version: z.string(),
  ai_model_used: z.string().nullable().optional(),
});

export type PipelineState = z.infer<typeof PipelineStateSchema>;
export type MealAnalysis = z.infer<typeof MealAnalysisSchema>;
export type MealComponent = z.infer<typeof MealComponentSchema>;
export type ProductCandidate = z.infer<typeof ProductCandidateSchema>;
export type ComponentMatch = z.infer<typeof ComponentMatchSchema>;
export type ComponentNutrition = z.infer<typeof ComponentNutritionSchema>;
export type PipelineResult = z.infer<typeof PipelineResultSchema>;
