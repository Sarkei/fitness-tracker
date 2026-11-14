import { z } from 'zod';

const prepStepSchema = z.object({
  order: z.number(),
  title: z.string().optional(),
  body: z.string(),
});

const recipeIngredientSchema = z.object({
  name: z.string(),
  amount: z.number(),
  unit: z.string(),
  foodId: z.string().optional(),
  note: z.string().optional(),
  unresolved: z.boolean().optional(),
});

export const mealRecipeAiSchema = z.object({
  name: z.string(),
  category: z.string().optional(),
  yields_portions: z.number().int().min(1).max(999).optional(),
  ingredients: z.array(recipeIngredientSchema).min(1),
  prep_steps: z.array(prepStepSchema).min(1),
  llm_estimate_nutrients: z
    .object({
      calories: z.number().optional(),
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
    })
    .optional(),
});

export type MealRecipeAiPayload = z.infer<typeof mealRecipeAiSchema>;
