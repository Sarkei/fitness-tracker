import type pg from 'pg';
import { coachWeekInclusiveEnd, toLocalYmd } from './coachWeekWindow';
import { loadCoachPlanState, parseCoachPlanState } from './coach/coachPlanState';
import { resolveTrainingSlotPlanFromOnboarding } from './coachCustomWeekPlan';
import {
  buildVolumeAssignmentsFromOnboarding,
  parseCoachSessionVolume,
  totalWeeklySessions,
} from './coachSessionVolume';
import { buildCoachBenchmarkProfile } from './coachBenchmarkProfile';
import { normalizeCoachEquipmentSelection } from './coachEquipment';

interface BuildUserContextParams {
  pool: pg.Pool;
  userId: number;
  plan: Record<string, unknown> & { id?: string; onboarding_data?: Record<string, unknown> };
  /** Wenn gesetzt: Auswertungsfenster exakt diese Coach-Woche (start_date + 6 Tage). */
  scheduleWindow?: { startYmd: string } | null;
  /** Erste Woche: nur Einheiten ab diesem Wochentag (Englisch). */
  partialWeekStartDay?: string;
  weekNumber?: number;
}

function simpleWeightTrend(weightHistory: unknown): 'up' | 'down' | 'stable' {
  if (!Array.isArray(weightHistory) || weightHistory.length < 2) return 'stable';
  const nums = weightHistory
    .map((e: any) => (e && typeof e.value === 'number' ? e.value : NaN))
    .filter((x) => Number.isFinite(x));
  if (nums.length < 2) return 'stable';
  const a = nums[0];
  const b = nums[nums.length - 1];
  const d = b - a;
  if (d > 0.4) return 'up';
  if (d < -0.4) return 'down';
  return 'stable';
}

/**
 * Stabiles JSON für Coach-Prompts (Phase 1 / Prompt.md).
 * Reine Datenaggregation — kein LLM.
 */
