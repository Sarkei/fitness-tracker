/**
 * Kompakte Wochenübersicht fürs Dashboard (Training, Ermüdung, Energiebilanz).
 */

import { startOfWeek } from 'date-fns';
import type { Nutrition, UserProfile, Workout } from '@/src/types';
import { computeWeeklyFatigue } from '@/src/lib/fatigueScore';
import { computeWeeklyEnergyBalance } from '@/src/lib/fitnessInsights';
import { strengthVolumeForWorkout } from '@/src/lib/workoutAnalytics';

export interface WeeklyDigest {
  weekSessions: number;
  weekVolumeKg: number;
  fatigueScore: number;
  fatigueLabelKey: 'fatigue.low' | 'fatigue.moderate' | 'fatigue.high' | 'fatigue.critical';
  avgRpe: number | null;
  avgNetKcalPerDay: number;
  projectedKgPerWeek: number;
}

export function computeWeeklyDigest(
  workouts: Workout[],
  nutrition: Nutrition[],
  profile: UserProfile,
  refDate = new Date(),
): WeeklyDigest {
  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 });
  const interval = { start: weekStart, end: refDate };

  let weekSessions = 0;
  let weekVolumeKg = 0;
  for (const w of workouts) {
    const d = new Date(w.date);
    if (d < weekStart || d > refDate) continue;
    weekSessions += 1;
    weekVolumeKg += strengthVolumeForWorkout(w);
  }

  const steps = profile.dailyActivityLog?.stepsByDate;
  const sleep = profile.dailyActivityLog?.sleepByDate;
  const fatigue = computeWeeklyFatigue(workouts, {
    refDate,
    stepsByDate: steps,
    sleepByDate: sleep,
  });

  const dailyTarget = profile.goals?.dailyCalories ?? 2400;
  const energy = computeWeeklyEnergyBalance(workouts, nutrition, weekStart, dailyTarget);

  return {
    weekSessions,
    weekVolumeKg: Math.round(weekVolumeKg),
    fatigueScore: fatigue.score,
    fatigueLabelKey: fatigue.labelKey,
    avgRpe: fatigue.avgRpe,
    avgNetKcalPerDay: energy.avgNet,
    projectedKgPerWeek: energy.projectedKgDelta,
  };
}
