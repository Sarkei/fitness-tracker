import assert from 'node:assert/strict';
import {
  evaluateCoachOpsMetrics,
  formatCoachOpsAlertMessage,
} from '../src/lib/coach/coachOpsEvaluate.ts';
import type { CoachOpsMetrics } from '../src/lib/coach/coachOpsMetrics.ts';

const base: CoachOpsMetrics = {
  windowHours: 24,
  totalRuns: 10,
  errorRuns: 1,
  errorRate: 0.1,
  zodFailureRate: 0.05,
  avgLatencyMs: 1200,
  byEndpoint: [],
  refine: { total: 5, errors: 1, errorRate: 0.2 },
  weeklyReport: { total: 2, errors: 0, errorRate: 0 },
  activePlans: 3,
  status: 'ok',
};

const ok = evaluateCoachOpsMetrics(base);
assert.equal(ok.ok, true);
assert.equal(ok.severity, 'ok');

const bad = evaluateCoachOpsMetrics({
  ...base,
  status: 'critical',
  errorRate: 0.5,
  refine: { total: 10, errors: 5, errorRate: 0.5 },
});
assert.equal(bad.ok, false);
assert.ok(bad.failures.length > 0);
assert.ok(formatCoachOpsAlertMessage(bad).includes('CRITICAL'));

console.log('coach-ops-evaluate-selftest: OK');
