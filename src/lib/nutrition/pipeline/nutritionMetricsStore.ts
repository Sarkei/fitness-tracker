import { createHash } from 'node:crypto';
import type { Pool } from 'pg';

export type StoredNutritionMetricEvent =
  | 'process_ok'
  | 'process_fail'
  | 'finalize_ok'
  | 'finalize_fail'
  | 'update_ok'
  | 'update_fail';

export type MetricEndpoint = 'process' | 'finalize' | 'update';

export function endpointFromEvent(event: StoredNutritionMetricEvent): MetricEndpoint {
  if (event.startsWith('process')) return 'process';
  if (event.startsWith('finalize')) return 'finalize';
  return 'update';
}

export function hashUserId(userId: number | null | undefined): string | null {
  if (userId == null) return null;
  return createHash('sha256').update(`nutrition-user:${userId}`).digest('hex').slice(0, 16);
}

export async function ensureNutritionMetricsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition_v3_metrics (
      id BIGSERIAL PRIMARY KEY,
      event VARCHAR(24) NOT NULL,
      endpoint VARCHAR(16),
      input_type VARCHAR(12),
      user_id_hash VARCHAR(32),
      duration_ms NUMERIC,
      components_count INTEGER,
      fallback_count INTEGER,
      error_text TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE nutrition_v3_metrics ADD COLUMN IF NOT EXISTS endpoint VARCHAR(16)`);
  await pool.query(`ALTER TABLE nutrition_v3_metrics ADD COLUMN IF NOT EXISTS input_type VARCHAR(12)`);
  await pool.query(`ALTER TABLE nutrition_v3_metrics ADD COLUMN IF NOT EXISTS user_id_hash VARCHAR(32)`);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_metrics_created
    ON nutrition_v3_metrics(created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_metrics_endpoint_created
    ON nutrition_v3_metrics(endpoint, created_at DESC)
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition_v3_incidents (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      incident_key VARCHAR(140) NOT NULL UNIQUE,
      severity VARCHAR(12) NOT NULL DEFAULT 'warning',
      status VARCHAR(12) NOT NULL DEFAULT 'open',
      alert_keys JSONB NOT NULL DEFAULT '[]'::jsonb,
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      resolved_at TIMESTAMPTZ,
      last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      meta JSONB NOT NULL DEFAULT '{}'::jsonb
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_incidents_status
    ON nutrition_v3_incidents(status, last_seen_at DESC)
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition_v3_ux_events (
      id BIGSERIAL PRIMARY KEY,
      event_name VARCHAR(48) NOT NULL,
      input_type VARCHAR(12),
      source VARCHAR(24),
      success BOOLEAN,
      duration_ms NUMERIC,
      components_count INTEGER,
      corrections_count INTEGER,
      user_id_hash VARCHAR(32),
      trace_id VARCHAR(40),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_ux_events_created
    ON nutrition_v3_ux_events(created_at DESC)
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_nutrition_v3_ux_events_name_created
    ON nutrition_v3_ux_events(event_name, created_at DESC)
  `);
}

