import '../envBootstrap.ts';
import pg from 'pg';
import { queryCoachOpsMetrics, type CoachOpsMetrics } from '../src/lib/coach/coachOpsMetrics.ts';
import {
  DEFAULT_COACH_OPS_THRESHOLDS,
  evaluateCoachOpsMetrics,
  type CoachOpsEvaluation,
} from '../src/lib/coach/coachOpsEvaluate.ts';

const { Pool } = pg;

export async function loadCoachOpsFromDb(windowHours?: number): Promise<CoachOpsMetrics> {
  const pool = new Pool({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'fitness_tracker',
    user: process.env.POSTGRES_USER || 'vrtx',
    password: process.env.POSTGRES_PASSWORD || 'vrtx_secret',
  });
  try {
    const hours = windowHours ?? Number(process.env.COACH_OPS_WINDOW_HOURS || '24');
    return await queryCoachOpsMetrics(pool, hours);
  } finally {
    await pool.end();
  }
}

export type HealthCoachPayload = {
  status?: string;
  coach?: CoachOpsMetrics;
  ai?: { enabled?: boolean; provider?: string };
  error?: string;
};

export async function loadCoachOpsFromHealth(url: string): Promise<CoachOpsMetrics> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as HealthCoachPayload;
  if (!res.ok) {
    throw new Error(body.error || `Health HTTP ${res.status}`);
  }
  if (!body.coach) {
    throw new Error('Health response missing coach metrics');
  }
  return body.coach;
}

export function evaluateLoadedMetrics(metrics: CoachOpsMetrics): CoachOpsEvaluation {
  return evaluateCoachOpsMetrics(metrics, DEFAULT_COACH_OPS_THRESHOLDS);
}
