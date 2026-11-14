import { z } from 'zod';

const coachExerciseRowSchema = z
  .object({
    name: z.string(),
    /** KI setzt oft `null` statt Feld wegzulassen — nullish erlauben. */
    exerciseKey: z.string().nullish(),
    setType: z.string().nullish(),
    sets: z.union([z.number(), z.string()]).nullish(),
    reps: z.union([z.number(), z.string()]).nullish(),
    rest: z.string().nullish(),
    weight: z.string().nullish(),
    notes: z.string().nullish(),
  })
  .passthrough();

const cardioSchema = z
  .object({
    type: z.string().optional(),
    duration: z.string().optional(),
    distance: z.string().optional(),
    pace: z.string().optional(),
    zones: z.string().optional(),
    details: z.string().optional(),
  })
  .passthrough();

const scheduleDaySchema = z
  .object({
    day: z.string(),
    sessionSlot: z.string().optional(),
    isRest: z.boolean().optional(),
    sessionType: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    estimatedDuration: z.number().optional(),
    intensity: z.string().optional(),
    rpe: z.number().optional(),
    warmup: z.string().optional(),
    warmupExercises: z.array(coachExerciseRowSchema).optional(),
    exercises: z.array(coachExerciseRowSchema).optional(),
    /** Strength-Sessions: KI liefert oft `cardio: null` — nullish statt optional. */
    cardio: cardioSchema.nullish(),
    cooldown: z.string().optional(),
    cooldownExercises: z.array(coachExerciseRowSchema).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

export const coachWorkoutWeekSchema = z.object({
  weekFocus: z.string(),
  coachNotes: z.string(),
  assumptions: z.array(z.string()).max(5).optional().default([]),
  applied_constraints: z.array(z.string()).max(8).optional().default([]),
  schedule: z.array(scheduleDaySchema),
});

export type CoachWorkoutWeek = z.infer<typeof coachWorkoutWeekSchema>;

const nutritionIngredientSchema = z.union([
  z.string(),
  z
    .object({
      name: z.string(),
      amount: z.union([z.number(), z.string()]).optional(),
      unit: z.string().optional(),
    })
    .passthrough(),
]);

const nutritionMealSchema = z
  .object({
    type: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    prepTime: z.string().optional(),
    servings: z.number().optional(),
    calories: z.number().optional(),
    protein: z.number().optional(),
    carbs: z.number().optional(),
    fat: z.number().optional(),
    ingredients: z.array(nutritionIngredientSchema).optional(),
    prepSteps: z.array(z.string()).optional(),
    prep_steps: z.array(z.string()).optional(),
    notes: z.string().optional(),
  })
  .passthrough();

const nutritionDaySchema = z
  .object({
    day: z.string(),
    totalCalories: z.number().optional(),
    meals: z.array(nutritionMealSchema).optional(),
  })
  .passthrough();

export const coachNutritionWeekSchema = z.object({
  weekFocus: z.string(),
  coachNotes: z.string(),
  assumptions: z.array(z.string()).max(5).optional().default([]),
  applied_constraints: z.array(z.string()).max(8).optional().default([]),
  dailyTargets: z
    .object({
      calories: z.number().optional(),
      protein: z.number().optional(),
      carbs: z.number().optional(),
      fat: z.number().optional(),
    })
    .passthrough()
    .optional(),
  mealPlan: z.array(nutritionDaySchema),
  shoppingListHighlights: z.array(z.string()).optional(),
  supplementRecommendations: z.array(z.string()).optional(),
});

export type CoachNutritionWeek = z.infer<typeof coachNutritionWeekSchema>;

export const weeklyReportSchema = z.object({
  overallRating: z.number(),
  coachMessage: z.string(),
  summary: z.string(),
  performanceHighlights: z.array(z.string()),
  areasToImprove: z.array(z.string()),
  weekOverWeekComparison: z.string().optional(),
  completionRate: z.number(),
  nextWeekStrategy: z.string(),
  nextWeekChanges: z.array(z.string()),
  recommendation: z.enum(['continue', 'reduce_volume', 'increase_volume', 'deload']),
  factsSnapshot: z.unknown().optional(),
  weekDirective: z.unknown().optional(),
});

export type WeeklyReportPayload = z.infer<typeof weeklyReportSchema>;
