/**
 * Selftest: Session-Draft Abgleich (Server leer → lokal löschen, Stale-Erkennung).
 */
import assert from 'node:assert/strict';
import type { Workout } from '../src/types';
import type { WorkoutSessionDraft } from '../src/lib/sessionDraft';
import { isSessionDraftStale } from '../src/lib/sessionDraft';

const draft: WorkoutSessionDraft = {
  workoutMeta: { name: 'Kraft-Baseline', sourceKey: 'today:2026-05-25', date: '2026-05-25' },
  exercises: [{ name: 'Bank', sets: [{ type: 'normal', reps: 5, weight: 60, completed: true }] }],
  elapsedSeconds: 1200,
  expandedKey: null,
  startedAt: '2026-05-25T10:00:00.000Z',
  savedAt: '2026-05-25T11:00:00.000Z',
};

const workouts: Workout[] = [
  {
    id: 'w1',
    userId: 'u1',
    name: 'Kraft-Baseline',
    type: 'Strength',
    date: '2026-05-25',
    duration: 45,
    caloriesBurned: 300,
    completedAt: '2026-05-25T12:00:00.000Z',
    sessionSourceKey: 'today:2026-05-25',
    exercises: [],
  },
];

assert.equal(isSessionDraftStale(draft, workouts), true);

const oldDraft: WorkoutSessionDraft = {
  ...draft,
  savedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
};
assert.equal(isSessionDraftStale(oldDraft, []), true);

console.log('session-draft-reconcile-selftest: ok');
