import { z } from 'zod';

export const DishTypeSchema = z.enum(['composite_recipe', 'packaged_brand', 'single_ingredient']);

export const ExplicitQuantitySchema = z.object({
  explicit: z.literal(true),
  value: z.number().finite().positive(),
  unit: z.enum(['g', 'ml', 'stk', 'dose', 'flasche', 'packung', 'scheibe']),
  multiplier: z.number().finite().positive().optional(),
});

export const MealComponentSchema = z.object({
  rawText: z.string(),
  foodHint: z.string(),
  quantity: ExplicitQuantitySchema.nullable().optional(),
  isPackaged: z.boolean().default(false),
  fromTemplate: z.boolean().optional(),
});

export const MealItemSchema = z.object({
  label: z.string(),
  dishType: DishTypeSchema,
  templateId: z.string().optional(),
  quantityMultiplier: z.number().finite().positive().default(1),
  components: z.array(MealComponentSchema).min(1),
});

export const MealIntentSchema = z.object({
  items: z.array(MealItemSchema).min(1),
  parseConfidence: z.number().min(0).max(1).default(0.8),
});

export type MealIntent = z.infer<typeof MealIntentSchema>;
export type MealItem = z.infer<typeof MealItemSchema>;
export type MealComponent = z.infer<typeof MealComponentSchema>;
export type DishType = z.infer<typeof DishTypeSchema>;

export const PortionOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  logUnit: z.string(),
  quantity: z.number(),
  grams: z.number(),
  source: z.enum(['off_pack', 'off_serving', 'dish_template', 'generic_default', 'user_last']),
  isDefault: z.boolean().optional(),
});

export type PortionOption = z.infer<typeof PortionOptionSchema>;

export const ResolvedFoodLineSchema = z.object({
  foodId: z.string(),
  source: z.enum(['openfoodfacts', 'generic_baseline', 'app']),
  displayName: z.string(),
  grams: z.number(),
  portionOptions: z.array(PortionOptionSchema),
  selectedPortionId: z.string(),
  logUnit: z.string(),
  quantity: z.number(),
  per100g: z.object({
    kcal: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  }),
  matchScore: z.number(),
  matchReason: z.string(),
  matchUncertainty: z.enum(['high', 'medium', 'low', 'blocked']).optional(),
  requiresCandidatePick: z.boolean().optional(),
  dataQuality: z.object({
    complete: z.boolean(),
    flags: z.array(z.string()),
  }),
  nutrientSource: z.literal('database'),
  candidates: z
    .array(
      z.object({
        foodId: z.string(),
        displayName: z.string(),
        matchScore: z.number(),
        source: z.string(),
      }),
    )
    .optional(),
});

export type ResolvedFoodLine = z.infer<typeof ResolvedFoodLineSchema>;

export const NutritionLabelScanSchema = z.object({
  basis: z.enum(['per_100g', 'per_100ml', 'per_serving']),
  serving_size_text: z.string().nullable().optional(),
  nutrients: z.object({
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
  }),
  confidence: z.number().min(0).max(1),
  warnings: z.array(z.string()).default([]),
});

export type NutritionLabelScan = z.infer<typeof NutritionLabelScanSchema>;