export async function storeNutritionV3UxEvent(
  pool: Pool,
  payload: {
    eventName: string;
    inputType?: string | null;
    source?: string | null;
    success?: boolean | null;
    durationMs?: number | null;
    componentsCount?: number | null;
    correctionsCount?: number | null;
    userIdHash?: string | null;
    traceId?: string | null;
  },
): Promise<void> {
  await pool.query(
    `INSERT INTO nutrition_v3_ux_events (
      event_name, input_type, source, success, duration_ms, components_count, corrections_count, user_id_hash, trace_id
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      payload.eventName,
      payload.inputType ?? null,
      payload.source ?? null,
      payload.success ?? null,
      payload.durationMs ?? null,
      payload.componentsCount ?? null,
      payload.correctionsCount ?? null,
      payload.userIdHash ?? null,
      payload.traceId ?? null,
    ],
  );
}

export async function getNutritionV3UxSummary(
  pool: Pool,
  windowHours = 24,
): Promise<{
  windowHours: number;
  events: number;
  avgTimeToLogMs: number | null;
  saveSuccessRate: number | null;
  avgCorrectionsPerSave: number | null;
  abandonmentRate: number | null;
}> {
  const safeHours = Math.max(1, Math.min(24 * 14, Number(windowHours) || 24));
  const rows = await pool.query<{
    events: string;
    avg_time_to_log_ms: string | null;
    saves_total: string;
    saves_success: string;
    corrections_total: string | null;
    sessions_started: string;
    sessions_abandoned: string;
  }>(
    `SELECT
       COUNT(*)::bigint AS events,
       AVG(duration_ms) FILTER (WHERE event_name = 'save_attempt' AND duration_ms IS NOT NULL) AS avg_time_to_log_ms,
       COUNT(*) FILTER (WHERE event_name = 'save_attempt')::bigint AS saves_total,
       COUNT(*) FILTER (WHERE event_name = 'save_attempt' AND success = true)::bigint AS saves_success,
       SUM(corrections_count) FILTER (WHERE event_name = 'save_attempt' AND corrections_count IS NOT NULL) AS corrections_total,
       COUNT(*) FILTER (WHERE event_name = 'session_start')::bigint AS sessions_started,
       COUNT(*) FILTER (WHERE event_name = 'session_abandon')::bigint AS sessions_abandoned
     FROM nutrition_v3_ux_events
     WHERE created_at >= NOW() - make_interval(hours => $1)`,
    [safeHours],
  );
  const row = rows.rows[0];
  const savesTotal = Number(row?.saves_total || 0);
  const savesSuccess = Number(row?.saves_success || 0);
  const sessionsStarted = Number(row?.sessions_started || 0);
  const sessionsAbandoned = Number(row?.sessions_abandoned || 0);
  const correctionsTotal = Number(row?.corrections_total || 0);
  return {
    windowHours: safeHours,
    events: Number(row?.events || 0),
    avgTimeToLogMs: row?.avg_time_to_log_ms != null ? Math.round(Number(row.avg_time_to_log_ms)) : null,
    saveSuccessRate: savesTotal > 0 ? Math.round((savesSuccess / savesTotal) * 1000) / 10 : null,
    avgCorrectionsPerSave: savesTotal > 0 ? Math.round((correctionsTotal / savesTotal) * 100) / 100 : null,
    abandonmentRate: sessionsStarted > 0 ? Math.round((sessionsAbandoned / sessionsStarted) * 1000) / 10 : null,
  };
}

export async function storeNutritionMetricEvent(
  pool: Pool,
  event: StoredNutritionMetricEvent,
  payload: {
    durationMs?: number;
    components?: number;
    fallbackCount?: number;
    error?: string;
    endpoint?: MetricEndpoint;
    inputType?: string | null;
    userIdHash?: string | null;
  } = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO nutrition_v3_metrics (
      event, endpoint, input_type, user_id_hash, duration_ms, components_count, fallback_count, error_text
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [
      event,
      payload.endpoint ?? endpointFromEvent(event),
      payload.inputType ?? null,
      payload.userIdHash ?? null,
      payload.durationMs ?? null,
      payload.components ?? null,
      payload.fallbackCount ?? null,
      payload.error ?? null,
    ],
  );
}

export async function getNutritionV3DbStats(
  pool: Pool,
  windowHours = 24,
): Promise<{
  windowHours: number;
  totalEvents: number;
  failEvents: number;
  successRate: number | null;
  avgDurationMs: number | null;
  avgComponents: number | null;
  fallbackRate: number | null;
}> {
  const safeHours = Math.max(1, Math.min(24 * 14, Number(windowHours) || 24));
  const row = await pool.query<{
    total_events: string;
    fail_events: string;
    success_events: string;
    avg_duration_ms: string | null;
    avg_components: string | null;
    fallback_sum: string | null;
    component_sum: string | null;
  }>(
    `SELECT
       COUNT(*)::bigint AS total_events,
       COUNT(*) FILTER (WHERE event LIKE '%_fail')::bigint AS fail_events,
       COUNT(*) FILTER (WHERE event LIKE '%_ok')::bigint AS success_events,
       AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_duration_ms,
       AVG(components_count) FILTER (WHERE components_count IS NOT NULL) AS avg_components,
       SUM(fallback_count) FILTER (WHERE fallback_count IS NOT NULL) AS fallback_sum,
       SUM(components_count) FILTER (WHERE components_count IS NOT NULL) AS component_sum
     FROM nutrition_v3_metrics
     WHERE created_at >= NOW() - make_interval(hours => $1)`,
    [safeHours],
  );
  const r = row.rows[0];
  const totalEvents = Number(r?.total_events || 0);
  const failEvents = Number(r?.fail_events || 0);
  const successEvents = Number(r?.success_events || 0);
  const successRate = totalEvents > 0 ? Math.round((successEvents / totalEvents) * 1000) / 10 : null;
  const avgDurationMs = r?.avg_duration_ms != null ? Math.round(Number(r.avg_duration_ms)) : null;
  const avgComponents = r?.avg_components != null ? Math.round(Number(r.avg_components) * 10) / 10 : null;
  const fallbackSum = Number(r?.fallback_sum || 0);
  const componentSum = Number(r?.component_sum || 0);
  const fallbackRate = componentSum > 0 ? Math.round((fallbackSum / componentSum) * 1000) / 10 : null;
  return {
    windowHours: safeHours,
    totalEvents,
    failEvents,
    successRate,
    avgDurationMs,
    avgComponents,
    fallbackRate,
  };
}

export async function getNutritionV3DurationHistogram(
  pool: Pool,
  windowHours = 24,
): Promise<Array<{ endpoint: string; bucket: string; count: number }>> {
  const safeHours = Math.max(1, Math.min(24 * 14, Number(windowHours) || 24));
  const rows = await pool.query<{ endpoint: string; bucket: string; count: string }>(
    `SELECT
       COALESCE(endpoint, 'unknown') AS endpoint,
       CASE
         WHEN duration_ms < 250 THEN 'le_250ms'
         WHEN duration_ms < 500 THEN 'le_500ms'
         WHEN duration_ms < 1000 THEN 'le_1000ms'
         WHEN duration_ms < 3000 THEN 'le_3000ms'
         ELSE 'gt_3000ms'
       END AS bucket,
       COUNT(*)::bigint AS count
     FROM nutrition_v3_metrics
     WHERE created_at >= NOW() - make_interval(hours => $1)
       AND duration_ms IS NOT NULL
     GROUP BY 1, 2
     ORDER BY 1, 2`,
    [safeHours],
  );
  return rows.rows.map((r) => ({
    endpoint: r.endpoint,
    bucket: r.bucket,
    count: Number(r.count || 0),
  }));
}

export async function pruneNutritionV3Metrics(
  pool: Pool,
  retentionDays = 30,
): Promise<number> {
  const safeDays = Math.max(7, Math.min(365, Number(retentionDays) || 30));
  const res = await pool.query<{ id: string }>(
    `DELETE FROM nutrition_v3_metrics
     WHERE created_at < NOW() - make_interval(days => $1)
     RETURNING id`,
    [safeDays],
  );
  return res.rowCount ?? 0;
}

export async function getNutritionV3AlertWindows(
  pool: Pool,
  params?: {
    windowHours?: number;
    bucketMinutes?: number;
    minSuccessRate?: number;
    maxAvgDurationMs?: number;
    maxFallbackRate?: number;
  },
): Promise<
  Array<{
    windowStart: string;
    totalEvents: number;
    successRate: number | null;
    avgDurationMs: number | null;
    fallbackRate: number | null;
    alerts: string[];
    status: 'ok' | 'degraded';
  }>
> {
  const windowHours = Math.max(1, Math.min(24 * 14, Number(params?.windowHours) || 24));
  const bucketMinutes = Math.max(5, Math.min(120, Number(params?.bucketMinutes) || 30));
  const minSuccessRate = Number(params?.minSuccessRate) || 95;
  const maxAvgDurationMs = Number(params?.maxAvgDurationMs) || 3000;
  const maxFallbackRate = Number(params?.maxFallbackRate) || 35;

  const rows = await pool.query<{
    bucket_start: string;
    total_events: string;
    success_events: string;
    avg_duration_ms: string | null;
    fallback_sum: string | null;
    component_sum: string | null;
  }>(
    `SELECT
       to_char(
         date_trunc('minute', created_at)
         - make_interval(mins => (extract(minute from created_at)::int % $2)),
         'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
       ) AS bucket_start,
       COUNT(*)::bigint AS total_events,
       COUNT(*) FILTER (WHERE event LIKE '%_ok')::bigint AS success_events,
       AVG(duration_ms) FILTER (WHERE duration_ms IS NOT NULL) AS avg_duration_ms,
       SUM(fallback_count) FILTER (WHERE fallback_count IS NOT NULL) AS fallback_sum,
       SUM(components_count) FILTER (WHERE components_count IS NOT NULL) AS component_sum
     FROM nutrition_v3_metrics
     WHERE created_at >= NOW() - make_interval(hours => $1)
     GROUP BY 1
     ORDER BY 1 DESC`,
    [windowHours, bucketMinutes],
  );

  return rows.rows.map((r) => {
    const total = Number(r.total_events || 0);
    const success = Number(r.success_events || 0);
    const successRate = total > 0 ? Math.round((success / total) * 1000) / 10 : null;
    const avgDurationMs = r.avg_duration_ms != null ? Math.round(Number(r.avg_duration_ms)) : null;
    const fallbackSum = Number(r.fallback_sum || 0);
    const componentSum = Number(r.component_sum || 0);
    const fallbackRate = componentSum > 0 ? Math.round((fallbackSum / componentSum) * 1000) / 10 : null;
    const alerts: string[] = [];
    if ((successRate ?? 100) < minSuccessRate) alerts.push(`success-rate-below-${minSuccessRate}`);
    if ((avgDurationMs ?? 0) > maxAvgDurationMs) alerts.push(`avg-duration-above-${maxAvgDurationMs}ms`);
    if ((fallbackRate ?? 0) > maxFallbackRate) alerts.push(`fallback-rate-above-${maxFallbackRate}`);
    return {
      windowStart: r.bucket_start,
      totalEvents: total,
      successRate,
      avgDurationMs,
      fallbackRate,
      alerts,
      status: alerts.length > 0 ? 'degraded' : 'ok',
    };
  });
}

function incidentSeverity(alerts: string[]): 'info' | 'warning' | 'critical' {
  if (alerts.some((a) => a.includes('success-rate'))) return 'critical';
  if (alerts.some((a) => a.includes('avg-duration'))) return 'warning';
  return 'warning';
}

export async function syncNutritionV3Incidents(
  pool: Pool,
  params?: {
    windowHours?: number;
    bucketMinutes?: number;
    minSuccessRate?: number;
    maxAvgDurationMs?: number;
    maxFallbackRate?: number;
  },
): Promise<{ opened: number; resolved: number }> {
  const windows = await getNutritionV3AlertWindows(pool, params);
  let opened = 0;
  let resolved = 0;

  for (const w of windows.filter((x) => x.status === 'degraded')) {
    for (const alertKey of w.alerts) {
      const incidentKey = `${alertKey}:${w.windowStart}`;
      const severity = incidentSeverity([alertKey]);
      const exists = await pool.query<{ id: string }>(
        `SELECT id FROM nutrition_v3_incidents WHERE incident_key = $1`,
        [incidentKey],
      );
      await pool.query(
        `INSERT INTO nutrition_v3_incidents (incident_key, severity, status, alert_keys, started_at, last_seen_at, meta)
         VALUES ($1, $2, 'open', $3::jsonb, $4::timestamptz, NOW(), $5::jsonb)
         ON CONFLICT (incident_key) DO UPDATE SET
           last_seen_at = NOW(),
           status = CASE WHEN nutrition_v3_incidents.status = 'resolved' THEN 'open' ELSE nutrition_v3_incidents.status END,
           resolved_at = CASE WHEN nutrition_v3_incidents.status = 'resolved' THEN NULL ELSE nutrition_v3_incidents.resolved_at END,
           meta = EXCLUDED.meta`,
        [
          incidentKey,
          severity,
          JSON.stringify([alertKey]),
          w.windowStart,
          JSON.stringify({ windowStart: w.windowStart, alerts: w.alerts }),
        ],
      );
      if (!exists.rows[0]?.id) opened += 1;
    }
  }

  const openRows = await pool.query<{ incident_key: string; alert_keys: unknown }>(
    `SELECT incident_key, alert_keys FROM nutrition_v3_incidents WHERE status = 'open'`,
  );
  const activeKeys = new Set(
    windows
      .filter((w) => w.status === 'degraded')
      .flatMap((w) => w.alerts.map((a) => `${a}:${w.windowStart}`)),
  );

  for (const row of openRows.rows) {
    if (!activeKeys.has(row.incident_key)) {
      await pool.query(
        `UPDATE nutrition_v3_incidents
         SET status = 'resolved', resolved_at = NOW(), last_seen_at = NOW()
         WHERE incident_key = $1 AND status = 'open'`,
        [row.incident_key],
      );
      resolved += 1;
    }
  }

  return { opened, resolved };
}

export async function listNutritionV3Incidents(
  pool: Pool,
  params?: { status?: 'open' | 'resolved' | 'all'; limit?: number },
): Promise<
  Array<{
    id: string;
    incidentKey: string;
    severity: string;
    status: string;
    alertKeys: string[];
    startedAt: string;
    resolvedAt: string | null;
    lastSeenAt: string;
  }>
> {
  const status = params?.status ?? 'all';
  const limit = Math.max(1, Math.min(200, Number(params?.limit) || 50));
  const where = status === 'all' ? '' : 'WHERE status = $2';
  const queryParams: Array<string | number> = status === 'all' ? [limit] : [limit, status];
  const rows = await pool.query<{
    id: string;
    incident_key: string;
    severity: string;
    status: string;
    alert_keys: unknown;
    started_at: string;
    resolved_at: string | null;
    last_seen_at: string;
  }>(
    `SELECT id, incident_key, severity, status, alert_keys, started_at, resolved_at, last_seen_at
     FROM nutrition_v3_incidents
     ${where}
     ORDER BY last_seen_at DESC
     LIMIT $1`,
    queryParams,
  );
  return rows.rows.map((r) => ({
    id: r.id,
    incidentKey: r.incident_key,
    severity: r.severity,
    status: r.status,
    alertKeys: Array.isArray(r.alert_keys) ? (r.alert_keys as string[]) : [],
    startedAt: r.started_at,
    resolvedAt: r.resolved_at,
    lastSeenAt: r.last_seen_at,
  }));
}
