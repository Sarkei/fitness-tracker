import type { MetricEndpoint } from './nutritionMetricsStore';

type MetricEvent =
  | 'process_ok'
  | 'process_fail'
  | 'finalize_ok'
  | 'finalize_fail'
  | 'update_ok'
  | 'update_fail';

type DurationBucket = 'le_250ms' | 'le_500ms' | 'le_1000ms' | 'le_3000ms' | 'gt_3000ms';

type Counters = {
  process_ok: number;
  process_fail: number;
  finalize_ok: number;
  finalize_fail: number;
  update_ok: number;
  update_fail: number;
  totalDurationMs: number;
  totalComponents: number;
  totalFallbackMatches: number;
  lastError: string | null;
  lastEvent: MetricEvent | null;
  lastEventAt: string | null;
};

const DURATION_BUCKETS: DurationBucket[] = ['le_250ms', 'le_500ms', 'le_1000ms', 'le_3000ms', 'gt_3000ms'];

function emptyHistogram(): Record<DurationBucket, number> {
  return { le_250ms: 0, le_500ms: 0, le_1000ms: 0, le_3000ms: 0, gt_3000ms: 0 };
}

const histogramByEndpoint: Record<MetricEndpoint, Record<DurationBucket, number>> = {
  process: emptyHistogram(),
  finalize: emptyHistogram(),
  update: emptyHistogram(),
};

const counters: Counters = {
  process_ok: 0,
  process_fail: 0,
  finalize_ok: 0,
  finalize_fail: 0,
  update_ok: 0,
  update_fail: 0,
  totalDurationMs: 0,
  totalComponents: 0,
  totalFallbackMatches: 0,
  lastError: null,
  lastEvent: null,
  lastEventAt: null,
};

export function durationBucketForMs(durationMs: number): DurationBucket {
  if (durationMs < 250) return 'le_250ms';
  if (durationMs < 500) return 'le_500ms';
  if (durationMs < 1000) return 'le_1000ms';
  if (durationMs < 3000) return 'le_3000ms';
  return 'gt_3000ms';
}

export function endpointFromMetricEvent(event: MetricEvent): MetricEndpoint {
  if (event.startsWith('process')) return 'process';
  if (event.startsWith('finalize')) return 'finalize';
  return 'update';
}

export function recordNutritionV3Duration(endpoint: MetricEndpoint, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 0) return;
  const bucket = durationBucketForMs(durationMs);
  histogramByEndpoint[endpoint][bucket] += 1;
}

export function recordNutritionV3Metric(
  event: MetricEvent,
  payload: {
    durationMs?: number;
    components?: number;
    fallbackCount?: number;
    error?: string;
    inputType?: string | null;
    userId?: number | null;
    aiProvider?: string;
    aiConfigured?: boolean;
    fallbackReason?: string;
  } = {},
): void {
  counters[event] += 1;
  if (payload.durationMs != null) {
    counters.totalDurationMs += payload.durationMs;
    recordNutritionV3Duration(endpointFromMetricEvent(event), payload.durationMs);
  }
  if (payload.components != null) counters.totalComponents += payload.components;
  if (payload.fallbackCount != null) counters.totalFallbackMatches += payload.fallbackCount;
  counters.lastEvent = event;
  counters.lastEventAt = new Date().toISOString();
  if (payload.error) counters.lastError = payload.error;

  console.info(
    '[nutrition-v3]',
    JSON.stringify({
      event,
      ts: counters.lastEventAt,
      ...payload,
    }),
  );
}

export function getNutritionV3StatsSnapshot() {
  const success =
    counters.process_ok + counters.finalize_ok + counters.update_ok;
  const fail = counters.process_fail + counters.finalize_fail + counters.update_fail;
  const total = success + fail;
  return {
    counters: { ...counters },
    histogramByEndpoint: {
      process: { ...histogramByEndpoint.process },
      finalize: { ...histogramByEndpoint.finalize },
      update: { ...histogramByEndpoint.update },
    },
    successRate: total > 0 ? Math.round((success / total) * 1000) / 10 : null,
    avgDurationMs:
      success > 0 ? Math.round(counters.totalDurationMs / Math.max(1, success)) : null,
    avgComponentsPerMeal:
      success > 0 ? Math.round((counters.totalComponents / success) * 10) / 10 : null,
    fallbackRate:
      counters.totalComponents > 0
        ? Math.round((counters.totalFallbackMatches / counters.totalComponents) * 1000) / 10
        : null,
  };
}

function fmtMetric(name: string, value: number | null): string {
  if (value == null || !Number.isFinite(value)) return `${name} 0`;
  return `${name} ${value}`;
}

function histogramPrometheusLines(
  prefix: string,
  endpoint: MetricEndpoint,
  buckets: Record<DurationBucket, number>,
): string[] {
  const lines: string[] = [
    `# HELP ${prefix}_duration_ms Histogram buckets for nutrition v3 ${endpoint}`,
    `# TYPE ${prefix}_duration_ms histogram`,
  ];
  let cumulative = 0;
  for (const bucket of DURATION_BUCKETS) {
    cumulative += buckets[bucket] ?? 0;
    lines.push(`${prefix}_duration_ms_bucket{endpoint="${endpoint}",le="${bucket}"} ${cumulative}`);
  }
  lines.push(`${prefix}_duration_ms_count{endpoint="${endpoint}"} ${cumulative}`);
  return lines;
}

