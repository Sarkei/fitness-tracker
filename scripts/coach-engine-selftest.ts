import assert from 'node:assert/strict';
import { buildAthleteWeekSnapshot } from '../src/lib/coach/athleteWeekSnapshot';
import { computeWeekDirective, advancePlanStateAfterWeek } from '../src/lib/coach/periodizationEngine';
import { DEFAULT_COACH_PLAN_STATE } from '../src/lib/coach/coachPlanState';
import { matchWorkoutsToPlannedSessions } from '../src/lib/coach/plannedSessionMatcher';
import type { Workout } from '../src/types';

const schedule = {
  schedule: [
    { day: 'Monday', isRest: false, title: 'Push', sessionType: 'Strength', estimatedDuration: 60 },
    { day: 'Wednesday', isRest: false, title: 'Pull', sessionType: 'Strength', estimatedDuration: 60 },
    { day: 'Friday', isRest: true },
  ],
};

const workouts: Workout[] = [
  {
    id: 'w1',
    userId: '1',
    name: 'Push Day',
    type: 'Strength',
    duration: 55,
    caloriesBurned: 300,
    date: '2026-05-04',
    exercises: [
      {
        name: 'Bench',
        sets: [{ reps: 5, weight: 80, completed: true, type: 'normal' }],
      },
    ],
  },
];

const rows = matchWorkoutsToPlannedSessions(schedule.schedule as any, '2026-05-04', workouts);
assert.equal(rows.filter((r) => r.status === 'completed').length, 1);
assert.equal(rows.filter((r) => r.status === 'missed').length, 1);

const snap = buildAthleteWeekSnapshot({
  planType: 'workout',
  weekNumber: 1,
  startYmd: '2026-05-04',
  scheduleEnvelope: schedule,
  workouts,
  nutrition: [],
  profile: { goals: { dailyCalories: 2500 } } as any,
  prevWeekVolumeKg: null,
});
assert.equal(snap.adherence.plannedUnits, 2);
assert.equal(snap.adherence.completedUnits, 1);
assert.equal(snap.adherence.completionRate, 50);
assert.ok(snap.training && snap.training.totalVolumeKg > 0);

const directive = computeWeekDirective({
  snapshot: snap,
  planState: DEFAULT_COACH_PLAN_STATE,
});
assert.ok(['continue', 'reduce_volume', 'increase_volume', 'deload'].includes(directive.recommendation));
assert.equal(directive.completionRate, 50);

const nextState = advancePlanStateAfterWeek(DEFAULT_COACH_PLAN_STATE, directive, 1);
assert.ok(nextState.weekInBlock >= 1);

console.log('coach-v2-selftest: OK');
