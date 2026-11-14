import assert from 'node:assert/strict';
import { finalizeCoachNutritionWeek } from '../src/lib/coachNutritionPostprocess';

const week = finalizeCoachNutritionWeek({
  weekFocus: 'Test',
  coachNotes: 'Notes',
  assumptions: [],
  applied_constraints: [],
  dailyTargets: { calories: 2000, protein: 150, carbs: 200, fat: 65 },
  mealPlan: [
    {
      day: 'Monday',
      meals: [{ type: 'breakfast', title: 'Oats' }, { type: 'lunch', title: 'Bowl' }],
    },
  ],
});

const mon = week.mealPlan.find((d) => d.day === 'Monday');
assert.ok(mon?.meals?.every((m) => Number(m.calories) > 0));
assert.ok(week.applied_constraints?.includes('repaired:meal_calories'));

console.log('coach-nutrition-postprocess-selftest: OK');