/** Prometheus-kompatibler Export für einfache Observability ohne externe Tools. */
export function getNutritionV3MetricsPrometheus(
  dbHistogram?: Array<{ endpoint: string; bucket: string; count: number }>,
): string {
  const stats = getNutritionV3StatsSnapshot();
  const c = stats.counters;
  const lines = [
    '# HELP nutrition_v3_process_ok_total Successful v3 process calls',
    '# TYPE nutrition_v3_process_ok_total counter',
    `nutrition_v3_process_ok_total ${c.process_ok}`,
    '# HELP nutrition_v3_process_fail_total Failed v3 process calls',
    '# TYPE nutrition_v3_process_fail_total counter',
    `nutrition_v3_process_fail_total ${c.process_fail}`,
    '# HELP nutrition_v3_finalize_ok_total Successful v3 finalize calls',
    '# TYPE nutrition_v3_finalize_ok_total counter',
    `nutrition_v3_finalize_ok_total ${c.finalize_ok}`,
    '# HELP nutrition_v3_finalize_fail_total Failed v3 finalize calls',
    '# TYPE nutrition_v3_finalize_fail_total counter',
    `nutrition_v3_finalize_fail_total ${c.finalize_fail}`,
    '# HELP nutrition_v3_update_ok_total Successful v3 update calls',
    '# TYPE nutrition_v3_update_ok_total counter',
    `nutrition_v3_update_ok_total ${c.update_ok}`,
    '# HELP nutrition_v3_update_fail_total Failed v3 update calls',
    '# TYPE nutrition_v3_update_fail_total counter',
    `nutrition_v3_update_fail_total ${c.update_fail}`,
    '# HELP nutrition_v3_avg_duration_ms Average duration across successful calls',
    '# TYPE nutrition_v3_avg_duration_ms gauge',
    fmtMetric('nutrition_v3_avg_duration_ms', stats.avgDurationMs),
    '# HELP nutrition_v3_avg_components_per_meal Average reviewed components per successful call',
    '# TYPE nutrition_v3_avg_components_per_meal gauge',
    fmtMetric('nutrition_v3_avg_components_per_meal', stats.avgComponentsPerMeal),
    '# HELP nutrition_v3_fallback_rate_percent Fallback hit rate in percent',
    '# TYPE nutrition_v3_fallback_rate_percent gauge',
    fmtMetric('nutrition_v3_fallback_rate_percent', stats.fallbackRate),
    '# HELP nutrition_v3_success_rate_percent Success rate in percent',
    '# TYPE nutrition_v3_success_rate_percent gauge',
    fmtMetric('nutrition_v3_success_rate_percent', stats.successRate),
    ...histogramPrometheusLines('nutrition_v3', 'process', histogramByEndpoint.process),
    ...histogramPrometheusLines('nutrition_v3', 'finalize', histogramByEndpoint.finalize),
    ...histogramPrometheusLines('nutrition_v3', 'update', histogramByEndpoint.update),
  ];

  if (dbHistogram?.length) {
    const grouped = new Map<string, Record<string, number>>();
    for (const row of dbHistogram) {
      const ep = row.endpoint || 'unknown';
      if (!grouped.has(ep)) grouped.set(ep, {});
      grouped.get(ep)![row.bucket] = (grouped.get(ep)![row.bucket] ?? 0) + row.count;
    }
    lines.push('# HELP nutrition_v3_db_duration_ms Persisted duration histogram (24h)');
    lines.push('# TYPE nutrition_v3_db_duration_ms histogram');
    for (const [endpoint, buckets] of grouped) {
      let cumulative = 0;
      for (const bucket of ['le_250ms', 'le_500ms', 'le_1000ms', 'le_3000ms', 'gt_3000ms']) {
        cumulative += buckets[bucket] ?? 0;
        lines.push(
          `nutrition_v3_db_duration_ms_bucket{endpoint="${endpoint}",le="${bucket}"} ${cumulative}`,
        );
      }
      lines.push(`nutrition_v3_db_duration_ms_count{endpoint="${endpoint}"} ${cumulative}`);
    }
  }

  return lines.join('\n');
}

export function resetNutritionV3MetricsForTests(): void {
  counters.process_ok = 0;
  counters.process_fail = 0;
  counters.finalize_ok = 0;
  counters.finalize_fail = 0;
  counters.update_ok = 0;
  counters.update_fail = 0;
  counters.totalDurationMs = 0;
  counters.totalComponents = 0;
  counters.totalFallbackMatches = 0;
  counters.lastError = null;
  counters.lastEvent = null;
  counters.lastEventAt = null;
  histogramByEndpoint.process = emptyHistogram();
  histogramByEndpoint.finalize = emptyHistogram();
  histogramByEndpoint.update = emptyHistogram();
}
