/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { format, subDays, eachDayOfInterval, startOfDay, endOfDay, isWithinInterval } from 'date-fns';
import type { Workout, Exercise, SetDetail, Nutrition, UserProfile } from '../types';
import { effectiveNutritionTotals } from './nutritionTotals';
import { resolveWeightHistoryForProfile } from './weightHistory';
import {
  strengthSetsForStats,
  strengthVolumeFromSets,
  maxWeightFromSets,
  isCardioExercise,
} from './workoutSetStats';

export function normalizeExerciseName(name: string): string {
  return name.trim().toLowerCase();
}

export function getPersonalRecordKg(workouts: Workout[], exerciseName: string): number {
  const key = normalizeExerciseName(exerciseName);
  let max = 0;
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      if (normalizeExerciseName(ex.name) !== key) continue;
      if (isCardioExercise(ex)) continue;
      const sets = strengthSetsForStats(ex);
      if (sets.length) {
        const m = maxWeightFromSets(sets);
        if (m > max) max = m;
      } else if (typeof ex.weight === 'number' && ex.weight > max) max = ex.weight;
    }
  }
  return max;
}

export type LastSessionHint = { weight: number; reps: number; setsCount: number; date: string } | null;

export function getLastSessionHint(
  workouts: Workout[],
  exerciseName: string,
  excludeWorkoutId?: string
): LastSessionHint {
  const key = normalizeExerciseName(exerciseName);
  const sorted = [...workouts]
    .filter(w => w.id !== excludeWorkoutId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  for (const w of sorted) {
    for (const ex of w.exercises || []) {
      if (normalizeExerciseName(ex.name) !== key) continue;
      if (isCardioExercise(ex)) continue;
      const working = strengthSetsForStats(ex);
      if (working.length === 0) continue;
      const last = working[working.length - 1];
      return {
        weight: last.weight,
        reps: last.reps,
        setsCount: working.length,
        date: typeof w.date === 'string' ? w.date.split('T')[0] : format(new Date(w.date), 'yyyy-MM-dd'),
      };
    }
  }
  return null;
}

export interface ExercisePRRow {
  exercise: string;
  maxWeight: number;
  bestVolumeSet: number;
  sessions: number;
}

export function computeExercisePRTable(workouts: Workout[]): ExercisePRRow[] {
  const byName = new Map<string, { maxW: number; bestVol: number; sessions: number }>();

  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      const k = ex.name.trim();
      if (!k) continue;
      if (isCardioExercise(ex)) continue;
      const sets = strengthSetsForStats(ex);
      if (sets.length === 0) continue;
      if (!byName.has(k)) byName.set(k, { maxW: 0, bestVol: 0, sessions: 0 });
      const r = byName.get(k)!;
      r.sessions += 1;
      const maxW = maxWeightFromSets(sets);
      if (maxW > r.maxW) r.maxW = maxW;
      for (const s of sets) {
        const vol = s.weight * s.reps;
        if (vol > r.bestVol) r.bestVol = vol;
      }
    }
  }

  return [...byName.entries()]
    .map(([exercise, v]) => ({
      exercise,
      maxWeight: v.maxW,
      bestVolumeSet: v.bestVol,
      sessions: v.sessions,
    }))
    .filter(r => r.maxWeight > 0 || r.bestVolumeSet > 0)
    .sort((a, b) => b.maxWeight - a.maxWeight);
}

export function computeVolumeByExercise(workouts: Workout[]): { name: string; volume: number }[] {
  const m = new Map<string, number>();
  for (const w of workouts) {
    for (const ex of w.exercises || []) {
      const k = ex.name.trim();
      if (!k) continue;
      if (isCardioExercise(ex)) continue;
      const vol = strengthVolumeFromSets(strengthSetsForStats(ex));
      if (vol > 0) m.set(k, (m.get(k) || 0) + vol);
    }
  }
  return [...m.entries()]
    .map(([name, volume]) => ({ name, volume: Math.round(volume) }))
    .sort((a, b) => b.volume - a.volume);
}

/** Faustregel: Wochen-Nettokalorien → geschätztes Körperfettäquivalent (Statistics). */
export const KCAL_PER_KG_FAT_EQUIV = 7000;

