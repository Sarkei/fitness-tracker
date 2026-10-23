/**
 * Selftest: workoutSessionSummary (PR-Erkennung, Volumen, Muskelanteile).
 */
import assert from 'node:assert/strict';
import type { Workout } from '../src/types';
import { computeWorkoutSessionSummary } from '../src/lib/workoutSessionSummary';

const prior: Workout[] = [
  {
    id: 'w1',
    userId: 'u1',
    name: 'Old',
    type: 'Strength',
    date: '2026-05-01',
    duration: 45,
    caloriesBurned: 250,
    exercises: [
      {
        name: 'Bankdrücken',
        sets: [
          { type: 'normal', reps: 8, weight: 80, completed: true },
          { type: 'normal', reps: 6, weight: 85, completed: true },
        ],
      },
    ],
  },
];

const current: Workout = {
  id: 'w2',
  userId: 'u1',
  name: 'Today',
  type: 'Strength',
  date: '2026-05-29',
  duration: 50,
  caloriesBurned: 320,
  exercises: [
    {
      name: 'Bankdrücken',
      sets: [
        { type: 'normal', reps: 5, weight: 90, completed: true },
        { type: 'normal', reps: 5, weight: 90, completed: true },
      ],
    },
    {
      name: 'Klimmzüge',
      exerciseKey: 'pull_up',
      sets: [{ type: 'normal', reps: 10, weight: 0, completed: true }],
    },
  ],
};

const s = computeWorkoutSessionSummary(current, prior);
assert.equal(s.totalSets, 3);
assert.equal(s.totalReps, 20);
assert.equal(s.totalVolumeKg, 900);
assert.equal(s.weightPrs.length, 1);
assert.equal(s.weightPrs[0].exerciseName, 'Bankdrücken');
assert.equal(s.weightPrs[0].previousMaxKg, 85);
assert.equal(s.weightPrs[0].newMaxKg, 90);
assert.equal(s.muscleShares.length >= 1, true);

const noPr = computeWorkoutSessionSummary(prior[0], prior);
assert.equal(noPr.weightPrs.length, 0);

console.log('workout-session-summary-selftest: ok');
