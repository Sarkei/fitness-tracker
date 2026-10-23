import { z } from 'zod';
import { getNutritionV3StatsSnapshot, getNutritionV3MetricsPrometheus } from '../src/lib/nutrition/pipeline/pipelineMetrics';

const V3StatsSchema = z.object({
  memory: z.object({
    counters: z.record(z.string(), z.union([z.number(), z.string(), z.null()])),
    successRate: z.number().nullable(),
    avgDurationMs: z.number().nullable(),
    avgComponentsPerMeal: z.number().nullable(),
    fallbackRate: z.number().nullable(),
  }),
  persisted: z
    .object({
      windowHours: z.number(),
      totalEvents: z.number(),
      failEvents: z.number(),
      successRate: z.number().nullable(),
      avgDurationMs: z.number().nullable(),
      avgComponents: z.number().nullable(),
      fallbackRate: z.number().nullable(),
    })
    .nullable(),
});

const HealthNutritionSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  alerts: z.array(z.string()),
});

function assert(cond: boolean, message: string) {
  if (!cond) throw new Error(message);
}

const memory = getNutritionV3StatsSnapshot();
V3StatsSchema.parse({ memory, persisted: null });

const metricsText = getNutritionV3MetricsPrometheus();
assert(metricsText.includes('# TYPE nutrition_v3_process_ok_total counter'), 'process metric type missing');
assert(metricsText.includes('nutrition_v3_success_rate_percent'), 'success rate metric missing');

HealthNutritionSchema.parse({
  status: 'ok',
  alerts: [],
});

console.log('nutrition-v3-contract-selftest: OK');
