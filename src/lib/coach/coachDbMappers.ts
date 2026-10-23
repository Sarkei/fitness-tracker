import type { Nutrition, Workout } from '@/src/types';
import { parseCoachSessionMeta, type CoachSessionMeta } from './coachSessionMeta';

export function mapWorkoutRow(row: Record<string, unknown>): Workout {
  const metaRaw = row.coach_session_meta;
  const coachSessionMeta = parseCoachSessionMeta(metaRaw) ?? undefined;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    name: String(row.name ?? ''),
    type: (row.type as Workout['type']) || 'Other',
    subtype: row.subtype as string | undefined,
    duration: Number(row.duration) || 0,
    caloriesBurned: Number(row.calories_burned) || 0,
    date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).slice(0, 10),
    exercises: (row.exercises as Workout['exercises']) || [],
    notes: String(row.notes ?? ''),
    shared: Boolean(row.shared),
    coachSessionMeta: coachSessionMeta as CoachSessionMeta | undefined,
    feedback: row.coach_session_feedback != null ? String(row.coach_session_feedback) : undefined,
  };
}

export function mapNutritionRow(row: Record<string, unknown>): Nutrition {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    meal: String(row.meal ?? ''),
    category: (row.category as Nutrition['category']) || 'snack',
    calories: Number(row.calories) || 0,
    protein: Number(row.protein) || 0,
    carbs: Number(row.carbs) || 0,
    fat: Number(row.fat) || 0,
    date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date).slice(0, 10),
    ingredients: (row.ingredients as Nutrition['ingredients']) || [],
  };
}
