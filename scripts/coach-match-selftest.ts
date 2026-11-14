import assert from 'node:assert/strict';
import { matchWorkoutsToPlannedSessions } from '../src/lib/coach/plannedSessionMatcher';
import { buildPlannedSessionKey } from '../src/lib/coach/coachSessionMeta';
import {
  extractPlannedNutritionSlots,
  matchNutritionSlotsToLogs,
} from '../src/lib/coach/nutritionPlanSlots';
import type { Workout } from '../src/types';

const mondayDouble = {
  schedule: [
    {
      day: 'Monday',
      isRest: false,
      title: 'Push',
      sessionType: 'Strength',
      sessionSlot: 'Morning',
      estimatedDuration: 60,
      exercises: [{ exerciseKey: 'bench_press', name: 'Bench' }],
    },
    {
      day: 'Monday',
      isRest: false,
      title: 'Cardio',
      sessionType: 'Cardio',
      sessionSlot: 'Evening',
      estimatedDuration: 30,
    },
  ],
};

const workouts: Workout[] = [
  {
    id: 'w-cardio',
    userId: '1',
    name: 'Easy Run',
    type: 'Cardio',
    duration: 28,
    caloriesBurned: 200,
    date: '2026-05-04',
    exercises: [],
    notes: 'evening session',
  },
  {
    id: 'w-push',
    userId: '1',
    name: 'Push Day',
    type: 'Strength',
    duration: 58,
    caloriesBurned: 300,
    date: '2026-05-04',
    exercises: [{ name: 'Bench Press', exerciseKey: 'bench_press', sets: [] }],
  },
];

const rows = matchWorkoutsToPlannedSessions(mondayDouble.schedule as any, '2026-05-04', workouts);
const pushRow = rows.find((r) => r.title === 'Push');
const cardioRow = rows.find((r) => r.title === 'Cardio');
assert.ok(pushRow?.status === 'completed');
assert.ok(cardioRow?.status === 'completed');
assert.equal(pushRow?.matchedWorkoutId, 'w-push');
assert.equal(cardioRow?.matchedWorkoutId, 'w-cardio');

const pushKey = buildPlannedSessionKey('Monday', 'Push', 'Morning');
const metaMatch: Workout[] = [
  {
    id: 'w-meta',
    userId: '1',
    name: 'Anything',
    type: 'Strength',
    duration: 50,
    caloriesBurned: 200,
    date: '2026-05-04',
    exercises: [],
    coachSessionMeta: {
      planId: 'p1',
      weekNumber: 1,
      sessionKey: pushKey,
      plannedDay: 'Monday',
      sessionSlot: 'Morning',
      title: 'Push',
    },
  },
];
const metaRows = matchWorkoutsToPlannedSessions(
  [mondayDouble.schedule[0]] as any,
  '2026-05-04',
  metaMatch,
);
assert.equal(metaRows[0]?.matchedWorkoutId, 'w-meta');
assert.equal(metaRows[0]?.matchMethod, 'id');

const slots = extractPlannedNutritionSlots(
  {
    mealPlan: [
      {
        day: 'Monday',
        meals: [
          { type: 'breakfast', calories: 400 },
          { type: 'lunch', calories: 600 },
        ],
      },
    ],
  },
  {},
  '2026-05-04',
);
assert.equal(slots.length, 2);
const nutRows = matchNutritionSlotsToLogs(slots, [
  {
    id: 'n1',
    userId: '1',
    meal: 'Breakfast',
    category: 'breakfast',
    calories: 410,
    protein: 20,
    carbs: 40,
    fat: 10,
    date: '2026-05-04',
    ingredients: [],
  },
]);
assert.equal(nutRows.filter((r) => r.status === 'logged').length, 1);
assert.equal(nutRows.filter((r) => r.status === 'missed').length, 1);

console.log('coach-match-selftest: OK');