export function computeWeeklyEnergyBalance(
  workouts: Workout[],
  nutrition: Nutrition[],
  weekStart: Date,
  dailyTargetKcal: number
): {
  days: {
    label: string;
    intake: number;
    burned: number;
    net: number;
    /** Tagesbilanz vs. Kalorienziel: Aufnahme − Trainingsverbrauch − Tagesziel (Summe über die Woche = weeklyNetKcal). */
    balanceVsTarget: number;
  }[];
  totalIntake: number;
  totalBurned: number;
  avgNet: number;
  /** Grobe Schätzung kg Fettäquivalent / Woche aus Wochen-Nettobilanz (`KCAL_PER_KG_FAT_EQUIV` kcal ≈ 1 kg). */
  projectedKgDelta: number;
  weeklyNetKcal: number;
  intakeLoggedDays: number;
  /** Zu wenig geloggte Aufnahme → Schätzung nicht aussagekräftig. */
  estimateReliable: boolean;
} {
  const start = weekStart;
  const days = eachDayOfInterval({ start, end: addDaysSafe(start, 6) });

  const result = days.map(d => {
    const ds = format(d, 'yyyy-MM-dd');
    const intake = nutrition
      .filter(
        n =>
          (typeof n.date === 'string' ? n.date.split('T')[0] : format(new Date(n.date), 'yyyy-MM-dd')) === ds
      )
      .reduce((s, n) => s + effectiveNutritionTotals(n).calories, 0);
    const burned = workouts
      .filter(
        w =>
          (typeof w.date === 'string' ? w.date.split('T')[0] : format(new Date(w.date), 'yyyy-MM-dd')) === ds
      )
      .reduce((s, w) => s + (w.caloriesBurned || 0), 0);
    return {
      label: format(d, 'EEE'),
      intake,
      burned,
      net: intake - burned,
      balanceVsTarget: intake - burned - dailyTargetKcal,
    };
  });

  const totalIntake = result.reduce((s, d) => s + d.intake, 0);
  const totalBurned = result.reduce((s, d) => s + d.burned, 0);
  const targetWeek = dailyTargetKcal * 7;
  const weeklyNetKcal = totalIntake - totalBurned - targetWeek;
  const avgNet = weeklyNetKcal / 7;
  /** positives Δ = überschüssige Bilanz → eher Zunahme; negatives Δ = Defizit → eher Abnahme */
  const projectedKgDelta = weeklyNetKcal / KCAL_PER_KG_FAT_EQUIV;

  const intakeLoggedDays = result.filter(d => d.intake > 0).length;
  const estimateReliable =
    dailyTargetKcal > 0 &&
    intakeLoggedDays >= 4 &&
    totalIntake >= targetWeek * 0.45;

  return {
    days: result,
    totalIntake,
    totalBurned,
    avgNet,
    projectedKgDelta,
    weeklyNetKcal,
    intakeLoggedDays,
    estimateReliable,
  };
}

