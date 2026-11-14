import type { CoachNutritionWeek } from './coachScheduleZod';
import { COACH_NUTRITION_WEEKDAYS } from './coachNutritionSchedule';

const SLOT_CAL_SHARE: Record<string, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.05,
};

function macrosToCalories(protein?: number, carbs?: number, fat?: number): number {
  const p = Number(protein) || 0;
  const c = Number(carbs) || 0;
  const f = Number(fat) || 0;
  if (p + c + f <= 0) return 0;
  return Math.round(p * 4 + c * 4 + f * 9);
}

function enrichMealCalories(
  meal: Record<string, unknown>,
  fallbackCalories: number,
): Record<string, unknown> {
  let calories = Number(meal.calories) || 0;
  if (calories <= 0) {
    calories = macrosToCalories(
      Number(meal.protein),
      Number(meal.carbs),
      Number(meal.fat),
    );
  }
  if (calories <= 0 && fallbackCalories > 0) calories = fallbackCalories;
  return { ...meal, calories: calories > 0 ? calories : undefined };
}

/** Stellt sicher, dass jede Mahlzeit `calories` hat (für Slot-Adherence). */
export function finalizeCoachNutritionWeek(week: CoachNutritionWeek): CoachNutritionWeek {
  const dayTarget = Number(week.dailyTargets?.calories) || 2400;
  const ac = [...(week.applied_constraints || [])];

  const mealPlan = (week.mealPlan ?? []).map((dayRow) => {
    const day = String(dayRow.day ?? '').trim();
    const meals = Array.isArray(dayRow.meals) ? [...dayRow.meals] : [];
    const dayTotal = Number(dayRow.totalCalories) || dayTarget;

    const enriched = meals.map((m) => {
      const type = String(m.type ?? 'lunch').toLowerCase();
      const share = SLOT_CAL_SHARE[type] ?? 0.2;
      const fallback = Math.round(dayTotal * share);
      return enrichMealCalories(m as Record<string, unknown>, fallback);
    });

    const sumCals = enriched.reduce((s, m) => s + (Number(m.calories) || 0), 0);
    const stillMissing = enriched.some((m) => !Number(m.calories));
    if (stillMissing && enriched.length > 0) {
      const per = Math.round(dayTotal / enriched.length);
      for (let i = 0; i < enriched.length; i++) {
        if (!Number(enriched[i].calories)) enriched[i] = { ...enriched[i], calories: per };
      }
    }

    return {
      ...dayRow,
      day,
      totalCalories: sumCals > 0 ? sumCals : dayTotal,
      meals: enriched,
    };
  });

  const byDay = new Map(mealPlan.map((d) => [String(d.day), d]));
  const fullPlan = COACH_NUTRITION_WEEKDAYS.map(
    (day) => byDay.get(day) ?? { day, meals: [], totalCalories: dayTarget },
  );

  if (!ac.includes('repaired:meal_calories')) ac.push('repaired:meal_calories');

  return {
    ...week,
    mealPlan: fullPlan,
    applied_constraints: ac.slice(0, 8),
  };
}
