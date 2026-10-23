import type { Nutrition, UserProfile, Workout } from '@/src/types';
import type { Pool } from 'pg';
import type { WeeklyReportPayload } from '../coachScheduleZod';
import { buildAthleteWeekSnapshot } from './athleteWeekSnapshot';
import { advancePlanStateAfterWeek, computeWeekDirective } from './periodizationEngine';
import { loadCoachPlanState, saveCoachPlanState } from './coachPlanState';
import type { WeeklyReportFacts, WeeklyReportWithFacts } from './coachTypes';
import { strengthVolumeForWorkout } from '../workoutAnalytics';
import { mapWorkoutRow } from './coachDbMappers';

export function computeWeeklyReportFacts(params: {
  planType: 'workout' | 'nutrition';
  weekNumber: number;
  startYmd: string;
  scheduleEnvelope: Record<string, unknown>;
  workouts: Workout[];
  nutrition: Nutrition[];
  profile: UserProfile;
  onboarding: Record<string, unknown>;
  planState: import('./coachTypes').CoachPlanState;
  weeksUntilEvent?: number | null;
  prevWeekVolumeKg?: number | null;
}): WeeklyReportFacts {
  const snapshot = buildAthleteWeekSnapshot({
    planType: params.planType,
    weekNumber: params.weekNumber,
    startYmd: params.startYmd,
    scheduleEnvelope: params.scheduleEnvelope,
    workouts: params.workouts,
    nutrition: params.nutrition,
    profile: params.profile,
    onboarding: params.onboarding,
    prevWeekVolumeKg: params.prevWeekVolumeKg,
    matchOverrides: params.planState.sessionMatchOverrides,
  });
  const directive = computeWeekDirective({
    snapshot,
    planState: params.planState,
    weeksUntilEvent: params.weeksUntilEvent,
  });
  const nextState = advancePlanStateAfterWeek(params.planState, directive, params.weekNumber);
  return {
    overallRating: directive.overallRating,
    completionRate: directive.completionRate,
    recommendation: directive.recommendation,
    snapshot,
    directive,
    planState: nextState,
  };
}

export function mergeNarrativeWithFacts(
  facts: WeeklyReportFacts,
  narrative: Partial<WeeklyReportPayload>,
): WeeklyReportWithFacts {
  return {
    overallRating: facts.overallRating,
    completionRate: facts.completionRate,
    recommendation: facts.recommendation,
    coachMessage: narrative.coachMessage ?? '',
    summary: narrative.summary ?? '',
    performanceHighlights: narrative.performanceHighlights ?? [],
    areasToImprove: narrative.areasToImprove ?? [],
    weekOverWeekComparison: narrative.weekOverWeekComparison,
    nextWeekStrategy: narrative.nextWeekStrategy ?? '',
    nextWeekChanges: narrative.nextWeekChanges ?? [],
    factsSnapshot: facts.snapshot,
    weekDirective: facts.directive,
  };
}

export async function loadPrevWeekVolumeKg(
  pool: Pool,
  userId: number,
  prevStartYmd: string,
  prevEndYmd: string,
): Promise<number> {
  const res = await pool.query(
    `SELECT exercises FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3`,
    [userId, prevStartYmd, prevEndYmd],
  );
  let vol = 0;
  for (const row of res.rows) {
    vol += strengthVolumeForWorkout(mapWorkoutRow(row));
  }
  return vol;
}

export async function persistPlanStateAfterReport(
  pool: Pool,
  planId: string,
  state: import('./coachTypes').CoachPlanState,
): Promise<void> {
  await saveCoachPlanState(pool, planId, state);
}
