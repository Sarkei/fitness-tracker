import type { Pool } from 'pg';
import type { CoachPlanState } from './coachTypes';

export const DEFAULT_COACH_PLAN_STATE: CoachPlanState = {
  phase: 'baseline',
  weekInBlock: 1,
  blockLength: 4,
  volumeMultiplier: 1,
  intensityTargetRpe: 7,
  deloadNextWeek: false,
  nutritionMacroMultiplier: 1,
};

export function parseCoachPlanState(raw: unknown): CoachPlanState {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_COACH_PLAN_STATE };
  const o = raw as Record<string, unknown>;
  const phase = String(o.phase ?? 'baseline');
  const validPhases = ['baseline', 'accumulation', 'intensification', 'deload', 'taper', 'maintain'];
  return {
    phase: (validPhases.includes(phase) ? phase : 'baseline') as CoachPlanState['phase'],
    weekInBlock: Math.max(1, Math.min(8, Number(o.weekInBlock) || 1)),
    blockLength: Math.max(3, Math.min(6, Number(o.blockLength) || 4)),
    volumeMultiplier: Math.max(0.5, Math.min(1.25, Number(o.volumeMultiplier) || 1)),
    intensityTargetRpe: Math.max(5, Math.min(9, Number(o.intensityTargetRpe) || 7)),
    deloadNextWeek: o.deloadNextWeek === true,
    nutritionMacroMultiplier: Math.max(0.85, Math.min(1.15, Number(o.nutritionMacroMultiplier) || 1)),
    lastRecommendation: o.lastRecommendation as CoachPlanState['lastRecommendation'],
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : undefined,
    sessionMatchOverrides:
      o.sessionMatchOverrides && typeof o.sessionMatchOverrides === 'object'
        ? (o.sessionMatchOverrides as Record<string, string>)
        : undefined,
    sessionFeedback: Array.isArray(o.sessionFeedback)
      ? (o.sessionFeedback as CoachPlanState['sessionFeedback'])
      : undefined,
  };
}

export async function ensureCoachPlanStateColumn(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE coach_plans ADD COLUMN IF NOT EXISTS coach_plan_state JSONB`);
}

export async function loadCoachPlanState(pool: Pool, planId: string): Promise<CoachPlanState> {
  try {
    const res = await pool.query(`SELECT coach_plan_state FROM coach_plans WHERE id=$1`, [planId]);
    return parseCoachPlanState(res.rows[0]?.coach_plan_state);
  } catch {
    return { ...DEFAULT_COACH_PLAN_STATE };
  }
}

export async function saveCoachPlanState(
  pool: Pool,
  planId: string,
  state: CoachPlanState,
): Promise<void> {
  const next = { ...state, updatedAt: new Date().toISOString() };
  await pool.query(`UPDATE coach_plans SET coach_plan_state=$2::jsonb, updated_at=NOW() WHERE id=$1`, [
    planId,
    JSON.stringify(next),
  ]);
}
