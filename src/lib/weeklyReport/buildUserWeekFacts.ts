import { format } from 'date-fns';
import type { Nutrition, UserProfile, Workout } from '@/src/types';
import { effectiveNutritionTotals } from '@/src/lib/nutritionTotals';
import { computeWeeklyEnergyBalance, getNutritionStreak, getWorkoutStreak } from '@/src/lib/fitnessInsights';
import { computeWeeklyFatigue } from '@/src/lib/fatigueScore';
import {
  bestE1rmForExercise,
  strengthVolumeForWorkout,
} from '@/src/lib/workoutAnalytics';
import { cardioSummaryFromExercise, isCardioExercise, strengthSetsForStats } from '@/src/lib/workoutSetStats';
import { resolveWeightHistoryForProfile } from '@/src/lib/weightHistory';
import { formatWeekLabel } from './weekWindow';

export type UserWeekFacts = {
  weekLabel: string;
  weekStart: string;
  weekEnd: string;
  locale: 'de' | 'en';
  profile: {
    displayName: string | null;
    goalType: string | null;
    goalWeightKg: number | null;
    currentWeightKg: number | null;
    weightDeltaWeekKg: number | null;
    dailyCalories: number;
    dailyProtein: number;
    dailySteps: number;
  };
  activity: {
    workoutSessions: number;
    nutritionLogDays: number;
    avgSteps: number;
    avgSleepHours: number | null;
    workoutStreak: number;
    nutritionStreak: number;
  };
  training: {
    totalVolumeKg: number;
    prevWeekVolumeKg: number;
    volumeDeltaPct: number | null;
    totalDurationMin: number;
    caloriesBurned: number;
    avgRpe: number | null;
    fatigueScore: number;
    fatigueLabelKey: string;
    topExercisesByVolume: Array<{ name: string; volumeKg: number }>;
    cardioMinutes: number;
    cardioSessions: number;
  };
  nutrition: {
    daysLogged: number;
    totalKcal: number;
    avgKcalPerDay: number;
    avgProteinPerDay: number;
    avgCarbsPerDay: number;
    avgFatPerDay: number;
    targetKcal: number;
    targetProtein: number;
    calorieAdherencePct: number | null;
    proteinAdherencePct: number | null;
    weeklyNetKcal: number;
    projectedKgPerWeek: number;
    estimateReliable: boolean;
  };
  records: Array<{ exercise: string; metric: string; value: string; isNewThisWeek: boolean }>;
  coachPlans: { activeCount: number; disciplines: string[] };
  flags: string[];
};

function ymd(d: Date | string): string {
  if (typeof d === 'string') return d.split('T')[0];
  return format(d, 'yyyy-MM-dd');
}

function inRange(dateStr: string, startYmd: string, endYmd: string): boolean {
  return dateStr >= startYmd && dateStr <= endYmd;
}

function detectWeekRecords(
  allWorkouts: Workout[],
  weekStartYmd: string,
  weekEndYmd: string,
): UserWeekFacts['records'] {
  const during = allWorkouts.filter((w) => inRange(ymd(w.date), weekStartYmd, weekEndYmd));
  const before = allWorkouts.filter((w) => ymd(w.date) < weekStartYmd);
  const names = new Set<string>();
  for (const w of [...during, ...before]) {
    for (const ex of w.exercises ?? []) {
      if (!ex.name?.trim() || isCardioExercise(ex)) continue;
      if (strengthSetsForStats(ex).length === 0) continue;
      names.add(ex.name.trim());
    }
  }
  const out: UserWeekFacts['records'] = [];
  for (const name of names) {
    let bestDuring = 0;
    let bestBefore = 0;
    for (const w of during) {
      for (const ex of w.exercises ?? []) {
        if (ex.name.trim() !== name) continue;
        bestDuring = Math.max(bestDuring, bestE1rmForExercise(ex));
      }
    }
    for (const w of before) {
      for (const ex of w.exercises ?? []) {
        if (ex.name.trim() !== name) continue;
        bestBefore = Math.max(bestBefore, bestE1rmForExercise(ex));
      }
    }
    if (bestDuring <= 0) continue;
    const isNew = bestDuring > bestBefore + 0.5;
    out.push({
      exercise: name,
      metric: 'e1RM',
      value: `${Math.round(bestDuring * 10) / 10} kg`,
      isNewThisWeek: isNew,
    });
  }
  return out.sort((a, b) => (a.isNewThisWeek === b.isNewThisWeek ? 0 : a.isNewThisWeek ? -1 : 1)).slice(0, 12);
}

