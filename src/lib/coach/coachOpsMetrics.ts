import type { Pool } from 'pg';

export type CoachEndpointMetric = {
  endpoint: string;
  total: number;
  errors: number;
  errorRate: number;
  zodFailures: number;
  avgLatencyMs: number;
};

export type CoachOpsMetrics = {
  windowHours: number;
  totalRuns: number;
  errorRuns: number;
  errorRate: number;
  zodFailureRate: number;
  avgLatencyMs: number;
  byEndpoint: CoachEndpointMetric[];
  refine: { total: number; errors: number; errorRate: number };
  weeklyReport: { total: number; errors: number; errorRate: number };
  activePlans: number;
  status: 'ok' | 'degraded' | 'critical';
};

const REFINE_ENDPOINT = 'POST /api/coach/plans/:id/refine-schedule';
const REPORT_ENDPOINT = 'POST /api/coach/plans/:id/weekly-report';

function rate(errors: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((errors / total) * 1000) / 1000;
}

function classifyStatus(errorRate: number): CoachOpsMetrics['status'] {
  if (errorRate >= 0.35) return 'critical';
  if (errorRate >= 0.15) return 'degraded';
  return 'ok';
}

export async function queryCoachOpsMetrics(
  pool: Pool,
  windowHours = 24,
): Promise<CoachOpsMetrics> {
  const hours = Math.max(1, Math.min(168, windowHours));

  const [aggRes, endpointRes, plansRes] = await Promise.all([
    pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE error_message IS NOT NULL OR zod_ok = false)::int AS errors,
         COUNT(*) FILTER (WHERE zod_ok = false)::int AS zod_failures,
         COALESCE(AVG(latency_ms), 0)::int AS avg_latency
       FROM coach_ai_runs
       WHERE created_at >= NOW() - ($1::text || ' hours')::interval`,
      [String(hours)],
    ),
    pool.query(
      `SELECT
         endpoint,
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE error_message IS NOT NULL OR zod_ok = false)::int AS errors,
         COUNT(*) FILTER (WHERE zod_ok = false)::int AS zod_failures,
         COALESCE(AVG(latency_ms), 0)::int AS avg_latency
       FROM coach_ai_runs
       WHERE created_at >= NOW() - ($1::text || ' hours')::interval
       GROUP BY endpoint
       ORDER BY total DESC`,
      [String(hours)],
    ),
    pool.query(`SELECT COUNT(*)::int AS n FROM coach_plans WHERE status = 'active'`),
  ]);

  const agg = aggRes.rows[0] ?? {};
  const totalRuns = Number(agg.total) || 0;
  const errorRuns = Number(agg.errors) || 0;
  const errorRate = rate(errorRuns, totalRuns);

  const byEndpoint: CoachEndpointMetric[] = endpointRes.rows.map((row) => {
    const total = Number(row.total) || 0;
    const errors = Number(row.errors) || 0;
    return {
      endpoint: String(row.endpoint),
      total,
      errors,
      errorRate: rate(errors, total),
      zodFailures: Number(row.zod_failures) || 0,
      avgLatencyMs: Number(row.avg_latency) || 0,
    };
  });

  const pick = (ep: string): CoachEndpointMetric =>
    byEndpoint.find((r) => r.endpoint === ep) ?? {
      endpoint: ep,
      total: 0,
      errors: 0,
      errorRate: 0,
      zodFailures: 0,
      avgLatencyMs: 0,
    };

  const refineRow = pick(REFINE_ENDPOINT);
  const reportRow = pick(REPORT_ENDPOINT);

  return {
    windowHours: hours,
    totalRuns,
    errorRuns,
    errorRate,
    zodFailureRate: rate(Number(agg.zod_failures) || 0, totalRuns),
    avgLatencyMs: Number(agg.avg_latency) || 0,
    byEndpoint,
    refine: {
      total: refineRow.total,
      errors: refineRow.errors,
      errorRate: refineRow.errorRate,
    },
    weeklyReport: {
      total: reportRow.total,
      errors: reportRow.errors,
      errorRate: reportRow.errorRate,
    },
    activePlans: Number(plansRes.rows[0]?.n) || 0,
    status: classifyStatus(errorRate),
  };
}
