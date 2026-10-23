/**
 * Workout-Session-Entwurf: localStorage + Server (profile_extras).
 */

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import type { Exercise, Workout } from '@/src/types';

import { api } from '@/src/lib/api';
import { coachSessionExpandKey } from '@/src/lib/coachScheduleGrouping';

/** Live-Resume / Bar: danach als „veraltet“ (Dismiss / Recover). */
export const STALE_DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Entwürfe mit absolvierten Sätzen bleiben bis dahin für Recovery erhalten. */
export const RECOVERABLE_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const DRAFT_KEY = 'vrtx_workout_session_draft';

/** Sync mit ActiveWorkoutSessionContext / ActiveWorkoutBar */
export const ACTIVE_SESSION_STORAGE_KEY = 'vrtx_active_workout_session';

export const SESSION_DRAFT_CHANGED_EVENT = 'vrtx-session-draft-changed';

export interface WorkoutSessionDraft {
  workoutMeta: {
    name?: string;
    type?: string;
    id?: string;
    userId?: string;
    /** Zuordnung zu This-Week-Chip / Today-CTA */
    sourceKey?: string;
    /** Geplantes / gestartetes Trainingsdatum (ISO) */
    date?: string;
  };
  /** Eindeutig pro gestarteter Session – verhindert Timer-/Draft-Übernahme nach Abbruch. */
  sessionInstanceId?: string;
  exercises: Exercise[];
  elapsedSeconds: number;
  expandedKey: string | null;
  /** Wall-clock Start der Session (ISO) */
  startedAt?: string;
  savedAt: string;
  /** Rest-Timer Ende (ISO) — Wall-Clock, damit Background-Zeit zählt */
  restEndsAt?: string | null;
  restingExerciseIdx?: number | null;
  restingSetIdx?: number;
}

