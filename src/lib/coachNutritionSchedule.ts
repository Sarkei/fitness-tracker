import type { MealCategory } from '../types';

export const COACH_NUTRITION_WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const;

export type CoachNutritionWeekday = (typeof COACH_NUTRITION_WEEKDAYS)[number];

export const COACH_MEAL_SLOT_TYPES: MealCategory[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface NutritionMealSlotConfig {
  type: MealCategory;
  /** Für wie viele Personen an diesem Slot gekocht wird. */
  servings: number;
}

export interface NutritionDayMealPlan {
  day: CoachNutritionWeekday | string;
  meals: NutritionMealSlotConfig[];
}

export type MealSlotsByDay = Record<string, NutritionMealSlotConfig[]>;

export function emptyMealSlotsByDay(): MealSlotsByDay {
  const out: MealSlotsByDay = {};
  for (const d of COACH_NUTRITION_WEEKDAYS) out[d] = [];
  return out;
}

export function normalizeNutritionMealSchedule(raw: unknown): NutritionDayMealPlan[] {
  if (!Array.isArray(raw)) return [];
  const out: NutritionDayMealPlan[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const day = String((row as { day?: unknown }).day || '').trim();
    if (!COACH_NUTRITION_WEEKDAYS.includes(day as CoachNutritionWeekday)) continue;
    const mealsIn = (row as { meals?: unknown }).meals;
    if (!Array.isArray(mealsIn)) continue;
    const meals: NutritionMealSlotConfig[] = [];
    for (const m of mealsIn) {
      if (!m || typeof m !== 'object') continue;
      const typeRaw = String((m as { type?: unknown }).type || '').toLowerCase();
      const type = COACH_MEAL_SLOT_TYPES.includes(typeRaw as MealCategory)
        ? (typeRaw as MealCategory)
        : null;
      if (!type) continue;
      const servings = Math.max(1, Math.min(12, Math.round(Number((m as { servings?: unknown }).servings) || 1)));
      meals.push({ type, servings });
    }
    if (meals.length > 0) out.push({ day, meals });
  }
  return out;
}

/** Legacy-Pläne: 3 Mahlzeiten/Tag auf allen Wochentagen. */
export function legacyMealScheduleFromMealsPerDay(mealsPerDay: number): NutritionDayMealPlan[] {
  const n = Math.max(2, Math.min(5, Math.round(mealsPerDay) || 3));
  const types: MealCategory[] =
    n <= 2
      ? ['breakfast', 'dinner']
      : n === 3
        ? ['breakfast', 'lunch', 'dinner']
        : n === 4
          ? ['breakfast', 'lunch', 'dinner', 'snack']
          : ['breakfast', 'lunch', 'snack', 'dinner', 'snack'];
  return COACH_NUTRITION_WEEKDAYS.map(day => ({
    day,
    meals: types.slice(0, n).map(type => ({ type, servings: 1 })),
  }));
}

export function resolveNutritionMealSchedule(ob: Record<string, unknown>): NutritionDayMealPlan[] {
  const normalized = normalizeNutritionMealSchedule(ob.mealSchedule);
  if (normalized.length > 0) return normalized;
  const mpd = Number(ob.mealsPerDay);
  if (Number.isFinite(mpd) && mpd >= 2) return legacyMealScheduleFromMealsPerDay(mpd);
  return legacyMealScheduleFromMealsPerDay(3);
}

export function mealScheduleSlotKey(day: string, type: string): string {
  return `${day}::${type}`;
}

export function formatMealScheduleForCoachPrompt(schedule: NutritionDayMealPlan[]): string {
  if (!schedule.length) return 'No meal slots configured.';
  return schedule
    .map(
      d =>
        `- ${d.day}: ${d.meals.map(m => `${m.type} (${m.servings} ${m.servings === 1 ? 'person' : 'persons'})`).join(', ')}`,
    )
    .join('\n');
}

export function totalMealSlots(schedule: NutritionDayMealPlan[]): number {
  return schedule.reduce((s, d) => s + d.meals.length, 0);
}
