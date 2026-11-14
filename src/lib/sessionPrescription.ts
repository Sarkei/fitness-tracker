/**
 * Live-Session: Coach-Vorgaben + Verlauf → Prefill der Eingabefelder.
 */

import type { Exercise, SetDetail, UserProfile, Workout } from '@/src/types';
import {
  isBodyweightByNameOrEquipment,
  isClearlyWeightedStrengthExercise,
} from '@/src/lib/exerciseLibrarySwap';
import { suggestSetForExercise } from '@/src/lib/progressiveOverload';
import { getLastSessionHint } from '@/src/lib/fitnessInsights';
import { isSetDetailArray } from '@/src/lib/workoutSessionUtils';

const BODYWEIGHT_TEXT_RE = /körpergewicht|body\s*weight|eigengewicht|\bbw\b/i;

export function isBodyweightLabel(text: string | undefined): boolean {
  if (!text?.trim()) return false;
  return BODYWEIGHT_TEXT_RE.test(text.trim());
}

/** Echte Körpergewichtsübung (Coach-Vorgabe: Start mit 0 kg). */
export function isBodyweightDefault(ex: Exercise): boolean {
  if (isClearlyWeightedStrengthExercise(ex.name)) return false;
  if (isBodyweightByNameOrEquipment(ex.name, ex.exerciseKey)) return true;
  const libKey = ex.exerciseKey || '';
  if (/bodyweight|calisthenics/i.test(libKey)) return true;
  return false;
}

/** Mindestens ein Satz mit Gewicht > 0 — dann immer als gewichtet behandeln. */
export function hasLoggedWeightOnExercise(ex: Exercise): boolean {
  if (typeof ex.weight === 'number' && ex.weight > 0) return true;
  if (!isSetDetailArray(ex.sets)) return false;
  for (const s of ex.sets) {
    if (s.type === 'warmup') continue;
    if ((s.weight ?? 0) > 0) return true;
  }
  return false;
}

/**
 * Für Chips / PR / Warm-up-Logik: Körpergewicht nur ohne geloggtes Zusatzgewicht.
 * Das kg-Feld bleibt in der UI immer editierbar.
 */
export function isBodyweightExercise(ex: Exercise): boolean {
  if (hasLoggedWeightOnExercise(ex)) return false;
  if (isBodyweightDefault(ex)) return true;
  const coach = ex.coachPrescription;
  if (coach?.targetWeightKg != null && coach.targetWeightKg > 0) return false;
  return false;
}

export function normalizeSetWeightKg(ex: Exercise, weight: unknown): number {
  if (typeof weight === 'number' && Number.isFinite(weight) && weight > 0) return weight;
  if (typeof weight === 'string') {
    const parsed = parseFloat(weight.replace(',', '.'));
    if (Number.isFinite(parsed) && parsed > 0 && !isBodyweightLabel(weight)) return parsed;
  }
  const coachKg = ex.coachPrescription?.targetWeightKg;
  if (coachKg != null && coachKg > 0) return coachKg;
  if (isBodyweightDefault(ex)) return 0;
  return 0;
}

export function prescriptionPlaceholder(
  ex: Exercise,
  field: 'weight' | 'reps' | 'duration' | 'distance',
  weightUnit: 'kg' | 'lb' = 'kg',
): string {
  const p = ex.coachPrescription;
  if (!p) return isBodyweightDefault(ex) && field === 'weight' ? '0' : '';
  if (field === 'weight' && p.targetWeightKg != null && p.targetWeightKg > 0) {
    if (weightUnit === 'lb') return String(Math.round(p.targetWeightKg * 2.20462 * 10) / 10);
    return String(p.targetWeightKg);
  }
  if (field === 'weight' && isBodyweightDefault(ex)) return '0';
  if (field === 'reps') {
    if (p.targetRepsMin != null && p.targetRepsMax != null && p.targetRepsMin !== p.targetRepsMax) {
      return `${p.targetRepsMin}–${p.targetRepsMax}`;
    }
    if (p.targetReps != null) return String(p.targetReps);
  }
  if (field === 'duration' && p.targetDurationMin != null) return String(p.targetDurationMin);
  if (field === 'distance' && p.targetDistanceKm != null) return String(p.targetDistanceKm);
  return '';
}

