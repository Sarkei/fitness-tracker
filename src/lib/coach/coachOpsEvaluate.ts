import type { CoachOpsMetrics } from './coachOpsMetrics';

export type CoachOpsThresholds = {
  maxErrorRate: number;
  maxRefineErrorRate: number;
  minRefineSamples: number;
};

export const DEFAULT_COACH_OPS_THRESHOLDS: CoachOpsThresholds = {
  maxErrorRate: Number(process.env.COACH_OPS_MAX_ERROR_RATE || '0.35'),
  maxRefineErrorRate: Number(process.env.COACH_OPS_MAX_REFINE_ERROR_RATE || '0.4'),
  minRefineSamples: Number(process.env.COACH_OPS_MIN_REFINE_SAMPLES || '3'),
};

export type CoachOpsEvaluation = {
  ok: boolean;
  severity: 'ok' | 'degraded' | 'critical';
  failures: string[];
  metrics: CoachOpsMetrics;
};

export function evaluateCoachOpsMetrics(
  metrics: CoachOpsMetrics,
  thresholds: CoachOpsThresholds = DEFAULT_COACH_OPS_THRESHOLDS,
): CoachOpsEvaluation {
  const failures: string[] = [];

  if (metrics.status === 'critical' || metrics.errorRate > thresholds.maxErrorRate) {
    failures.push(
      `errorRate ${metrics.errorRate} (status=${metrics.status}, max=${thresholds.maxErrorRate})`,
    );
  }
  if (
    metrics.refine.total >= thresholds.minRefineSamples &&
    metrics.refine.errorRate > thresholds.maxRefineErrorRate
  ) {
    failures.push(
      `refine errorRate ${metrics.refine.errorRate} (samples=${metrics.refine.total}, max=${thresholds.maxRefineErrorRate})`,
    );
  }

  const severity: CoachOpsEvaluation['severity'] =
    metrics.status === 'critical' || failures.length > 0
      ? 'critical'
      : metrics.status === 'degraded'
        ? 'degraded'
        : 'ok';

  return {
    ok: failures.length === 0,
    severity,
    failures,
    metrics,
  };
}

export const evaluateLoadedMetrics = evaluateCoachOpsMetrics;

export function formatCoachOpsAlertMessage(ev: CoachOpsEvaluation, context?: string): string {
  const m = ev.metrics;
  const head = context ? `[${context}] ` : '';
  const lines = [
    `${head}Coach Ops — ${ev.severity.toUpperCase()}`,
    `Window: ${m.windowHours}h · Runs: ${m.totalRuns} · Errors: ${m.errorRuns} (${(m.errorRate * 100).toFixed(1)}%)`,
    `Refine: ${m.refine.errors}/${m.refine.total} · Report: ${m.weeklyReport.errors}/${m.weeklyReport.total}`,
    `Active plans: ${m.activePlans} · Avg latency: ${m.avgLatencyMs}ms`,
  ];
  if (ev.failures.length) {
    lines.push(`Failures: ${ev.failures.join('; ')}`);
  }
  return lines.join('\n');
}
