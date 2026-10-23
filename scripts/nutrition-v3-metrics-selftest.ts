import {
  getNutritionV3StatsSnapshot,
  getNutritionV3MetricsPrometheus,
  recordNutritionV3Metric,
  resetNutritionV3MetricsForTests,
} from '../src/lib/nutrition/pipeline/pipelineMetrics';

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

resetNutritionV3MetricsForTests();
recordNutritionV3Metric('process_ok', { durationMs: 120, components: 2, fallbackCount: 1 });
recordNutritionV3Metric('process_ok', { durationMs: 4000, components: 2, fallbackCount: 0 });
recordNutritionV3Metric('finalize_ok', { durationMs: 80, components: 2, fallbackCount: 0 });
recordNutritionV3Metric('update_fail', { durationMs: 50, error: 'boom' });

const stats = getNutritionV3StatsSnapshot();
assert(Number(stats.counters.process_ok) === 2, 'process_ok should be 2');
assert(Number(stats.counters.finalize_ok) === 1, 'finalize_ok should be 1');
assert(Number(stats.counters.update_fail) === 1, 'update_fail should be 1');
assert(stats.successRate !== null, 'successRate should exist');
assert(stats.avgDurationMs !== null, 'avgDuration should exist');
assert(stats.fallbackRate !== null, 'fallbackRate should exist');
const text = getNutritionV3MetricsPrometheus();
assert(text.includes('nutrition_v3_process_ok_total 2'), 'prometheus export missing process_ok');
assert(text.includes('# TYPE nutrition_v3_success_rate_percent gauge'), 'prometheus type missing');
assert(text.includes('nutrition_v3_duration_ms_bucket{endpoint="process"'), 'histogram bucket missing');
assert(stats.histogramByEndpoint?.process?.gt_3000ms === 1, 'slow process bucket should be counted');

console.log('nutrition-v3-metrics-selftest: OK');
