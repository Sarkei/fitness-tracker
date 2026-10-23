import type { MealCategory, Nutrition } from '@/src/types';
import { buildCoachWeekDateMap } from '../coachWeekDisplay';
import { COACH_MEAL_SLOT_TYPES, resolveNutritionMealSchedule } from '../coachNutritionSchedule';
import type { NutritionSlotAdherenceRow } from './coachTypes';

export interface PlannedNutritionSlot {
  day: string;
  date: string;
  slot: MealCategory;
  title?: string;
  targetCalories?: number;
}

function normalizeMealType(raw: unknown): MealCategory | null {
  const t = String(raw ?? '').toLowerCase();
  return COACH_MEAL_SLOT_TYPES.includes(t as MealCategory) ? (t as MealCategory) : null;
}

/** Slots from AI-generated `mealPlan` (primary) or onboarding fallback. */
export function extractPlannedNutritionSlots(
  scheduleEnvelope: Record<string, unknown>,
  onboarding: Record<string, unknown>,
  startYmd: string,
): PlannedNutritionSlot[] {
  const mealPlan = scheduleEnvelope.mealPlan;
  const dateMap = buildCoachWeekDateMap(startYmd);
  const slots: PlannedNutritionSlot[] = [];

  if (Array.isArray(mealPlan) && mealPlan.length > 0) {
    for (const dayRow of mealPlan) {
      if (!dayRow || typeof dayRow !== 'object') continue;
      const day = String((dayRow as { day?: unknown }).day ?? '').trim();
      const date = dateMap[day] ?? '';
      const meals = (dayRow as { meals?: unknown }).meals;
      if (!Array.isArray(meals)) continue;
      for (const m of meals) {
        if (!m || typeof m !== 'object') continue;
        const slot = normalizeMealType((m as { type?: unknown }).type);
        if (!slot) continue;
        const calories = Number((m as { calories?: unknown }).calories);
        slots.push({
          day,
          date,
          slot,
          title: String((m as { title?: unknown }).title ?? '').trim() || undefined,
          targetCalories: Number.isFinite(calories) && calories > 0 ? calories : undefined,
        });
      }
    }
    if (slots.length > 0) return slots;
  }

  const fallback = resolveNutritionMealSchedule(onboarding);
  for (const dayPlan of fallback) {
    const date = dateMap[dayPlan.day] ?? '';
    for (const meal of dayPlan.meals) {
      slots.push({ day: dayPlan.day, date, slot: meal.type });
    }
  }
  return slots;
}

export function matchNutritionSlotsToLogs(
  slots: PlannedNutritionSlot[],
  entries: Nutrition[],
): NutritionSlotAdherenceRow[] {
  const byDateCat = new Map<string, Nutrition[]>();
  for (const e of entries) {
    const d = String(e.date).slice(0, 10);
    const k = `${d}:${e.category}`;
    const list = byDateCat.get(k) ?? [];
    list.push(e);
    byDateCat.set(k, list);
  }

  return slots.map((slot) => {
    const hits = byDateCat.get(`${slot.date}:${slot.slot}`) ?? [];
    if (hits.length === 0) {
      return { day: slot.day, date: slot.date, slot: slot.slot, status: 'missed' as const };
    }
    const cals = hits.reduce((s, h) => s + h.calories, 0);
    const avgCals = Math.round(cals / hits.length);
    if (slot.targetCalories && slot.targetCalories > 0) {
      const ratio = avgCals / slot.targetCalories;
      if (ratio < 0.75 || ratio > 1.25) {
        return {
          day: slot.day,
          date: slot.date,
          slot: slot.slot,
          status: 'partial' as const,
          calories: avgCals,
          targetCalories: slot.targetCalories,
        };
      }
    }
    return {
      day: slot.day,
      date: slot.date,
      slot: slot.slot,
      status: 'logged' as const,
      calories: avgCals,
      targetCalories: slot.targetCalories,
    };
  });
}