export function buildUserWeekFacts(params: {
  weekStartYmd: string;
  weekEndYmd: string;
  locale?: 'de' | 'en';
  profile: UserProfile;
  allWorkouts: Workout[];
  allNutrition: Nutrition[];
  coachPlans?: Array<{ status?: string; discipline?: string }>;
}): UserWeekFacts {
  const locale = params.locale ?? (params.profile.uiLocale === 'en' ? 'en' : 'de');
  const { weekStartYmd, weekEndYmd } = params;
  const weekStart = new Date(`${weekStartYmd}T12:00:00`);

  const weekWorkouts = params.allWorkouts.filter((w) => inRange(ymd(w.date), weekStartYmd, weekEndYmd));
  const weekNutrition = params.allNutrition.filter((n) => inRange(ymd(n.date), weekStartYmd, weekEndYmd));

  const prevStart = format(new Date(weekStart.getTime() - 7 * 86400000), 'yyyy-MM-dd');
  const prevEnd = format(new Date(weekStart.getTime() - 86400000), 'yyyy-MM-dd');
  const prevWorkouts = params.allWorkouts.filter((w) => inRange(ymd(w.date), prevStart, prevEnd));

  let totalVolumeKg = 0;
  let totalDurationMin = 0;
  let caloriesBurned = 0;
  let cardioMinutes = 0;
  let cardioSessions = 0;
  const volumeByEx = new Map<string, number>();

  for (const w of weekWorkouts) {
    totalDurationMin += w.duration ?? 0;
    caloriesBurned += w.caloriesBurned ?? 0;
    totalVolumeKg += strengthVolumeForWorkout(w);
    for (const ex of w.exercises ?? []) {
      if (isCardioExercise(ex)) {
        const c = cardioSummaryFromExercise(ex);
        if (c.minutes > 0) {
          cardioMinutes += c.minutes;
          cardioSessions += 1;
        }
        continue;
      }
      const vol = strengthVolumeForWorkout({ ...w, exercises: [ex] });
      if (vol > 0) {
        const k = ex.name.trim();
        volumeByEx.set(k, (volumeByEx.get(k) ?? 0) + vol);
      }
    }
  }

  let prevWeekVolumeKg = 0;
  for (const w of prevWorkouts) prevWeekVolumeKg += strengthVolumeForWorkout(w);

  const volumeDeltaPct =
    prevWeekVolumeKg > 0
      ? Math.round(((totalVolumeKg - prevWeekVolumeKg) / prevWeekVolumeKg) * 100)
      : null;

  const fatigue = computeWeeklyFatigue(weekWorkouts, {
    refDate: new Date(`${weekEndYmd}T23:59:59`),
    stepsByDate: params.profile.dailyActivityLog?.stepsByDate,
    sleepByDate: params.profile.dailyActivityLog?.sleepByDate,
  });

  const dailyTarget = params.profile.goals?.dailyCalories ?? 2400;
  const energy = computeWeeklyEnergyBalance(weekWorkouts, weekNutrition, weekStart, dailyTarget);

  const nutDays = new Set(weekNutrition.map((n) => ymd(n.date)));
  let totalKcal = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  for (const n of weekNutrition) {
    const t = effectiveNutritionTotals(n);
    totalKcal += t.calories;
    totalProtein += t.protein ?? 0;
    totalCarbs += t.carbs ?? 0;
    totalFat += t.fat ?? 0;
  }
  const daysLogged = nutDays.size;
  const avgKcal = daysLogged > 0 ? Math.round(totalKcal / daysLogged) : 0;
  const avgProtein = daysLogged > 0 ? Math.round(totalProtein / daysLogged) : 0;
  const targetProtein = params.profile.goals?.macros?.protein ?? 0;

  const stepsMap = params.profile.dailyActivityLog?.stepsByDate ?? {};
  const sleepMap = params.profile.dailyActivityLog?.sleepByDate ?? {};
  let stepSum = 0;
  let stepDays = 0;
  let sleepMinSum = 0;
  let sleepDays = 0;
  for (let d = new Date(`${weekStartYmd}T12:00:00`); d <= new Date(`${weekEndYmd}T12:00:00`); d.setDate(d.getDate() + 1)) {
    const ds = format(d, 'yyyy-MM-dd');
    const st = stepsMap[ds];
    if (st != null && st > 0) {
      stepSum += st;
      stepDays += 1;
    }
    const sl = sleepMap[ds];
    if (sl?.totalMinutes != null && sl.totalMinutes > 0) {
      sleepMinSum += sl.totalMinutes;
      sleepDays += 1;
    }
  }

  const weightHist = resolveWeightHistoryForProfile(params.profile);
  const weekWeights = weightHist.filter((e) => inRange(e.date, weekStartYmd, weekEndYmd));
  const beforeWeights = weightHist.filter((e) => ymd(e.date) < weekStartYmd);
  const currentWeight =
    weekWeights.length > 0
      ? weekWeights[weekWeights.length - 1].value
      : beforeWeights.length > 0
        ? beforeWeights[beforeWeights.length - 1].value
        : params.profile.measurements?.weight ?? null;
  const startWeight = weekWeights.length > 0 ? weekWeights[0].value : null;
  const weightDeltaWeekKg =
    currentWeight != null && startWeight != null ? Math.round((currentWeight - startWeight) * 10) / 10 : null;

  const activePlans = (params.coachPlans ?? []).filter((p) => p.status === 'active');
  const flags: string[] = [];
  if (weekWorkouts.length === 0) flags.push('no_workouts');
  if (daysLogged < 3) flags.push('low_nutrition_logging');
  if (fatigue.labelKey === 'fatigue.high' || fatigue.labelKey === 'fatigue.critical') flags.push('high_fatigue');

  return {
    weekLabel: formatWeekLabel(weekStartYmd, weekEndYmd, locale),
    weekStart: weekStartYmd,
    weekEnd: weekEndYmd,
    locale,
    profile: {
      displayName: params.profile.displayName ?? null,
      goalType: params.profile.goals?.type ?? null,
      goalWeightKg: params.profile.goals?.targetWeight ?? null,
      currentWeightKg: currentWeight,
      weightDeltaWeekKg,
      dailyCalories: dailyTarget,
      dailyProtein: targetProtein,
      dailySteps: params.profile.goals?.dailySteps ?? 10000,
    },
    activity: {
      workoutSessions: weekWorkouts.length,
      nutritionLogDays: daysLogged,
      avgSteps: stepDays > 0 ? Math.round(stepSum / stepDays) : 0,
      avgSleepHours: sleepDays > 0 ? Math.round((sleepMinSum / sleepDays / 60) * 10) / 10 : null,
      workoutStreak: getWorkoutStreak(params.allWorkouts),
      nutritionStreak: getNutritionStreak(params.allNutrition),
    },
    training: {
      totalVolumeKg: Math.round(totalVolumeKg),
      prevWeekVolumeKg: Math.round(prevWeekVolumeKg),
      volumeDeltaPct,
      totalDurationMin,
      caloriesBurned: Math.round(caloriesBurned),
      avgRpe: fatigue.avgRpe,
      fatigueScore: fatigue.score,
      fatigueLabelKey: fatigue.labelKey,
      topExercisesByVolume: [...volumeByEx.entries()]
        .map(([name, volumeKg]) => ({ name, volumeKg: Math.round(volumeKg) }))
        .sort((a, b) => b.volumeKg - a.volumeKg)
        .slice(0, 8),
      cardioMinutes: Math.round(cardioMinutes),
      cardioSessions,
    },
    nutrition: {
      daysLogged,
      totalKcal,
      avgKcalPerDay: avgKcal,
      avgProteinPerDay: avgProtein,
      avgCarbsPerDay: daysLogged > 0 ? Math.round(totalCarbs / daysLogged) : 0,
      avgFatPerDay: daysLogged > 0 ? Math.round(totalFat / daysLogged) : 0,
      targetKcal: dailyTarget,
      targetProtein,
      calorieAdherencePct: avgKcal > 0 ? Math.round((avgKcal / dailyTarget) * 100) : null,
      proteinAdherencePct:
        targetProtein > 0 && avgProtein > 0 ? Math.round((avgProtein / targetProtein) * 100) : null,
      weeklyNetKcal: Math.round(energy.weeklyNetKcal),
      projectedKgPerWeek: Math.round(energy.projectedKgDelta * 100) / 100,
      estimateReliable: energy.estimateReliable,
    },
    records: detectWeekRecords(params.allWorkouts, weekStartYmd, weekEndYmd),
    coachPlans: {
      activeCount: activePlans.length,
      disciplines: activePlans.map((p) => p.discipline ?? '').filter(Boolean),
    },
    flags,
  };
}

export function formatFactsForPrompt(facts: UserWeekFacts): string {
  return JSON.stringify(facts, null, 2);
}
