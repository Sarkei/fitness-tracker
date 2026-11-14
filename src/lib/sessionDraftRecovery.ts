/**
 * Wiederherstellung von Trainings, die in der Session abgeschlossen wurden,
 * aber nicht im Verlauf gelandet sind (z. B. fehlgeschlagenes Speichern nach clearSessionDraft).
 */

import { format } from 'date-fns';
import type { Exercise, Workout } from '@/src/types';
import { buildPlannedSessionKey } from '@/src/lib/coach/coachSessionMeta';
import { coachSessionToWorkoutType } from '@/src/lib/coachTemplateMappers';
import { estimateWorkoutCalories } from '@/src/lib/workoutAnalytics';
import { api } from '@/src/lib/api';
import {
  type WorkoutSessionDraft,
  loadSessionDraftLocal,
  saveSessionDraftLocal,
  clearSessionDraft,
  draftMatchesCompletedWorkout,
  isSessionDraftAged,
  countDraftCompletedSets,
  RECOVERABLE_DRAFT_MAX_AGE_MS,
} from '@/src/lib/sessionDraft';
import { sanitizeExercisesForSave } from '@/src/lib/workoutSessionUtils';

export type RecoverableSessionDraft = {
  draft: WorkoutSessionDraft;
  exercises: Exercise[];
  durationMinutes: number;
  dayKey: string;
  label: string;
  completedSetCount: number;
  isCoachSource: boolean;
};

function draftHasMatchingCompletedWorkout(draft: WorkoutSessionDraft, workouts: Workout[]): boolean {
  return workouts.some(w => draftMatchesCompletedWorkout(draft, w));
}

function isRecoverableDraftAge(draft: WorkoutSessionDraft): boolean {
  const savedMs = new Date(draft.savedAt).getTime();
  return Number.isFinite(savedMs) && Date.now() - savedMs <= RECOVERABLE_DRAFT_MAX_AGE_MS;
}

function draftDayKey(draft: WorkoutSessionDraft): string {
  const anchor = draft.workoutMeta.date ?? draft.startedAt ?? draft.savedAt;
  try {
    return format(new Date(anchor), 'yyyy-MM-dd');
  } catch {
    return format(new Date(), 'yyyy-MM-dd');
  }
}

function normalizeWorkoutType(raw?: string): Workout['type'] {
  const t = String(raw || '').trim();
  if (t === 'Strength' || t === 'Cardio' || t === 'Hybrid' || t === 'Other') return t;
  return coachSessionToWorkoutType(t);
}

function coachMetaFromDraft(
  draft: WorkoutSessionDraft,
  coachPlanId?: string,
): Workout['coachSessionMeta'] | undefined {
  const sourceKey = draft.workoutMeta.sourceKey;
  if (!sourceKey?.startsWith('coach:') || !coachPlanId) return undefined;
  const rest = sourceKey.slice('coach:'.length);
  const parts = rest.split('::');
  const plannedDay = parts[0] || '';
  const sessionSlot = parts[1] && parts[1] !== 'slot' ? parts[1] : undefined;
  const title = draft.workoutMeta.name?.trim() || 'Coach Session';
  if (!plannedDay) return undefined;
  return {
    planId: coachPlanId,
    weekNumber: 1,
    sessionKey: buildPlannedSessionKey(plannedDay, title, sessionSlot),
    plannedDay,
    sessionSlot,
    title,
  };
}

/**
 * Entwurf mit abgeschlossenen Sätzen, der nicht mehr live resumable ist
 * (älter als 24h) und zu dem kein Workout im Verlauf existiert.
 */
export function assessRecoverableSessionDraft(
  draft: WorkoutSessionDraft | null | undefined,
  workouts: Workout[],
): RecoverableSessionDraft | null {
  if (!draft?.exercises?.length) return null;

  const exercises = sanitizeExercisesForSave(draft.exercises);
  if (exercises.length === 0) return null;

  if (!isRecoverableDraftAge(draft)) return null;
  // Live-Resume-Fenster: nicht parallel Recover-CTA zeigen
  if (!isSessionDraftAged(draft)) return null;
  if (draftHasMatchingCompletedWorkout(draft, workouts)) return null;

  const completedSetCount = countDraftCompletedSets(draft);
  if (completedSetCount < 1) return null;

  const durationMinutes = Math.max(1, Math.floor((draft.elapsedSeconds || 0) / 60));

  return {
    draft,
    exercises,
    durationMinutes,
    dayKey: draftDayKey(draft),
    label: draft.workoutMeta.name?.trim() || 'Workout',
    completedSetCount,
    isCoachSource: Boolean(draft.workoutMeta.sourceKey?.startsWith('coach:')),
  };
}

export function buildWorkoutFromRecoverableDraft(
  recovery: RecoverableSessionDraft,
  userId: string,
  opts?: { coachPlanId?: string; weekNumber?: number },
): Omit<Workout, 'id'> {
  const { draft, exercises, durationMinutes, dayKey, label } = recovery;
  const completedAt = draft.savedAt || new Date().toISOString();
  let coachSessionMeta = coachMetaFromDraft(draft, opts?.coachPlanId);
  if (coachSessionMeta && opts?.weekNumber != null) {
    coachSessionMeta = { ...coachSessionMeta, weekNumber: opts.weekNumber };
  }

  const partial: Partial<Workout> = {
    name: label,
    type: normalizeWorkoutType(draft.workoutMeta.type),
    date: dayKey,
    duration: durationMinutes,
    exercises,
    userId,
    completedAt,
    sessionSourceKey: draft.workoutMeta.sourceKey,
    sessionInstanceId: draft.sessionInstanceId,
    caloriesBurned: estimateWorkoutCalories({
      exercises,
      duration: durationMinutes,
      type: normalizeWorkoutType(draft.workoutMeta.type),
    }),
    ...(coachSessionMeta ? { coachSessionMeta } : {}),
    notes: coachSessionMeta
      ? `AI Coach – wiederhergestellt (${format(new Date(completedAt), 'dd.MM.yyyy HH:mm')})`
      : `Wiederhergestellt (${format(new Date(completedAt), 'dd.MM.yyyy HH:mm')})`,
  };

  return partial as Omit<Workout, 'id'>;
}

/** Lokal, sonst Server-Entwurf in localStorage spiegeln. */
export async function findRecoverableSessionDraft(
  workouts: Workout[],
): Promise<RecoverableSessionDraft | null> {
  const local = assessRecoverableSessionDraft(loadSessionDraftLocal(), workouts);
  if (local) return local;

  try {
    const server = await api<WorkoutSessionDraft | null>('/api/workout-session-draft');
    if (!server?.exercises?.length) return null;
    const assessed = assessRecoverableSessionDraft(server, workouts);
    if (assessed) saveSessionDraftLocal(server);
    return assessed;
  } catch {
    return null;
  }
}

export async function recoverSessionDraftToWorkout(
  recovery: RecoverableSessionDraft,
  userId: string,
  addWorkout: (workout: Omit<Workout, 'id'>) => Promise<string>,
  opts?: { coachPlanId?: string; weekNumber?: number },
): Promise<string> {
  const payload = buildWorkoutFromRecoverableDraft(recovery, userId, opts);
  const id = await addWorkout(payload);
  clearSessionDraft();
  return id;
}