export function applyPrescriptionAndHistoryToExercise(
  ex: Exercise,
  workouts: Workout[],
  profile: UserProfile | null | undefined,
  excludeWorkoutId?: string,
): Exercise {
  const out = { ...ex };
  if (!isSetDetailArray(out.sets)) return out;

  const coach = out.coachPrescription;
  const restSec = coach?.targetRestSec;
  if (restSec != null && !out.rest) {
    out.rest = restSec >= 60 ? `${Math.round(restSec / 60)}m` : `${restSec}s`;
  }

  const bwDefault = isBodyweightDefault(out);

  const sets = (out.sets as SetDetail[]).map((s, i) => {
    if (s.completed) return s;
    let weight = s.weight;
    let reps = s.reps;

    if (weight > 0) {
      // Nutzer- oder Verlaufsgewicht nicht überschreiben
    } else if (!bwDefault && coach?.targetWeightKg != null && coach.targetWeightKg > 0) {
      weight = coach.targetWeightKg;
    } else if (bwDefault) {
      weight = 0;
    }

    if (coach?.targetReps != null && reps <= 0) reps = coach.targetReps;

    if (weight <= 0 || reps <= 0) {
      const sug = suggestSetForExercise(workouts, out.name, i, excludeWorkoutId);
      if (sug) {
        if (weight <= 0 && !bwDefault) weight = sug.weightKg;
        if (reps <= 0) reps = sug.reps;
      }
    }

    const rpe = s.rpe ?? coach?.targetRpe;
    return { ...s, weight, reps, ...(rpe != null ? { rpe } : {}) };
  });

  return { ...out, sets };
}

export function enrichExercisesForLiveSession(
  exercises: Exercise[],
  workouts: Workout[],
  profile: UserProfile | null | undefined,
  excludeWorkoutId?: string,
): Exercise[] {
  return exercises.map(ex => applyPrescriptionAndHistoryToExercise(ex, workouts, profile, excludeWorkoutId));
}

export function formatPrescriptionHint(
  ex: Exercise,
  workouts: Workout[],
  excludeWorkoutId?: string,
  t?: (k: string, p?: Record<string, string | number>) => string,
): string | null {
  const coach = ex.coachPrescription;
  const last = getLastSessionHint(workouts, ex.name, excludeWorkoutId);
  const parts: string[] = [];
  const bw = isBodyweightExercise(ex);

  if (bw) {
    if (coach?.targetReps != null) {
      parts.push(
        t
          ? t('workout.session.hint.bodyweightReps', { r: coach.targetReps })
          : `${coach.targetReps} Wdh.`,
      );
    }
    parts.push(
      t ? t('workout.session.hint.bwOptionalWeight') : 'Zusatzgewicht optional eintragen',
    );
  } else if (coach?.targetWeightKg != null && coach.targetReps != null) {
    parts.push(
      t
        ? t('workout.session.hint.coach', {
            w: coach.targetWeightKg,
            r: coach.targetRepsMin !== coach.targetRepsMax && coach.targetRepsMax
              ? `${coach.targetRepsMin}–${coach.targetRepsMax}`
              : coach.targetReps,
          })
        : `Coach: ${coach.targetWeightKg}×${coach.targetReps}`,
    );
  } else if (coach?.weightLabel && coach.targetReps && !isBodyweightLabel(coach.weightLabel)) {
    parts.push(`Coach: ${coach.weightLabel} × ${coach.targetReps}`);
  }

  if (coach?.targetPace) parts.push(coach.targetPace);
  if (coach?.targetZones) parts.push(coach.targetZones);
  if (coach?.targetDurationMin) parts.push(`${coach.targetDurationMin} min`);
  if (coach?.targetDistanceKm) parts.push(`${coach.targetDistanceKm} km`);

  if (last) {
    if (bw) {
      parts.push(
        t ? t('workout.session.hint.lastReps', { r: last.reps }) : `Letztes Mal: ${last.reps} Wdh.`,
      );
    } else {
      parts.push(
        t
          ? t('workout.session.hint.last', { w: last.weight, r: last.reps })
          : `Letztes Mal: ${last.weight}×${last.reps}`,
      );
    }
  }

  return parts.length ? parts.join(' · ') : null;
}
