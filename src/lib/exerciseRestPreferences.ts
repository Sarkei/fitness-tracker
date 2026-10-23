/**
 * Standard-Pausen pro Übung (Profil), Fallback auf Übungs-`rest`-Feld oder 90 s.
 */

import type { Exercise, UserProfile } from '@/src/types';
import { normalizeExerciseName } from '@/src/lib/fitnessInsights';

const DEFAULT_REST_SEC = 90;

/** Parst `90`, `90s`, `1.5m`, `2m` → Sekunden. */
export function parseRestSeconds(rest?: string): number {
  if (!rest) return DEFAULT_REST_SEC;
  const t = rest.trim().toLowerCase();
  if (t.endsWith('s') && !t.endsWith('ms')) return parseInt(t, 10) || DEFAULT_REST_SEC;
  if (t.endsWith('m')) return Math.round((parseFloat(t) || 1.5) * 60);
  const n = parseInt(t, 10);
  return n > 0 ? n : DEFAULT_REST_SEC;
}

export function formatRestSeconds(sec: number): string {
  if (sec >= 60 && sec % 60 === 0) return `${sec / 60}m`;
  return `${sec}s`;
}

export function getExerciseRestSeconds(profile: UserProfile | null | undefined, exercise: Exercise): number {
  if (exercise.rest?.trim()) return parseRestSeconds(exercise.rest);
  const key = normalizeExerciseName(exercise.name || '');
  const map = profile?.exerciseRestSeconds;
  if (key && map?.[key] != null && map[key] > 0) return map[key];
  return DEFAULT_REST_SEC;
}

export function setExerciseRestInProfile(
  profile: UserProfile,
  exerciseName: string,
  seconds: number,
): Record<string, number> {
  const key = normalizeExerciseName(exerciseName);
  const prev = profile.exerciseRestSeconds ?? {};
  return { ...prev, [key]: Math.max(15, Math.min(600, Math.round(seconds))) };
}
