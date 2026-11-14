/**
 * Selftest: Session-Draft-Wiederherstellung
 * Run: npx tsx scripts/session-draft-recovery-selftest.ts
 */

import assert from 'node:assert/strict';
import {
  assessRecoverableSessionDraft,
  buildWorkoutFromRecoverableDraft,
} from '../src/lib/sessionDraftRecovery';
import type { Workout } from '../src/types';
import type { WorkoutSessionDraft } from '../src/lib/sessionDraft';

const draft: WorkoutSessionDraft = {
  workoutMeta: {
    name: 'Kraft-Baseline',
    type: 'Strength',
    sourceKey: 'coach:Monday::morning::0',
    date: '2026-05-28T10:00:00.000Z',
    userId: 'u1',
  },
  exercises: [
    {
      name: 'Kniebeuge',
      sets: [
        { reps: 8, weight: 80, completed: true, type: 'normal' },
        { reps: 8, weight: 80, completed: true, type: 'normal' },
      ],
    },
  ],
  elapsedSeconds: 2700,
  expandedKey: null,
  startedAt: '2026-05-28T10:00:00.000Z',
  savedAt: '2026-05-28T10:45:00.000Z',
};

const emptyDraft: WorkoutSessionDraft = {
  ...draft,
  exercises: [{ name: 'X', sets: [{ reps: 5, weight: 0, completed: false, type: 'normal' }] }],
};
assert.equal(assessRecoverableSessionDraft(emptyDraft, []), null, 'no completed sets');

const recentDraft: WorkoutSessionDraft = {
  ...draft,
  savedAt: new Date().toISOString(),
  startedAt: new Date().toISOString(),
};

const noMatch = assessRecoverableSessionDraft(recentDraft, []);
assert.ok(noMatch, 'recoverable when no matching workout');
assert.equal(noMatch!.label, 'Kraft-Baseline');

const startedIso = recentDraft.startedAt!;
const existing: Workout[] = [
  {
    id: 'w1',
    userId: 'u1',
    name: 'Kraft-Baseline',
    type: 'Strength',
    duration: 45,
    caloriesBurned: 300,
    date: recentDraft.workoutMeta.date!.split('T')[0],
    exercises: [],
    completedAt: startedIso,
    sessionSourceKey: 'coach:Monday::morning::0',
  },
];

assert.equal(assessRecoverableSessionDraft(recentDraft, existing), null, 'not recoverable when match exists');

const payload = buildWorkoutFromRecoverableDraft(noMatch!, 'u1', {
  coachPlanId: 'plan-1',
  weekNumber: 2,
});
assert.equal(payload.coachSessionMeta?.planId, 'plan-1');
assert.equal(payload.coachSessionMeta?.weekNumber, 2);
assert.ok(payload.exercises.length >= 1);
assert.ok(payload.completedAt);

console.log('session-draft-recovery-selftest: ok');
