import type { Nutrition, UserProfile, Workout } from '@/src/types';
import { computeWeeklyFatigue } from '../fatigueScore';
import {
  bestE1rmForExercise,
  strengthVolumeForWorkout,
} from '../workoutAnalytics';
import { coachWeekInclusiveEnd } from '../coachWeekWindow';
import type { AthleteWeekSnapshot } from './coachTypes';
import { matchWorkoutsToPlannedSessions, type PlannedCoachDay } from './plannedSessionMatcher';
import {
  extractPlannedNutritionSlots,
  matchNutritionSlotsToLogs,
} from './nutritionPlanSlots';

function topPrsFromWorkouts(workouts: Workout[], limit = 5) {
  const prs: Array<{ exercise: string; e1rmKg: number }> = [];
  for (const w of workouts) {
    for (const ex of w.exercises ?? []) {
      const e1 = bestE1rmForExercise(ex);
      if (e1 > 0) prs.push({ exercise: ex.name, e1rmKg: e1 });
    }
  }
  return prs.sort((a, b) => b.e1rmKg - a.e1rmKg).slice(0, limit);
}

function nutritionSlotRows(
  scheduleEnvelope: Record<string, unknown>,
  onboarding: Record<string, unknown>,
  startYmd: string,
  entries: Nutrition[],
): import('./coachTypes').NutritionSlotAdherenceRow[] {
  const slots = extractPlannedNutritionSlots(scheduleEnvelope, onboarding, startYmd);
  return matchNutritionSlotsToLogs(slots, entries);
}

export function buildAthleteWeekSnapshot(params: {
  planType: 'workout' | 'nutrition';
  weekNumber: number;
  startYmd: string;
  scheduleEnvelope: Record<string, unknown>;
  workouts: Workout[];
  nutrition: Nutrition[];
  profile: UserProfile;
  onboarding?: Record<string, unknown>;
  prevWeekVolumeKg?: number | null;
  matchOverrides?: Record<string, string>;
}): AthleteWeekSnapshot {
  const endYmd = coachWeekInclusiveEnd(params.startYmd);
  const flags: string[] = [];

  if (params.planType === 'workout') {
    const scheduleDays = (params.scheduleEnvelope.schedule ?? []) as PlannedCoachDay[];
    const rows = matchWorkoutsToPlannedSessions(scheduleDays, params.startYmd, params.workouts, {
      matchOverrides: params.matchOverrides,
    });
    const planned = rows.filter((r) => r.status !== 'extra').length;
    const completed = rows.filter((r) => r.status === 'completed' || r.status === 'partial').length;
    const completionRate =
      planned > 0 ? Math.round((completed / planned) * 100) : params.workouts.length > 0 ? 100 : 0;

    let totalVolumeKg = 0;
    for (const w of params.workouts) totalVolumeKg += strengthVolumeForWorkout(w);

    const volumeWoWDeltaPct =
      params.prevWeekVolumeKg != null && params.prevWeekVolumeKg > 0
        ? Math.round(((totalVolumeKg - params.prevWeekVolumeKg) / params.prevWeekVolumeKg) * 100)
        : null;

    const fatigue = computeWeeklyFatigue(params.workouts, {
      refDate: new Date(`${endYmd}T23:59:59`),
      stepsByDate: params.profile.dailyActivityLog?.stepsByDate,
      sleepByDate: params.profile.dailyActivityLog?.sleepByDate,
    });

    if (completionRate < 60) flags.push('low_adherence');
    if (fatigue.labelKey === 'fatigue.critical' || fatigue.labelKey === 'fatigue.high') {
      flags.push('high_fatigue');
    }
    if (rows.filter((r) => r.status === 'missed').length >= 2) flags.push('missed_sessions');
    if (rows.some((r) => r.status === 'extra')) flags.push('unplanned_sessions');
    if (rows.some((r) => r.matchUncertain)) flags.push('ambiguous_matches');

    return {
      weekNumber: params.weekNumber,
      windowStart: params.startYmd,
      windowEnd: endYmd,
      planType: 'workout',
      adherence: {
        plannedUnits: planned,
        completedUnits: completed,
        completionRate,
        workoutRows: rows,
      },
      training: {
        totalVolumeKg: Math.round(totalVolumeKg),
        volumeWoWDeltaPct,
        avgRpe: fatigue.avgRpe,
        fatigueScore: fatigue.score,
        fatigueLabelKey: fatigue.labelKey,
        sessionsLogged: params.workouts.length,
        topPrs: topPrsFromWorkouts(params.workouts),
      },
      flags,
    };
  }

  const slotRows = nutritionSlotRows(
    params.scheduleEnvelope,
    (params as { onboarding?: Record<string, unknown> }).onboarding ?? {},
    params.startYmd,
    params.nutrition,
  );
  const planned = slotRows.length;
  const completed = slotRows.filter((r) => r.status === 'logged' || r.status === 'partial').length;
  const completionRate = planned > 0 ? Math.round((completed / planned) * 100) : 0;

  const dailyTargets = params.scheduleEnvelope.dailyTargets as
    | { calories?: number; protein?: number }
    | undefined;
  const targetCalories =
    dailyTargets?.calories != null && dailyTargets.calories > 0
      ? dailyTargets.calories
      : params.profile.goals?.dailyCalories ?? null;
  const targetProtein =
    dailyTargets?.protein != null && dailyTargets.protein > 0
      ? dailyTargets.protein
      : params.profile.goals?.macros?.protein ?? null;
  const avgCalories =
    params.nutrition.length > 0
      ? Math.round(
          params.nutrition.reduce((s, e) => s + e.calories, 0) / Math.max(1, params.nutrition.length),
        )
      : 0;
  const avgProtein =
    params.nutrition.length > 0
      ? Math.round(
          params.nutrition.reduce((s, e) => s + (e.protein ?? 0), 0) /
            Math.max(1, params.nutrition.length),
        )
      : 0;
  const daysWithLogs = new Set(params.nutrition.map((e) => String(e.date).slice(0, 10))).size;
  const calorieAdherencePct =
    targetCalories && avgCalories > 0
      ? Math.round((avgCalories / targetCalories) * 100)
      : null;

  if (completionRate < 50) flags.push('low_meal_logging');
  if (calorieAdherencePct != null && (calorieAdherencePct < 85 || calorieAdherencePct > 115)) {
    flags.push('calorie_off_target');
  }

  return {
    weekNumber: params.weekNumber,
    windowStart: params.startYmd,
    windowEnd: endYmd,
    planType: 'nutrition',
    adherence: {
      plannedUnits: planned,
      completedUnits: completed,
      completionRate,
      nutritionRows: slotRows,
    },
    nutrition: {
      entriesLogged: params.nutrition.length,
      daysWithLogs,
      avgCalories,
      avgProtein,
      targetCalories,
      targetProtein,
      calorieAdherencePct,
    },
    flags,
  };
}
