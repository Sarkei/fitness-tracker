import type { Pool } from 'pg';
import type { UserProfile } from '@/src/types';
import { addDaysYmd, coachWeekInclusiveEnd } from '../coachWeekWindow';
import { buildAthleteWeekSnapshot } from './athleteWeekSnapshot';
import { loadCoachPlanState } from './coachPlanState';
import { mapNutritionRow, mapWorkoutRow } from './coachDbMappers';
import { loadPrevWeekVolumeKg } from './weeklyReportBuilder';
import type { AthleteWeekSnapshot } from './coachTypes';

export async function loadWeekFactsSnapshot(params: {
  pool: Pool;
  plan: Record<string, unknown> & { id: string; type: string };
  weekNumber: number;
  userId: number;
  profile: UserProfile;
  onboarding: Record<string, unknown>;
}): Promise<{ snapshot: AthleteWeekSnapshot; startYmd: string; endYmd: string } | null> {
  const schedResult = await params.pool.query(
    'SELECT schedule, start_date FROM coach_weekly_schedules WHERE plan_id=$1 AND week_number=$2',
    [params.plan.id, params.weekNumber],
  );
  const schedRow = schedResult.rows[0];
  if (!schedRow) return null;

  const startYmd =
    schedRow.start_date != null
      ? String(
          schedRow.start_date instanceof Date
            ? schedRow.start_date.toISOString().split('T')[0]
            : schedRow.start_date,
        ).split('T')[0]
      : new Date().toISOString().split('T')[0];
  const endYmd = coachWeekInclusiveEnd(startYmd);
  const prevStart = addDaysYmd(startYmd, -7);
  const prevEnd = addDaysYmd(startYmd, -1);

  const planState = await loadCoachPlanState(params.pool, params.plan.id);
  const planType = params.plan.type === 'nutrition' ? 'nutrition' : 'workout';

  const [workoutsRes, nutritionRes, prevVol] = await Promise.all([
    params.pool.query(`SELECT * FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      params.userId,
      startYmd,
      endYmd,
    ]),
    params.pool.query(`SELECT * FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      params.userId,
      startYmd,
      endYmd,
    ]),
    planType === 'workout'
      ? loadPrevWeekVolumeKg(params.pool, params.userId, prevStart, prevEnd)
      : Promise.resolve(0),
  ]);

  const snapshot = buildAthleteWeekSnapshot({
    planType,
    weekNumber: params.weekNumber,
    startYmd,
    scheduleEnvelope: (schedRow.schedule as Record<string, unknown>) ?? {},
    workouts: workoutsRes.rows.map((r) => mapWorkoutRow(r)),
    nutrition: nutritionRes.rows.map((r) => mapNutritionRow(r)),
    profile: params.profile,
    onboarding: params.onboarding,
    prevWeekVolumeKg: prevVol,
    matchOverrides: planState.sessionMatchOverrides,
  });

  return { snapshot, startYmd, endYmd };
}