export async function buildUserContextForCoach(
  params: BuildUserContextParams,
): Promise<Record<string, unknown>> {
  const { pool, userId, plan } = params;
  const ob = (plan.onboarding_data || {}) as Record<string, unknown>;

  const userRow = await pool.query(
    `SELECT measurements, weight_history, profile_extras, goals FROM users WHERE id=$1`,
    [userId],
  );
  const row = userRow.rows[0] || {};
  const m = (row.measurements || {}) as Record<string, unknown>;
  const wh = row.weight_history;
  const profileExtras = (row.profile_extras || {}) as Record<string, unknown>;
  const goals = (row.goals || {}) as Record<string, unknown>;

  const rollEnd = new Date();
  const rollStart = new Date(rollEnd);
  rollStart.setDate(rollEnd.getDate() - 27);
  const rollA = toLocalYmd(rollStart);
  const rollB = toLocalYmd(rollEnd);

  let evalStart: string | null = null;
  let evalEnd: string | null = null;
  if (params.scheduleWindow?.startYmd) {
    evalStart = params.scheduleWindow.startYmd;
    evalEnd = coachWeekInclusiveEnd(evalStart);
  }

  const [wCount, nAgg, reports, cardioFb, workoutLoad, recentWorkouts] = await Promise.all([
    pool.query(`SELECT COUNT(*)::int AS c FROM workouts WHERE user_id=$1 AND date BETWEEN $2 AND $3`, [
      userId,
      rollA,
      rollB,
    ]),
    pool.query(
      `SELECT COUNT(*)::int AS entries, COALESCE(AVG(calories),0)::float AS avg_cal
       FROM nutrition WHERE user_id=$1 AND date BETWEEN $2 AND $3`,
      [userId, rollA, rollB],
    ),
    plan.id
      ? pool.query(
          `SELECT week_number, report FROM coach_weekly_reports WHERE plan_id=$1 ORDER BY week_number DESC LIMIT 3`,
          [plan.id],
        )
      : Promise.resolve({ rows: [] as any[] } as any),
    pool.query(
      `SELECT date, type, cardio_session_feedback FROM workouts
       WHERE user_id=$1 AND cardio_session_feedback IS NOT NULL
       ORDER BY date DESC LIMIT 3`,
      [userId],
    ),
    pool.query(
      `SELECT
          COALESCE(AVG(duration),0)::float AS avg_duration,
          COALESCE(AVG(calories_burned),0)::float AS avg_kcal,
          COALESCE(AVG(session_rpe),0)::float AS avg_session_rpe
       FROM workouts
       WHERE user_id=$1 AND date BETWEEN $2 AND $3`,
      [userId, rollA, rollB],
    ),
    pool.query(
      `SELECT date, name, type, duration, calories_burned, session_rpe, exercises
       FROM workouts
       WHERE user_id=$1
       ORDER BY date DESC
       LIMIT 20`,
      [userId],
    ),
  ]);

  const highlights = (reports.rows || []).map((r: any) => ({
    week: r.week_number,
    recommendation: r.report?.recommendation,
    rating: r.report?.overallRating,
    completionRate: r.report?.completionRate,
  }));

  let coachPlanState = parseCoachPlanState(null);
  if (plan.id) {
    coachPlanState = await loadCoachPlanState(pool, plan.id);
  }

  const latestReport = (reports.rows || [])[0]?.report as Record<string, unknown> | undefined;

  const slotPlan = resolveTrainingSlotPlanFromOnboarding(ob, params.partialWeekStartDay);
  const volumeAssignments = buildVolumeAssignmentsFromOnboarding(ob, {
    partialWeekStartDay: params.partialWeekStartDay,
  });
  const customAssignments = volumeAssignments?.length ? volumeAssignments : null;

  const vol = parseCoachSessionVolume(ob);
  const assignStrength = customAssignments?.filter((a) => a.sessionTypeHint === 'strength').length;
  const assignCardio = customAssignments?.filter((a) => a.sessionTypeHint === 'cardio').length;
  const targetSessions =
    customAssignments?.length && customAssignments.length > 0
      ? customAssignments.length
      : slotPlan?.targetSessions ?? totalWeeklySessions(vol);

  const weekNumber = params.weekNumber ?? (plan.current_week as number | undefined) ?? 1;
  const benchmarkProfile = buildCoachBenchmarkProfile({
    benchmarks: (ob.benchmarks || {}) as Record<string, string>,
    equipment: normalizeCoachEquipmentSelection(
      Array.isArray(ob.equipment) ? (ob.equipment as string[]) : undefined,
    ),
    trainingStyle: String(ob.trainingStyle || 'hybrid'),
    sports: Array.isArray(ob.sports) ? (ob.sports as string[]) : [],
    weekNumber,
  });

  return {
    onboarding: ob,
    profile_snapshot: {
      weight_kg: m.weight ?? null,
      height_cm: m.height ?? null,
      age: m.age ?? null,
      gender: m.gender ?? null,
      activity_level: m.activityLevel ?? null,
      goal_type: goals.type ?? null,
      goals,
      profile_extras: profileExtras,
    },
    rolling: {
      window_days: 28,
      workouts_logged_count: wCount.rows[0]?.c ?? 0,
      workout_load: {
        avg_duration_min: workoutLoad.rows[0]?.avg_duration ?? 0,
        avg_kcal: workoutLoad.rows[0]?.avg_kcal ?? 0,
        avg_session_rpe: workoutLoad.rows[0]?.avg_session_rpe ?? 0,
      },
      recent_workouts: (recentWorkouts.rows || []).map((r: any) => ({
        date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
        name: r.name,
        type: r.type,
        duration: r.duration,
        calories_burned: r.calories_burned,
        session_rpe: r.session_rpe,
        exercises: Array.isArray(r.exercises) ? r.exercises : [],
      })),
      strength_load_workouts: (recentWorkouts.rows || [])
        .filter((r: any) => Array.isArray(r.exercises) && r.exercises.length > 0)
        .slice(0, 16)
        .map((r: any) => ({
          id: String(r.date),
          date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
          name: r.name || 'Workout',
          type: r.type || 'Strength',
          duration: Number(r.duration) || 0,
          caloriesBurned: Number(r.calories_burned) || 0,
          exercises: r.exercises,
        })),
      nutrition_summary: {
        entries: nAgg.rows[0]?.entries ?? 0,
        avg_calories: nAgg.rows[0]?.avg_cal ?? 0,
      },
      weight_trend: simpleWeightTrend(wh),
      last_reports_highlights: highlights,
    },
    constraints_input: {
      coach_decides_training_days:
        vol.coachDecidesStrengthSessions && vol.coachDecidesCardioSessions,
      coach_decides_session_duration:
        vol.coachDecidesStrengthDuration && vol.coachDecidesCardioDuration,
      schedule_mode: ob.scheduleMode === 'custom' ? 'custom' : 'auto',
      available_weekdays_en: ob.availableTrainingDays ?? [],
      target_sessions_per_week: targetSessions,
      custom_week_assignments: customAssignments,
      partial_first_week_start_day: params.partialWeekStartDay ?? null,
      allow_double_sessions: ob.allowDoubleSessions !== false,
      volume: {
        strength: {
          sessions_per_week:
            assignStrength != null && assignStrength > 0
              ? assignStrength
              : vol.strengthSessionsPerWeek,
          full_week_target_sessions: vol.strengthSessionsPerWeek,
          duration_min: vol.strengthDurationMin,
          coach_decides_sessions: vol.coachDecidesStrengthSessions,
          coach_decides_duration: vol.coachDecidesStrengthDuration,
        },
        cardio: {
          sessions_per_week:
            assignCardio != null && assignCardio > 0 ? assignCardio : vol.cardioSessionsPerWeek,
          full_week_target_sessions: vol.cardioSessionsPerWeek,
          duration_min: vol.cardioDurationMin,
          coach_decides_sessions: vol.coachDecidesCardioSessions,
          coach_decides_duration: vol.coachDecidesCardioDuration,
        },
      },
      session_duration_cap_min: vol.strengthDurationMin ?? ob.sessionDuration ?? null,
      equipment_ids: normalizeCoachEquipmentSelection(
        Array.isArray(ob.equipment) ? (ob.equipment as string[]) : undefined,
      ),
      fitness_level: ob.fitnessLevel ?? null,
      injuries_plain: String(ob.injuries ?? ''),
      benchmarks: benchmarkProfile.filled,
      has_run_benchmarks: benchmarkProfile.hasRunBenchmarks,
      has_strength_benchmarks: benchmarkProfile.hasStrengthBenchmarks,
      week1_cardio_discovery: benchmarkProfile.cardioDiscoveryWeek,
      week1_strength_discovery: benchmarkProfile.strengthDiscoveryWeek,
    },
    benchmark_profile: benchmarkProfile,
    schedule_eval_window:
      evalStart && evalEnd
        ? { start: evalStart, end: evalEnd }
        : null,
    coach_plan_state: coachPlanState,
    latest_week_directive: latestReport?.weekDirective ?? null,
    latest_facts_snapshot: latestReport?.factsSnapshot ?? null,
    recent_cardio_feedback: (cardioFb.rows || []).map((r: { date: unknown; type: string; cardio_session_feedback: unknown }) => ({
      date: r.date instanceof Date ? r.date.toISOString().split('T')[0] : String(r.date),
      type: r.type,
      feedback: r.cardio_session_feedback,
    })),
  };
}
