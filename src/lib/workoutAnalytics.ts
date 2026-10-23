/**
 * Zentrale Workout-Auswertung für Statistik, Speichern und Insights.
 */

import type { Exercise, SetDetail, Workout } from '@/src/types';
import { getLibraryExercise } from '@/src/lib/exerciseLibrary';
import {
  cardioSummaryFromExercise,
  isCardioExercise,
  maxWeightFromSets,
  strengthSetsForStats,
  strengthVolumeFromSets,
} from '@/src/lib/workoutSetStats';
import { isBlockMetaExercise, isSetDetailArray } from '@/src/lib/workoutSessionUtils';

export function strengthVolumeForExercise(ex: Exercise): number {
  return strengthVolumeFromSets(strengthSetsForStats(ex));
}

export function strengthVolumeForWorkout(workout: Workout): number {
  let v = 0;
  for (const ex of workout.exercises || []) {
    v += strengthVolumeForExercise(ex);
  }
  return v;
}

/** Epley e1RM aus Satz */
export function estimateE1rmKg(weight: number, reps: number): number {
  if (weight <= 0 || reps <= 0) return 0;
  if (reps === 1) return weight;
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

export function bestE1rmForExercise(ex: Exercise): number {
  const sets = strengthSetsForStats(ex);
  let best = 0;
  for (const s of sets) {
    const e = estimateE1rmKg(s.weight, s.reps);
    if (e > best) best = e;
  }
  return best;
}

export interface MuscleVolumeRow {
  muscleId: string;
  labelKey: string;
  volume: number;
}

const MUSCLE_MAP: { id: string; labelKey: string }[] = [
  { id: 'brust', labelKey: 'stats.muscle.chest' },
  { id: 'rücken', labelKey: 'stats.muscle.back' },
  { id: 'beine', labelKey: 'stats.muscle.legs' },
  { id: 'arme', labelKey: 'stats.muscle.arms' },
  { id: 'core', labelKey: 'stats.muscle.core' },
  { id: 'schulter', labelKey: 'stats.muscle.shoulders' },
];

export function computeVolumeByMuscle(workouts: Workout[]): MuscleVolumeRow[] {
  const vol = new Map<string, number>();
  for (const m of MUSCLE_MAP) vol.set(m.id, 0);

  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (isCardioExercise(ex) || isBlockMetaExercise(ex)) continue;
      const v = strengthVolumeForExercise(ex);
      if (v <= 0) continue;

      const lib = ex.exerciseKey ? getLibraryExercise(ex.exerciseKey) : undefined;
      const tags = lib?.tags?.filter(t => t !== 'ganzkörper') ?? [];
      if (tags.length) {
        const share = v / tags.length;
        for (const t of tags) {
          if (vol.has(t)) vol.set(t, (vol.get(t) || 0) + share);
        }
      } else {
        const n = ex.name.toLowerCase();
        const fallback = MUSCLE_MAP.find(m => {
          if (m.id === 'brust' && /bench|press|fly|push|dip|pec|drück|bank/.test(n)) return true;
          if (m.id === 'rücken' && /row|pull|\bdeadlift\b|\bdead\b|lat|zug|rudern|klimmz/.test(n)) return true;
          if (m.id === 'beine' && /squat|leg|lunge|calf|glute|kniebeuge|bein|wade/.test(n)) return true;
          if (m.id === 'arme' && /curl|tricep|bicep|arm/.test(n)) return true;
          if (m.id === 'core' && /plank|crunch|core|ab/.test(n)) return true;
          if (m.id === 'schulter' && /shoulder|delt|raise|shrug/.test(n)) return true;
          return false;
        });
        if (fallback) vol.set(fallback.id, (vol.get(fallback.id) || 0) + v);
      }
    }
  }

  return MUSCLE_MAP.map(m => ({
    muscleId: m.id,
    labelKey: m.labelKey,
    volume: Math.round(vol.get(m.id) || 0),
  })).filter(r => r.volume > 0);
}

export type MuscleVolumeShareRow = MuscleVolumeRow & { percent: number };

/** Muskelgruppen-Anteile für eine einzelne Session (für Abschluss-Popup). */
export function computeMuscleVolumeSharesForWorkout(workout: Workout): MuscleVolumeShareRow[] {
  const rows = computeVolumeByMuscle([workout]);
  const total = rows.reduce((sum, r) => sum + r.volume, 0);
  if (total <= 0) return [];
  return rows
    .map(r => ({
      ...r,
      percent: Math.round((r.volume / total) * 100),
    }))
    .sort((a, b) => b.percent - a.percent);
}

export interface CardioAggregate {
  sessions: number;
  totalMinutes: number;
  totalKm: number;
}

export function computeCardioAggregates(workouts: Workout[]): CardioAggregate {
  let sessions = 0;
  let totalMinutes = 0;
  let totalKm = 0;
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      const c = cardioSummaryFromExercise(ex);
      if (!c) continue;
      sessions += 1;
      totalMinutes += c.minutes;
      totalKm += c.distanceKm;
    }
  }
  return {
    sessions,
    totalMinutes: Math.round(totalMinutes),
    totalKm: Math.round(totalKm * 10) / 10,
  };
}

/** Grobe Schätzung: 5 kcal/min Basis + 0,1 kcal pro kg×Rep */
export function estimateWorkoutCalories(workout: Partial<Workout>): number {
  const duration = workout.duration || 0;
  let kcal = Math.max(0, duration) * 5;
  for (const ex of workout.exercises || []) {
    kcal += strengthVolumeForExercise(ex) * 0.1;
    const c = cardioSummaryFromExercise(ex);
    if (c) kcal += c.minutes * 8;
  }
  return Math.round(kcal);
}

export function dayTrainingVolume(workouts: Workout[], dayKey: string): number {
  let v = 0;
  for (const w of workouts) {
    const ds = typeof w.date === 'string' ? w.date.split('T')[0] : '';
    if (ds !== dayKey) continue;
    v += strengthVolumeForWorkout(w);
  }
  return Math.round(v);
}

export function setsForStatsDisplay(ex: Exercise): SetDetail[] {
  return strengthSetsForStats(ex);
}

export function maxWeightForExerciseStats(ex: Exercise): number {
  return maxWeightFromSets(strengthSetsForStats(ex));
}

export interface E1rmRow {
  exercise: string;
  e1rmKg: number;
}

export function computeTopE1rmTable(workouts: Workout[], limit = 8): E1rmRow[] {
  const best = new Map<string, number>();
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (isCardioExercise(ex) || isBlockMetaExercise(ex)) continue;
      const e = bestE1rmForExercise(ex);
      if (e <= 0) continue;
      const k = ex.name.trim();
      if (!k) continue;
      if (e > (best.get(k) || 0)) best.set(k, e);
    }
  }
  return [...best.entries()]
    .map(([exercise, e1rmKg]) => ({ exercise, e1rmKg }))
    .sort((a, b) => b.e1rmKg - a.e1rmKg)
    .slice(0, limit);
}