function addDaysSafe(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function getWorkoutStreak(workouts: Workout[]): number {
  if (!workouts.length) return 0;
  const days = new Set<string>();
  for (const w of workouts) {
    const ds =
      typeof w.date === 'string' ? w.date.split('T')[0] : format(new Date(w.date), 'yyyy-MM-dd');
    days.add(ds);
  }
  let streak = 0;
  let d = startOfToday();
  while (days.has(format(d, 'yyyy-MM-dd'))) {
    streak++;
    d = subDays(d, 1);
  }
  return streak;
}

export function getNutritionStreak(entries: Nutrition[]): number {
  if (!entries.length) return 0;
  const days = new Set<string>();
  for (const e of entries) {
    const ds =
      typeof e.date === 'string' ? e.date.split('T')[0] : format(new Date(e.date), 'yyyy-MM-dd');
    days.add(ds);
  }
  let streak = 0;
  let d = startOfToday();
  while (days.has(format(d, 'yyyy-MM-dd'))) {
    streak++;
    d = subDays(d, 1);
  }
  return streak;
}

function startOfToday(): Date {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return t;
}

export function parseEntryDate(d: string | Date): Date {
  return startOfDay(typeof d === 'string' ? new Date(d.split('T')[0]) : new Date(d));
}

export function filterByDateRange<T extends { date: string }>(items: T[], start: Date, end: Date): T[] {
  const s = startOfDay(start);
  const e = endOfDay(end);
  return items.filter(item => {
    const d = parseEntryDate(item.date as string);
    return isWithinInterval(d, { start: s, end: e });
  });
}

export interface PeriodNarrative {
  summary: string;
  training: string;
  nutrition: string;
  body: string;
  bullets: string[];
}

export function buildPeriodNarrative(
  workouts: Workout[],
  nutrition: Nutrition[],
  profile: UserProfile,
  start: Date,
  end: Date,
): PeriodNarrative {
  const daysSpan = Math.max(1, eachDayOfInterval({ start: startOfDay(start), end: startOfDay(end) }).length);
  const sessions = workouts.length;
  const minutes = workouts.reduce((s, w) => s + (w.duration || 0), 0);
  const uniqueTrainDays = new Set(
    workouts.map(w =>
      typeof w.date === 'string' ? w.date.split('T')[0] : format(new Date(w.date), 'yyyy-MM-dd'),
    ),
  ).size;

  const kcalByDay = new Map<string, number>();
  for (const n of nutrition) {
    const ds = typeof n.date === 'string' ? n.date.split('T')[0] : format(new Date(n.date), 'yyyy-MM-dd');
    kcalByDay.set(ds, (kcalByDay.get(ds) || 0) + effectiveNutritionTotals(n).calories);
  }
  const dayKeys = [...kcalByDay.keys()].sort();
  const totals = [...kcalByDay.values()];
  const avgKcal = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const target = profile.goals?.dailyCalories || 2400;
  let variance = 0;
  if (totals.length > 1) {
    const mean = avgKcal;
    variance = Math.sqrt(totals.reduce((s, x) => s + (x - mean) ** 2, 0) / totals.length);
  }
  const cv = avgKcal > 0 ? Math.round((variance / avgKcal) * 100) : 0;

  const weightHist = resolveWeightHistoryForProfile(profile);
  const inRangeW = weightHist.filter(wh => {
    const d = parseEntryDate(wh.date);
    return isWithinInterval(d, { start: startOfDay(start), end: endOfDay(end) });
  });
  let weightSentence = 'Im Zeitraum keine Gewichtseinträge im Verlauf.';
  if (inRangeW.length >= 2) {
    const sorted = [...inRangeW].sort((a, b) => a.date.localeCompare(b.date));
    const delta = sorted[sorted.length - 1].value - sorted[0].value;
    weightSentence = `Gewicht laut Verlauf von etwa ${sorted[0].value} kg auf ${sorted[sorted.length - 1].value} kg (${delta >= 0 ? '+' : ''}${delta.toFixed(1)} kg).`;
  } else if (inRangeW.length === 1) {
    weightSentence = `Ein Gewichtsdatenpunkt: ${inRangeW[0].value} kg.`;
  }

  const consistency =
    cv < 12 ? 'sehr gleichmäßig' : cv < 22 ? 'moderat schwankend' : 'mit spürbaren Ausschlägen';

  const summary = `Über ${daysSpan} Tage: ${sessions} Trainingseinheiten (${uniqueTrainDays} Tage mit Workout), rund ${Math.round(minutes)} Minuten Gesamtdauer. Ernährung erfasst an ${dayKeys.length} Tagen; Ø ${Math.round(avgKcal)} kcal (Ziel ${target} kcal), Tagesmuster ${consistency} (CV ~${cv}%).`;

  const training =
    sessions === 0
      ? 'Keine Workouts im Zeitraum geloggt.'
      : `Im Schnitt ${(sessions / daysSpan).toFixed(2)} Sessions pro Kalendertag. ${
          uniqueTrainDays >= Math.ceil(daysSpan * 0.45)
            ? 'Hohe Trainingspräsenz — Variation und Erholung im Blick behalten.'
            : 'Moderate bis niedrige Frequenz — je nach Ziel ggf. steuern.'
        }`;

  const nutritionText =
    dayKeys.length === 0
      ? 'Keine Mahlzeiten im Zeitraum erfasst.'
      : `Tracking an ${dayKeys.length} von ${daysSpan} Tagen. Ø ${Math.round(avgKcal)} kcal vs. Ziel ${target}. ${
          avgKcal > target * 1.08
            ? 'Im Mittel über Ziel — passt zu bewusstem Überschuss oder Außreißer-Tagen.'
            : avgKcal < target * 0.92
              ? 'Unter Ziel — Absicht (Defizit) vs. lückenhaftes Logging abgleichen.'
              : 'Nahe am Ziel.'
        }`;

  const checkins =
    profile.checkIns?.filter(c => {
      const d = parseEntryDate(c.date);
      return isWithinInterval(d, { start: startOfDay(start), end: endOfDay(end) });
    }).length ?? 0;

  const body = `${weightSentence} Check-ins (Fotos/Gewicht) im Zeitraum: ${checkins}.`;

  const bullets: string[] = [
    `Training: ${sessions} Sessions · ${Math.round(minutes)} min`,
    `Aktive Trainingstage: ${uniqueTrainDays}`,
    `Ernährung: ${dayKeys.length} Tage mit Logs · Ø ${Math.round(avgKcal)} kcal`,
    `Kalorien-CV (Tage mit Log): ~${cv}%`,
  ];
  if (profile.measurements?.weight != null) {
    bullets.push(`Profil-Gewicht: ${profile.measurements.weight} kg`);
  }

  return { summary, training, nutrition: nutritionText, body, bullets };
}
