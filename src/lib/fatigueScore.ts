/**
 * Wöchentliche Ermüdung aus RPE, Volumen und optional Health-Daten.
 */

import type { Workout } from '@/src/types';
import { strengthVolumeForWorkout } from '@/src/lib/workoutAnalytics';
import { strengthSetsForStats } from '@/src/lib/workoutSetStats';
import { startOfWeek, subDays, isWithinInterval } from 'date-fns';

export interface WeeklyFatigueReport {
  score: number;
  labelKey: 'fatigue.low' | 'fatigue.moderate' | 'fatigue.high' | 'fatigue.critical';
  avgRpe: number | null;
  volumeKg: number;
  sessions: number;
  stepsAvg: number | null;
  sleepAvgMin: number | null;
}

export function computeWeeklyFatigue(
  workouts: Workout[],
  opts?: {
    stepsByDate?: Record<string, number>;
    sleepByDate?: Record<string, { totalMinutes: number }>;
    refDate?: Date;
  },
): WeeklyFatigueReport {
  const ref = opts?.refDate ?? new Date();
  const weekStart = startOfWeek(ref, { weekStartsOn: 1 });
  const weekEnd = ref;
  const interval = { start: weekStart, end: weekEnd };

  let volumeKg = 0;
  let sessions = 0;
  let rpeSum = 0;
  let rpeN = 0;

  for (const w of workouts) {
    const d = new Date(w.date);
    if (!isWithinInterval(d, interval)) continue;
    sessions += 1;
    volumeKg += strengthVolumeForWorkout(w);
    for (const ex of w.exercises || []) {
      for (const s of strengthSetsForStats(ex)) {
        if (s.rpe != null && s.rpe > 0) {
          rpeSum += s.rpe;
          rpeN += 1;
        }
      }
    }
  }

  const avgRpe = rpeN > 0 ? Math.round((rpeSum / rpeN) * 10) / 10 : null;

  let stepsSum = 0;
  let stepsDays = 0;
  let sleepSum = 0;
  let sleepDays = 0;
  for (let i = 0; i < 7; i++) {
    const ds = subDays(weekEnd, i).toISOString().split('T')[0];
    const st = opts?.stepsByDate?.[ds];
    if (st != null && st > 0) {
      stepsSum += st;
      stepsDays += 1;
    }
    const sl = opts?.sleepByDate?.[ds]?.totalMinutes;
    if (sl != null && sl > 0) {
      sleepSum += sl;
      sleepDays += 1;
    }
  }
  const stepsAvg = stepsDays > 0 ? Math.round(stepsSum / stepsDays) : null;
  const sleepAvgMin = sleepDays > 0 ? Math.round(sleepSum / sleepDays) : null;

  let score = 0;
  if (avgRpe != null) score += Math.min(40, (avgRpe / 10) * 40);
  score += Math.min(35, (volumeKg / 15000) * 35);
  score += Math.min(15, sessions * 3);
  if (sleepAvgMin != null && sleepAvgMin < 360) score += 10;
  if (stepsAvg != null && stepsAvg > 12000) score += 5;
  score = Math.min(100, Math.round(score));

  let labelKey: WeeklyFatigueReport['labelKey'] = 'fatigue.low';
  if (score >= 75) labelKey = 'fatigue.critical';
  else if (score >= 55) labelKey = 'fatigue.high';
  else if (score >= 35) labelKey = 'fatigue.moderate';

  return {
    score,
    labelKey,
    avgRpe,
    volumeKg: Math.round(volumeKg),
    sessions,
    stepsAvg,
    sleepAvgMin,
  };
}
