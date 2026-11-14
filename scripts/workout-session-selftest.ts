/**
 * Schnelltest: Session-Utils & Statistik-Filter
 * Ausführen: npx tsx scripts/workout-session-selftest.ts
 */

import assert from 'node:assert/strict';
import {
  buildSessionDisplayItems,
  cycleSetType,
  sanitizeExercisesForSave,
} from '../src/lib/workoutSessionUtils.ts';
import { strengthSetsForStats, strengthVolumeFromSets } from '../src/lib/workoutSetStats.ts';
import { dayTrainingVolume, computeVolumeByMuscle } from '../src/lib/workoutAnalytics.ts';
import {
  coachRowHasExercises,
  resolveCoachScheduleDayList,
} from '../src/lib/coachTemplateMappers.ts';
import {
  coachSessionExpandKey,
  coachSessionKind,
} from '../src/lib/coachScheduleGrouping.ts';
import type { Exercise, Workout } from '../src/types.ts';

const exA: Exercise = {
  id: 'a',
  name: 'Bench',
  sets: [
    { reps: 10, weight: 60, completed: true, type: 'warmup' },
    { reps: 5, weight: 100, completed: true, type: 'normal' },
    { reps: 5, weight: 100, completed: false, type: 'normal' },
  ],
};

const exB: Exercise = {
  id: 'b',
  name: 'Row',
  supersetGroup: 'A',
  sets: [{ reps: 10, weight: 50, completed: true, type: 'normal' }],
};

const exC: Exercise = {
  id: 'c',
  name: 'Fly',
  supersetGroup: 'A',
  sets: [{ reps: 12, weight: 15, completed: true, type: 'normal' }],
};

assert.equal(cycleSetType('normal'), 'warmup');
assert.equal(cycleSetType('failure'), 'normal');

const items = buildSessionDisplayItems([exA, exB, exC]);
assert.equal(items.length, 2);
assert.equal(items[0].kind, 'single');
assert.equal(items[1].kind, 'superset');

const saved = sanitizeExercisesForSave([exA, exB]);
assert.equal((saved[0].sets as unknown[]).length, 2);

const statsSets = strengthSetsForStats(exA);
assert.equal(statsSets.length, 1);
assert.equal(strengthVolumeFromSets(statsSets), 500);

const w: Workout = {
  id: 'w1',
  userId: 'u',
  name: 'Test',
  type: 'Strength',
  duration: 45,
  caloriesBurned: 200,
  date: '2026-05-19',
  exercises: [exA],
};
assert.equal(dayTrainingVolume([w], '2026-05-19'), 500);
assert.ok(computeVolumeByMuscle([w]).length >= 1);

const block: Exercise = {
  id: 'blk',
  name: 'Zirkel',
  blockFormat: 'circuit',
  structureRounds: 3,
  sets: [{ reps: 1, weight: 0, completed: false, type: 'normal' }],
};
const child: Exercise = {
  id: 'c1',
  name: 'Squat',
  structureParentId: 'blk',
  sets: [{ reps: 10, weight: 50, completed: false, type: 'normal' }],
};
const circuitItems = buildSessionDisplayItems([block, child]);
assert.equal(circuitItems.length, 1);
assert.equal(circuitItems[0].kind, 'circuit');

const nested = resolveCoachScheduleDayList({
  schedule: { schedule: [{ day: 'Monday', title: 'Push', exercises: [{ name: 'Bench' }] }] },
});
assert.equal(nested.length, 1);
assert.equal(nested[0].day, 'Monday');
assert.equal(coachRowHasExercises(nested[0] as Record<string, unknown>), true);
assert.equal(coachRowHasExercises({ exercises: 'not-an-array' } as Record<string, unknown>), false);

assert.equal(coachSessionKind({ sessionType: 'Strength' }), 'strength');
assert.equal(coachSessionKind({ sessionType: 'Cardio' }), 'cardio');
assert.equal(coachSessionKind({ sessionType: 'Hybrid' }), 'hybrid');
const key = coachSessionExpandKey('Monday', { sessionSlot: 'Morning' }, 0);
assert.equal(key, 'Monday::Morning::0');

console.log('workout-session-selftest: OK');
