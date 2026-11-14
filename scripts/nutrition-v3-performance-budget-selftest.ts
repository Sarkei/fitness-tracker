import {
  getNutritionV3StatsSnapshot,
  recordNutritionV3Metric,
  resetNutritionV3MetricsForTests,
} from '../src/lib/nutrition/pipeline/pipelineMetrics';

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

const maxAvgDurationMs = Number(process.env.NUTRITION_V3_MAX_AVG_DURATION_MS ?? 2500);
const maxFallbackRatePercent = Number(process.env.NUTRITION_V3_MAX_FALLBACK_RATE_PERCENT ?? 30);

resetNutritionV3MetricsForTests();
recordNutritionV3Metric('process_ok', { durationMs: 1200, components: 3, fallbackCount: 0 });
recordNutritionV3Metric('process_ok', { durationMs: 1800, components: 4, fallbackCount: 1 });
recordNutritionV3Metric('finalize_ok', { durationMs: 900, components: 3, fallbackCount: 0 });
recordNutritionV3Metric('update_ok', { durationMs: 1000, components: 2, fallbackCount: 0 });

const stats = getNutritionV3StatsSnapshot();
assert((stats.avgDurationMs ?? Number.MAX_SAFE_INTEGER) <= maxAvgDurationMs, `avg duration above budget ${maxAvgDurationMs}ms`);
assert((stats.fallbackRate ?? Number.MAX_SAFE_INTEGER) <= maxFallbackRatePercent, `fallback rate above budget ${maxFallbackRatePercent}%`);

console.log('nutrition-v3-performance-budget-selftest: OK', {
  avgDurationMs: stats.avgDurationMs,
  fallbackRate: stats.fallbackRate,
});