export function createSessionInstanceId(): string {
  return `ws-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function todayWorkoutSourceKey(date = new Date()): string {
  return `today:${format(date, 'yyyy-MM-dd')}`;
}

export function buildCoachSessionSourceKey(
  day: string,
  session: Record<string, unknown>,
  index: number,
): string {
  return `coach:${coachSessionExpandKey(day, session, index)}`;
}

export function buildTemplateSourceKey(templateId: string): string {
  return `template:${templateId}`;
}

export function draftMatchesSourceKey(
  draft: WorkoutSessionDraft | null | undefined,
  sourceKey: string,
): boolean {
  return Boolean(draft?.exercises?.length && draft.workoutMeta?.sourceKey === sourceKey);
}

export function hasResumableSessionDraft(draft: WorkoutSessionDraft | null | undefined): boolean {
  return Boolean(draft?.exercises?.length);
}

function notifySessionDraftChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_DRAFT_CHANGED_EVENT));
}

/** Reaktiver Draft für This-Week (Start vs. Resume). */
export function useSessionDraft(): WorkoutSessionDraft | null {
  const [draft, setDraft] = useState<WorkoutSessionDraft | null>(() => loadSessionDraftLocal());

  useEffect(() => {
    const refresh = () => setDraft(loadSessionDraftLocal());
    window.addEventListener(SESSION_DRAFT_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(SESSION_DRAFT_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  return draft;
}

export interface ActiveSessionMeta {
  workoutId?: string;
  workoutName?: string;
  startedAt: string; // ISO timestamp
}

export function saveSessionDraftLocal(draft: WorkoutSessionDraft): void {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* quota */
  }
}

export function loadSessionDraftLocal(): WorkoutSessionDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as WorkoutSessionDraft;
    if (!p?.exercises || !Array.isArray(p.exercises)) return null;
    return p;
  } catch {
    return null;
  }
}

export function clearSessionDraftLocal(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

function syncActiveSessionMetaFromDraft(draft: WorkoutSessionDraft): void {
  try {
    localStorage.setItem(
      ACTIVE_SESSION_STORAGE_KEY,
      JSON.stringify({
        workoutId: draft.workoutMeta.id,
        workoutName: draft.workoutMeta.name,
        startedAt: draft.startedAt ?? draft.savedAt,
        elapsedSeconds: draft.elapsedSeconds ?? 0,
        lastSavedAt: draft.savedAt,
      }),
    );
  } catch {
    /* quota */
  }
}

export function workoutFromSessionDraft(draft: WorkoutSessionDraft): Partial<Workout> {
  return {
    id: draft.workoutMeta.id,
    name: draft.workoutMeta.name,
    type: draft.workoutMeta.type as Workout['type'] | undefined,
    userId: draft.workoutMeta.userId,
    exercises: draft.exercises,
    sessionInstanceId: draft.sessionInstanceId,
    sessionSourceKey: draft.workoutMeta.sourceKey,
    date: draft.workoutMeta.date,
  };
}

export function buildSessionDraftFromWorkout(
  workout: Partial<Workout>,
  opts?: {
    elapsedSeconds?: number;
    expandedKey?: string | null;
    startedAt?: string;
    restEndsAt?: string | null;
    restingExerciseIdx?: number | null;
    restingSetIdx?: number;
  },
): WorkoutSessionDraft {
  const now = new Date().toISOString();
  return {
    workoutMeta: {
      name: workout.name,
      type: workout.type,
      id: workout.id,
      userId: workout.userId,
      sourceKey: workout.sessionSourceKey,
      date: workout.date,
    },
    sessionInstanceId: workout.sessionInstanceId,
    exercises: workout.exercises ?? [],
    elapsedSeconds: opts?.elapsedSeconds ?? 0,
    expandedKey: opts?.expandedKey ?? null,
    startedAt: opts?.startedAt ?? now,
    savedAt: now,
    restEndsAt: opts?.restEndsAt ?? null,
    restingExerciseIdx: opts?.restingExerciseIdx ?? null,
    restingSetIdx: opts?.restingSetIdx,
  };
}

/** Sofort beim Session-Start – damit Navigation den Entwurf nicht verliert. */
export function persistInitialSessionDraft(workout: Partial<Workout>): void {
  const draft = buildSessionDraftFromWorkout(workout);
  saveSessionDraft(draft);
  void pushSessionDraftToServer(draft);
}

/** Lokal + Server (debounced extern) + globale Session-Leiste. */
export function saveSessionDraft(draft: WorkoutSessionDraft): void {
  saveSessionDraftLocal(draft);
  syncActiveSessionMetaFromDraft(draft);
  notifySessionDraftChanged();
}

export function loadSessionDraft(): WorkoutSessionDraft | null {
  return loadSessionDraftLocal();
}

export function clearSessionDraft(): void {
  clearSessionDraftLocal();
  try {
    localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  notifySessionDraftChanged();
  void api('/api/workout-session-draft', { method: 'DELETE' }).catch(() => {});
}

export function countDraftCompletedSets(draft: WorkoutSessionDraft): number {
  let n = 0;
  for (const ex of draft.exercises ?? []) {
    const sets = ex.sets;
    if (!Array.isArray(sets)) continue;
    for (const s of sets) {
      if (s && typeof s === 'object' && 'completed' in s && (s as { completed?: boolean }).completed) {
        n += 1;
      }
    }
  }
  return n;
}

/** >24h: Live-Bar aus, Stale-/Recover-UI möglich. */
export function isSessionDraftAged(draft: WorkoutSessionDraft): boolean {
  const savedMs = new Date(draft.savedAt).getTime();
  return Number.isFinite(savedMs) && Date.now() - savedMs > STALE_DRAFT_MAX_AGE_MS;
}

function isSessionDraftPastRetention(draft: WorkoutSessionDraft): boolean {
  const savedMs = new Date(draft.savedAt).getTime();
  if (!Number.isFinite(savedMs)) return false;
  const hasSets = countDraftCompletedSets(draft) >= 1;
  const maxAge = hasSets ? RECOVERABLE_DRAFT_MAX_AGE_MS : STALE_DRAFT_MAX_AGE_MS;
  return Date.now() - savedMs > maxAge;
}

/** Abgeschlossenes Workout zum Entwurf — nur sourceKey / sessionInstanceId (kein Name). */
export function draftMatchesCompletedWorkout(
  draft: WorkoutSessionDraft,
  workout: Workout,
): boolean {
  if (!workout.completedAt) return false;
  const startedMs = new Date(draft.startedAt ?? draft.savedAt).getTime();
  if (!Number.isFinite(startedMs)) return false;
  const completedMs = new Date(workout.completedAt).getTime();
  if (!Number.isFinite(completedMs) || completedMs < startedMs) return false;

  if (
    draft.sessionInstanceId &&
    workout.sessionInstanceId &&
    draft.sessionInstanceId === workout.sessionInstanceId
  ) {
    return true;
  }

  const sourceKey = draft.workoutMeta.sourceKey;
  if (sourceKey && workout.sessionSourceKey === sourceKey) return true;

  return false;
}

/** Entwurf ist veraltet (Retention überschritten oder passendes Workout abgeschlossen). */
export function isSessionDraftStale(draft: WorkoutSessionDraft, workouts: Workout[] = []): boolean {
  if (isSessionDraftPastRetention(draft)) return true;

  for (const w of workouts) {
    if (draftMatchesCompletedWorkout(draft, w)) return true;
  }

  return false;
}

/**
 * Gleicht lokalen + Server-Entwurf ab (nach Workout-Abschluss auf anderem Gerät).
 * Entfernt „Leichen“ auf Desktop/Mobile.
 */
export async function reconcileSessionDraft(workouts: Workout[] = []): Promise<void> {
  const local = loadSessionDraftLocal();

  if (local && isSessionDraftStale(local, workouts)) {
    clearSessionDraft();
    return;
  }

  try {
    const server = await api<WorkoutSessionDraft | null>('/api/workout-session-draft');

    if (!server?.exercises?.length) {
      // Leerer Server ≠ Discard: Offline / fehlgeschlagener Push darf Local nicht löschen.
      // Remote-Abschluss wird über isSessionDraftStale (completed workouts) erkannt.
      return;
    }

    if (isSessionDraftStale(server, workouts)) {
      clearSessionDraft();
      return;
    }

    const serverNewer =
      !local || new Date(server.savedAt).getTime() > new Date(local.savedAt).getTime();
    if (serverNewer) {
      saveSessionDraft(server);
    }
  } catch {
    if (local && isSessionDraftStale(local, workouts)) {
      clearSessionDraft();
    }
  }
}

export async function fetchSessionDraftFromServer(
  workouts: Workout[] = [],
): Promise<WorkoutSessionDraft | null> {
  await reconcileSessionDraft(workouts);
  return loadSessionDraftLocal();
}

export async function pushSessionDraftToServer(draft: WorkoutSessionDraft): Promise<void> {
  try {
    await api('/api/workout-session-draft', {
      method: 'PUT',
      body: JSON.stringify(draft),
    });
  } catch {
    /* offline */
  }
}

/**
 * Speichert aktive Session-Meta sofort auf dem Server.
 * Wird beim Start eines Workouts aufgerufen für schnelle Persistierung.
 */
export async function pushActiveSessionMetaToServer(meta: ActiveSessionMeta): Promise<void> {
  try {
    await api('/api/active-session-meta', {
      method: 'PUT',
      body: JSON.stringify(meta),
    });
  } catch {
    /* offline — wird später erneut versucht */
  }
}
