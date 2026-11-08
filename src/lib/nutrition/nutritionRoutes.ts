import type { Express, Request, Response } from 'express';
import type { Pool } from 'pg';

type AuthRequest = Request & { userId?: number };

function parseImageDataUrl(url: string): { mimeType: string; data: string } | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}
import { completeMealAnalysis, resolveAiCapabilities } from '../../../aiProviders';
import type { Food } from '../foodDatabase';
import { fetchOffCatalogFoods } from '../openFoodFactsFetch';
import { searchAppCustomFoods } from '../server/appCustomFoods';
import { tierFoodsFromOffPool } from '../catalogSearch';
import type { MealIntent } from './schemas';
import { applyUserFoodPreferencesToPipeline } from './pipeline/applyUserPreferences';
import {
  analysisToMealIntent,
  intentToPipelineInput,
  pipelineToLegacyResolve,
  recomputePipelineFromReview,
} from './pipeline/legacyAdapter';
import { refreshPipelineTotals } from './pipeline/refreshPipeline';
import {
  resolveMealComponent,
  resolveBarcode,
  resolvedLineToIngredient,
  resolveCatalogFoodByIdAny,
} from './catalog/resolveComponent';
import { buildNutritionLabelScanPrompt } from './buildMealParsePrompts';
import { NutritionLabelScanSchema } from './schemas';
import { normalizeLabelToPer100g } from './nutritionLabelNormalize';
import { insertAppCustomFoodWithBarcode } from './catalog/appCustomFoodsBarcode';
import { searchGenericBaselines, getGenericBaselineById } from './catalog/genericBaselineResolver';
import { buildPortionOptions } from './portionCatalog';
import { toGrams } from './portionCatalog';
import { checkMealPlausibility } from './plausibilityCheck';
import { parseMealPhotoToIntent, parseMealTextToIntent } from './parseMealText';
import {
  ensureUserFoodPortionPrefsTable,
  getUserPortionPrefsForFoods,
  upsertUserPortionPref,
  type UserPortionPref,
} from './userFoodPortionPrefs';
import { getUserFoodChoiceBoostsForHint } from './userFoodPortionPrefs';
import { NutritionAIService } from './pipeline/NutritionAIService';
import { FoodDatabaseService } from './pipeline/FoodDatabaseService';
import { OpenFoodFactsClient } from './pipeline/OpenFoodFactsClient';
import {
  createGenericWithAiForComponent,
  findPersistedGenericFoodCandidate,
} from './pipeline/ensurePipelineGenericFood';
import { MealAnalysisService } from './pipeline/MealAnalysisService';
import {
  getCachedPipelineResult,
  setCachedPipelineResult,
} from './pipeline/pipelineInputCache';
import { MealLogRepository } from './pipeline/MealLogRepository';
import { PipelineResultSchema } from './pipeline/schemas';
import { buildE2eNutritionPipelineMock } from './pipeline/e2eNutritionMock';
import {
  getNutritionV3MetricsPrometheus,
  getNutritionV3StatsSnapshot,
  recordNutritionV3Metric,
} from './pipeline/pipelineMetrics';
import {
  diffMacroTotals,
  macroTotalsFromPipeline,
  type MacroTotals,
} from './pipeline/reprocessDiff';
import { validateV3ProcessBody } from './pipeline/v3RequestValidation';
import {
  endpointFromEvent,
  ensureNutritionMetricsTable,
  getNutritionV3AlertWindows,
  getNutritionV3DbStats,
  getNutritionV3DurationHistogram,
  getNutritionV3UxSummary,
  hashUserId,
  listNutritionV3Incidents,
  pruneNutritionV3Metrics,
  storeNutritionV3UxEvent,
  storeNutritionMetricEvent,
  syncNutritionV3Incidents,
} from './pipeline/nutritionMetricsStore';

export function isNutritionLogEnabled(): boolean {
  const v = process.env.NUTRITION_LOG_V2?.trim().toLowerCase();
  if (v === 'false' || v === '0') return false;
  return true;
}

type ApiErrorCode =
  | 'unauthorized'
  | 'missing-id'
  | 'missing-input'
  | 'missing-reviewed-components'
  | 'invalid-input'
  | 'rate-limit'
  | 'not-found'
  | 'pipeline-failed'
  | 'reprocess-failed'
  | 'update-failed'
  | 'finalize-failed';

function makeTraceId(): string {
  return `nt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function sendApiError(
  res: Response,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, unknown>,
): string {
  const traceId = makeTraceId();
  res.status(status).json({
    error: code,
    code,
    message,
    traceId,
    ...(details ? { details } : {}),
  });
  return traceId;
}

function extractJsonObject(raw: string): unknown {
  const t = raw.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no-json');
  return JSON.parse(t.slice(start, end + 1));
}

function normalizeLegacySource(source: string): 'openfoodfacts' | 'estimated_fallback' | 'chain_menu_data' {
  if (source === 'openfoodfacts') return 'openfoodfacts';
  return 'estimated_fallback';
}

function buildPipelineFallbackFromLegacy(args: {
  text?: string;
  inputType: 'text' | 'image';
  intent: MealIntent;
  lines: Array<{
    foodId: string;
    source: 'openfoodfacts' | 'generic_baseline' | 'app';
    displayName: string;
    grams: number;
    per100g: { kcal: number; protein: number; carbs: number; fat: number };
    matchScore: number;
    requiresCandidatePick?: boolean;
    candidates?: Array<{ foodId: string; displayName: string; matchScore: number; source: string }>;
  }>;
  plausibilityIssues: Array<{ message: string; severity: 'warning' | 'error' }>;
}): unknown {
  const components = args.lines.map((line, idx) => ({
    id: `legacy-${idx + 1}`,
    name: line.displayName,
    role: 'ingredient',
    estimated_grams: Math.max(1, Math.round(line.grams)),
    gram_confidence: line.requiresCandidatePick ? 'medium' : 'high',
    gram_reasoning: 'legacy-fallback-estimate',
    is_cooked: false,
    cooking_method: null,
    search_strategy: {
      primary: [line.displayName],
      secondary: [],
      generic_fallback: [],
      off_database_fallback: 'generic_unknown',
      openfoodfacts_categories: [],
      barcode_hint: null,
    },
  }));

  const matches = args.lines.map((line, idx) => {
    const primary = {
      rank: 1 as const,
      score: Math.max(1, Math.min(99, Math.round((line.matchScore || 0.6) * 100))),
      source_step: 'primary' as const,
      openfoodfacts_id: line.foodId.startsWith('off_') ? line.foodId.slice(4) : null,
      product_name: line.displayName,
      brand: null,
      kcal_100g: line.per100g.kcal,
      protein_100g: line.per100g.protein,
      carbs_100g: line.per100g.carbs,
      fat_100g: line.per100g.fat,
      fiber_100g: null,
      serving_size: null,
      data_completeness: 'full' as const,
      data_source: normalizeLegacySource(line.source),
    };
    const alt = (line.candidates ?? []).slice(0, 2).map((c, i) => ({
      rank: (i + 2) as 2 | 3,
      score: Math.max(1, Math.min(99, Math.round((c.matchScore || 0.5) * 100))),
      source_step: 'secondary' as const,
      openfoodfacts_id: c.foodId.startsWith('off_') ? c.foodId.slice(4) : null,
      product_name: c.displayName,
      brand: null,
      kcal_100g: line.per100g.kcal,
      protein_100g: line.per100g.protein,
      carbs_100g: line.per100g.carbs,
      fat_100g: line.per100g.fat,
      fiber_100g: null,
      serving_size: null,
      data_completeness: 'partial' as const,
      data_source: normalizeLegacySource(line.source),
    }));
    return {
      component_id: `legacy-${idx + 1}`,
      component_name: line.displayName,
      estimated_grams: Math.max(1, Math.round(line.grams)),
      confidence: line.requiresCandidatePick ? 'medium' : 'high',
      search_steps_executed: ['legacy-resolve'],
      candidates: [primary, ...alt].slice(0, 3),
      auto_selected_rank: 1,
      requires_user_review: false,
      review_reasons: [],
    };
  });

  const nutritionLines = args.lines.map((line, idx) => {
    const factor = Math.max(0.01, line.grams / 100);
    return {
      component_id: `legacy-${idx + 1}`,
      component_name: line.displayName,
      grams: Math.max(1, Math.round(line.grams)),
      data_source: normalizeLegacySource(line.source),
      confidence_score: Math.max(1, Math.min(99, Math.round((line.matchScore || 0.6) * 100))),
      kcal: Math.round(line.per100g.kcal * factor),
      protein: Math.round(line.per100g.protein * factor * 10) / 10,
      carbs: Math.round(line.per100g.carbs * factor * 10) / 10,
      fat: Math.round(line.per100g.fat * factor * 10) / 10,
      fiber: null,
    };
  });

  const totals = nutritionLines.reduce(
    (acc, c) => ({
      kcal: acc.kcal + c.kcal,
      protein: Math.round((acc.protein + c.protein) * 10) / 10,
      carbs: Math.round((acc.carbs + c.carbs) * 10) / 10,
      fat: Math.round((acc.fat + c.fat) * 10) / 10,
    }),
    { kcal: 0, protein: 0, carbs: 0, fat: 0 },
  );

  return {
    state: 'AWAITING_REVIEW',
    analysis: {
      input_type: args.inputType,
      input_language: 'de',
      meal_name: args.intent.items.map((i) => i.label).join(', ') || args.text || 'Mahlzeit',
      meal_category: 'mixed',
      cuisine: null,
      total_estimated_weight_g: Math.max(1, Math.round(args.lines.reduce((s, l) => s + l.grams, 0))),
      portion_context: 'legacy-fallback',
      confidence_overall: 'medium',
      is_chain_restaurant: false,
      chain_name: null,
      components,
      notes: null,
      image_analysis: null,
    },
    matches,
    components: nutritionLines,
    totals,
    sanityWarnings: args.plausibilityIssues.map((p) => p.message),
    user_review_required: false,
    pipeline_version: 'nutrition-v3-legacy-fallback',
    ai_model_used: 'legacy-fallback',
  };
}

async function cacheOffProduct(pool: Pool, food: Food): Promise<void> {
  if (!food.id.startsWith('off_')) return;
  const barcode = food.id.slice(4);
  try {
    await pool.query(
      `INSERT INTO catalog_product_cache (barcode, food_id, payload, fetched_at)
       VALUES ($1, $2, $3::jsonb, NOW())
       ON CONFLICT (barcode) DO UPDATE SET payload = EXCLUDED.payload, fetched_at = NOW()`,
      [barcode, food.id, JSON.stringify(food)],
    );
  } catch {
    /* table may not exist yet */
  }
}

export async function ensureNutritionSchema(pool: Pool): Promise<void> {
  await pool.query(`ALTER TABLE user_custom_foods ADD COLUMN IF NOT EXISTS barcode VARCHAR(32)`);
  await pool.query(`ALTER TABLE user_custom_foods ADD COLUMN IF NOT EXISTS label_scan_meta JSONB`);
  await pool.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_user_custom_foods_barcode_unique ON user_custom_foods (barcode) WHERE barcode IS NOT NULL`,
  );
  await pool.query(`
    CREATE TABLE IF NOT EXISTS catalog_product_cache (
      barcode VARCHAR(32) PRIMARY KEY,
      food_id VARCHAR(64) NOT NULL,
      payload JSONB NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_ai_runs_v2 (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      input_text TEXT,
      meal_intent JSONB,
      resolved_lines JSONB,
      user_corrections JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS input_type VARCHAR(12)`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS original_input TEXT`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS meal_category VARCHAR(40)`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS cuisine VARCHAR(80)`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS total_fiber NUMERIC NOT NULL DEFAULT 0`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS ai_model_used VARCHAR(80)`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS pipeline_version VARCHAR(32)`);
  await pool.query(`ALTER TABLE nutrition ADD COLUMN IF NOT EXISTS user_reviewed BOOLEAN NOT NULL DEFAULT false`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition_log_components (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      nutrition_id UUID NOT NULL REFERENCES nutrition(id) ON DELETE CASCADE,
      component_id VARCHAR(80),
      food_name VARCHAR(320) NOT NULL,
      openfoodfacts_id VARCHAR(64),
      product_name VARCHAR(320) NOT NULL,
      brand VARCHAR(200),
      grams NUMERIC NOT NULL,
      kcal NUMERIC NOT NULL,
      protein_g NUMERIC NOT NULL DEFAULT 0,
      carbs_g NUMERIC NOT NULL DEFAULT 0,
      fat_g NUMERIC NOT NULL DEFAULT 0,
      fiber_g NUMERIC,
      data_source VARCHAR(40) NOT NULL,
      confidence_score NUMERIC NOT NULL DEFAULT 0,
      user_modified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_nutrition_log_components_nid ON nutrition_log_components(nutrition_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_food_preferences (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ingredient_key VARCHAR(220) NOT NULL,
      preferred_openfoodfacts_id VARCHAR(64) NOT NULL,
      preferred_product_name VARCHAR(320),
      preferred_grams NUMERIC,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, ingredient_key)
    )
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_user_food_preferences_user ON user_food_preferences(user_id)`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nutrition_v3_input_cache (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      input_hash VARCHAR(64) NOT NULL,
      input_normalized TEXT NOT NULL,
      pipeline_result JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, input_hash)
    )
  `);
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_nutrition_v3_input_cache_updated ON nutrition_v3_input_cache(user_id, updated_at DESC)`,
  );
  await ensureNutritionMetricsTable(pool);
  await ensureUserFoodPortionPrefsTable(pool);
}

export function registerNutritionRoutes(
  app: Express,
  pool: Pool,
  requireAuth: (req: AuthRequest, res: Response, next: () => void) => void,
): void {
  const pipelineDatabase = new FoodDatabaseService(new OpenFoodFactsClient(), {
    findPersistedGenericFood: (component) => findPersistedGenericFoodCandidate(pool, component),
    createGenericWithAi: (component) =>
      createGenericWithAiForComponent(pool, component, completeMealAnalysis),
  });
  const pipelineService = new NutritionAIService(new MealAnalysisService(), pipelineDatabase);
  const mealLogRepo = new MealLogRepository(pool);
  const e2eMockEnabled = () =>
    ['1', 'true', 'yes'].includes(String(process.env.NUTRITION_E2E_MOCK ?? '').toLowerCase());

  const countFallback = (result: { matches: Array<{ candidates: Array<{ data_source: string }> }> }) =>
    result.matches.filter((m) => m.candidates[0]?.data_source === 'estimated_fallback').length;

  const retentionDays = Math.max(7, Math.min(365, Number(process.env.NUTRITION_V3_METRICS_RETENTION_DAYS) || 30));
  const cleanupEveryMs = Math.max(60_000, Number(process.env.NUTRITION_V3_METRICS_CLEANUP_MS) || 3_600_000);
  setInterval(() => {
    void pruneNutritionV3Metrics(pool, retentionDays).catch(() => {
      /* ignore background cleanup errors */
    });
  }, cleanupEveryMs);

  const logMetric = async (
    event: 'process_ok' | 'process_fail' | 'finalize_ok' | 'finalize_fail' | 'update_ok' | 'update_fail',
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
    },
  ) => {
    recordNutritionV3Metric(event, payload);
    try {
      await storeNutritionMetricEvent(pool, event, {
        durationMs: payload.durationMs,
        components: payload.components,
        fallbackCount: payload.fallbackCount,
        error: payload.error,
        endpoint: endpointFromEvent(event),
        inputType: payload.inputType ?? null,
        userIdHash: hashUserId(payload.userId),
      });
      void syncNutritionV3Incidents(pool).catch(() => {
        /* background incident sync */
      });
    } catch {
      /* metrics persistence should never break main request */
    }
  };

  const rateWindowMs = Math.max(15_000, Number(process.env.NUTRITION_V3_RATE_WINDOW_MS) || 60_000);
  const rateMax = Math.max(5, Number(process.env.NUTRITION_V3_RATE_MAX) || 40);
  const rateBucket = new Map<string, { count: number; resetAt: number }>();
  const isRateLimited = (key: string): boolean => {
    const now = Date.now();
    const state = rateBucket.get(key);
    if (!state || now > state.resetAt) {
      rateBucket.set(key, { count: 1, resetAt: now + rateWindowMs });
      return false;
    }
    state.count += 1;
    if (state.count > rateMax) return true;
    rateBucket.set(key, state);
    return false;
  };

  app.get('/api/nutrition/v3/stats', requireAuth, async (req: AuthRequest, res) => {
    const windowHours = Number((req.query as { windowHours?: string }).windowHours ?? 24);
    const memory = getNutritionV3StatsSnapshot();
    const persisted = await getNutritionV3DbStats(pool, windowHours).catch(() => null);
    const ux = await getNutritionV3UxSummary(pool, windowHours).catch(() => null);
    res.json({
      memory,
      persisted,
      ux,
    });
  });

  app.post('/api/nutrition/v3/ux-events', requireAuth, async (req: AuthRequest, res) => {
    const body = req.body as {
      eventName?: string;
      inputType?: string;
      source?: string;
      success?: boolean;
      durationMs?: number;
      componentsCount?: number;
      correctionsCount?: number;
      traceId?: string;
    };
    const eventName = String(body.eventName ?? '').trim().toLowerCase();
    if (!eventName) {
      sendApiError(res, 400, 'invalid-input', 'eventName fehlt.');
      return;
    }
    if (!/^[a-z0-9_-]{3,48}$/.test(eventName)) {
      sendApiError(res, 422, 'invalid-input', 'eventName hat ungültiges Format.');
      return;
    }
    try {
      await storeNutritionV3UxEvent(pool, {
        eventName,
        inputType: body.inputType ? String(body.inputType).slice(0, 12) : null,
        source: body.source ? String(body.source).slice(0, 24) : null,
        success: typeof body.success === 'boolean' ? body.success : null,
        durationMs: Number.isFinite(body.durationMs) ? Number(body.durationMs) : null,
        componentsCount: Number.isFinite(body.componentsCount) ? Number(body.componentsCount) : null,
        correctionsCount: Number.isFinite(body.correctionsCount) ? Number(body.correctionsCount) : null,
        userIdHash: hashUserId(req.userId ?? null),
        traceId: body.traceId ? String(body.traceId).slice(0, 40) : null,
      });
      res.json({ ok: true });
    } catch (error) {
      console.error('nutrition/v3/ux-events:', error);
      sendApiError(res, 500, 'pipeline-failed', 'UX-Event konnte nicht gespeichert werden.');
    }
  });

  app.get('/api/nutrition/v3/metrics', requireAuth, async (req: AuthRequest, res) => {
    const windowHours = Number((req.query as { windowHours?: string }).windowHours ?? 24);
    const dbHistogram = await getNutritionV3DurationHistogram(pool, windowHours).catch(() => []);
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(getNutritionV3MetricsPrometheus(dbHistogram));
  });

  app.get('/api/nutrition/v3/incidents', requireAuth, async (req: AuthRequest, res) => {
    const q = req.query as { status?: string; limit?: string; sync?: string };
    if (q.sync === '1' || q.sync === 'true') {
      await syncNutritionV3Incidents(pool).catch(() => null);
    }
    const statusRaw = String(q.status ?? 'all');
    const status =
      statusRaw === 'open' || statusRaw === 'resolved' ? statusRaw : ('all' as const);
    const incidents = await listNutritionV3Incidents(pool, {
      status,
      limit: Number(q.limit ?? 50),
    });
    res.json({ incidents });
  });

  app.get('/api/nutrition/v3/alerts', requireAuth, async (req: AuthRequest, res) => {
    const q = req.query as {
      windowHours?: string;
      bucketMinutes?: string;
      minSuccessRate?: string;
      maxAvgDurationMs?: string;
      maxFallbackRate?: string;
      limit?: string;
      sync?: string;
    };
    const sync = q.sync === '1' || q.sync === 'true';
    if (sync) await syncNutritionV3Incidents(pool).catch(() => null);
    const windows = await getNutritionV3AlertWindows(pool, {
      windowHours: Number(q.windowHours ?? 24),
      bucketMinutes: Number(q.bucketMinutes ?? 30),
      minSuccessRate: Number(q.minSuccessRate ?? 95),
      maxAvgDurationMs: Number(q.maxAvgDurationMs ?? 3000),
      maxFallbackRate: Number(q.maxFallbackRate ?? 35),
    });
    const limit = Math.max(1, Math.min(200, Number(q.limit ?? 50) || 50));
    const degraded = windows.filter((w) => w.status === 'degraded').slice(0, limit);
    const openIncidents = await listNutritionV3Incidents(pool, { status: 'open', limit: 20 }).catch(() => []);
    res.json({
      windowHours: Number(q.windowHours ?? 24),
      bucketMinutes: Number(q.bucketMinutes ?? 30),
      degradedCount: degraded.length,
      degradedWindows: degraded,
      openIncidents,
    });
  });

  app.post('/api/nutrition/v3/:nutritionId/reprocess', requireAuth, async (req: AuthRequest, res) => {
    const startedAt = Date.now();
    const userId = req.userId;
    if (userId == null) {
      sendApiError(res, 401, 'unauthorized', 'Authentifizierung erforderlich.');
      return;
    }
    const rlKey = `reprocess:${userId}:${req.ip ?? 'unknown'}`;
    if (isRateLimited(rlKey)) {
      res.setHeader('Retry-After', String(Math.ceil(rateWindowMs / 1000)));
      sendApiError(res, 429, 'rate-limit', 'Zu viele Reprocess-Anfragen. Bitte kurz warten.');
      return;
    }
    const nutritionId = String(req.params.nutritionId ?? '').trim();
    if (!nutritionId) {
      sendApiError(res, 400, 'missing-id', 'Nutrition-ID fehlt.');
      return;
    }
    const validated = validateV3ProcessBody(req.body as { text?: string; imageDataUrl?: string });
    if (validated.ok === false) {
      sendApiError(res, 400, 'invalid-input', 'Ungültige Reprocess-Eingabe.', { reason: validated.error });
      return;
    }
    try {
      const owned = await pool.query<{ calories: string; protein: string; carbs: string; fat: string }>(
        `SELECT calories, protein, carbs, fat FROM nutrition WHERE id = $1 AND user_id = $2`,
        [nutritionId, userId],
      );
      if (!owned.rows[0]) {
        sendApiError(res, 404, 'not-found', 'Nutrition-Eintrag nicht gefunden.');
        return;
      }
      const previousTotals: MacroTotals = {
        kcal: Math.round(Number(owned.rows[0].calories || 0)),
        protein: Math.round(Number(owned.rows[0].protein || 0) * 10) / 10,
        carbs: Math.round(Number(owned.rows[0].carbs || 0) * 10) / 10,
        fat: Math.round(Number(owned.rows[0].fat || 0) * 10) / 10,
      };
      let result =
        e2eMockEnabled() && validated.text && !validated.imageDataUrl
          ? buildE2eNutritionPipelineMock(validated.text)
          : await pipelineService.process({
              text: validated.text,
              imageDataUrl: validated.imageDataUrl,
            });
      result = await applyUserFoodPreferencesToPipeline(pool, userId, result);
      result = refreshPipelineTotals(result);
      const newTotals = macroTotalsFromPipeline(result);
      await logMetric('process_ok', {
        durationMs: Date.now() - startedAt,
        components: result.matches.length,
        fallbackCount: countFallback(result),
        inputType: result.analysis.input_type,
        userId,
      });
      res.json({
        result,
        previousTotals,
        newTotals,
        delta: diffMacroTotals(previousTotals, newTotals),
      });
    } catch (error) {
      console.error('nutrition/v3/reprocess:', error);
      await logMetric('process_fail', {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'unknown',
        userId,
      });
      sendApiError(res, 500, 'reprocess-failed', 'Reprocess fehlgeschlagen.');
    }
  });

  app.patch('/api/nutrition/v3/:nutritionId', requireAuth, async (req: AuthRequest, res) => {
    const startedAt = Date.now();
    const userId = req.userId;
    if (userId == null) {
      sendApiError(res, 401, 'unauthorized', 'Authentifizierung erforderlich.');
      return;
    }
    const nutritionId = String(req.params.nutritionId ?? '').trim();
    if (!nutritionId) {
      sendApiError(res, 400, 'missing-id', 'Nutrition-ID fehlt.');
      return;
    }
    const body = req.body as {
      result?: unknown;
      reviewedComponents?: Array<{
        component_id: string;
        grams: number;
        selectedRank?: number;
        user_modified?: boolean;
        displayUnit?: 'g' | 'piece';
        pieceGrams?: number | null;
      }>;
      originalInput?: string;
      date?: string;
      category?: string;
      preferenceUpdates?: Array<{
        ingredientKey: string;
        preferredOpenfoodfactsId: string;
        preferredProductName?: string | null;
        preferredGrams?: number | null;
      }>;
    };
    const reviewedComponents = Array.isArray(body.reviewedComponents) ? body.reviewedComponents : [];
    if (reviewedComponents.length === 0) {
      sendApiError(res, 400, 'missing-reviewed-components', 'Mindestens eine geprüfte Komponente ist erforderlich.');
      return;
    }
    try {
      const parsedResult = recomputePipelineFromReview(
        PipelineResultSchema.parse(body.result),
        reviewedComponents.map((c) => ({
          component_id: c.component_id,
          grams: c.grams,
          selectedRank: c.selectedRank ?? 1,
        })),
      );
      await mealLogRepo.updateReviewedMeal({
        nutritionId,
        userId,
        result: parsedResult,
        reviewedComponents,
        originalInput: String(body.originalInput ?? ''),
        date: body.date,
        category: body.category,
      });
      const preferenceUpdates = Array.isArray(body.preferenceUpdates) ? body.preferenceUpdates : [];
      for (const update of preferenceUpdates) {
        if (!update?.ingredientKey || !update.preferredOpenfoodfactsId) continue;
        await mealLogRepo.upsertUserFoodPreference({
          userId,
          ingredientKey: update.ingredientKey,
          preferredOpenfoodfactsId: update.preferredOpenfoodfactsId,
          preferredProductName: update.preferredProductName ?? null,
          preferredGrams: update.preferredGrams ?? null,
        });
      }
      await logMetric('update_ok', {
        durationMs: Date.now() - startedAt,
        components: reviewedComponents.length,
        fallbackCount: countFallback(parsedResult),
        inputType: parsedResult.analysis.input_type,
        userId,
      });
      res.json({ id: nutritionId, ok: true });
    } catch (error) {
      console.error('nutrition/v3/update:', error);
      await logMetric('update_fail', {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'unknown',
        userId,
      });
      const msg = error instanceof Error ? error.message : '';
      if (msg === 'nutrition-not-found') {
        sendApiError(res, 404, 'not-found', 'Nutrition-Eintrag nicht gefunden.');
        return;
      }
      sendApiError(res, 500, 'update-failed', 'Update fehlgeschlagen.');
    }
  });

  async function buildLegacyProcessFallback(validated: { text?: string; imageDataUrl?: string }, userId: number | null) {
    const intent = validated.imageDataUrl
      ? await parseMealPhotoToIntent(validated.text ?? '', validated.imageDataUrl)
      : await parseMealTextToIntent(validated.text ?? '');
    const lines = [];
    for (const item of intent.items) {
      for (const comp of item.components) {
        const hint = comp.foodHint || comp.rawText;
        const boosts = userId != null ? await getUserFoodChoiceBoostsForHint(pool, userId, hint) : new Map<string, number>();
        const line = await resolveMealComponent(pool, comp, {
          userId,
          choiceBoosts: boosts,
          expertMode: false,
        });
        lines.push(line);
      }
    }
    const ingredients = lines.map(resolvedLineToIngredient);
    const totals = ingredients.reduce(
      (acc, ing) => ({
        kcal: acc.kcal + (ing.calories ?? 0),
        protein: acc.protein + (ing.protein ?? 0),
        carbs: acc.carbs + (ing.carbs ?? 0),
        fat: acc.fat + (ing.fat ?? 0),
      }),
      { kcal: 0, protein: 0, carbs: 0, fat: 0 },
    );
    const plausibilityIssues = checkMealPlausibility(totals);
    let fallbackResult = PipelineResultSchema.parse(
      buildPipelineFallbackFromLegacy({
        text: validated.text,
        inputType: validated.imageDataUrl ? 'image' : 'text',
        intent,
        lines,
        plausibilityIssues,
      }),
    );
    if (userId != null) {
      fallbackResult = await applyUserFoodPreferencesToPipeline(pool, userId, fallbackResult);
      fallbackResult = refreshPipelineTotals(fallbackResult);
    }
    return fallbackResult;
  }

  app.post('/api/nutrition/v3/process', requireAuth, async (req: AuthRequest, res) => {
    const startedAt = Date.now();
    const userId = req.userId ?? null;
    const rlKey = `process:${userId ?? 'anon'}:${req.ip ?? 'unknown'}`;
    if (isRateLimited(rlKey)) {
      res.setHeader('Retry-After', String(Math.ceil(rateWindowMs / 1000)));
      sendApiError(res, 429, 'rate-limit', 'Zu viele Analyse-Anfragen. Bitte kurz warten.');
      return;
    }
    const validated = validateV3ProcessBody(req.body as { text?: string; imageDataUrl?: string });
    if (validated.ok === false) {
      sendApiError(res, 400, 'invalid-input', 'Ungültige Analyse-Eingabe.', { reason: validated.error });
      return;
    }
    const aiCaps = resolveAiCapabilities();
    const forceLegacyFallback = !aiCaps.enabled && !e2eMockEnabled();
    try {
      if (forceLegacyFallback) {
        const fallbackResult = await buildLegacyProcessFallback(validated, userId);
        await logMetric('process_ok', {
          durationMs: Date.now() - startedAt,
          components: fallbackResult.matches.length,
          fallbackCount: countFallback(fallbackResult),
          inputType: fallbackResult.analysis.input_type,
          userId,
          aiProvider: aiCaps.provider,
          aiConfigured: false,
          fallbackReason: 'ai-disabled',
        });
        res.json(fallbackResult);
        return;
      }
      let result =
        e2eMockEnabled() && validated.text && !validated.imageDataUrl
          ? buildE2eNutritionPipelineMock(validated.text)
          : null;

      if (!result && userId != null && validated.text && !validated.imageDataUrl) {
        result = await getCachedPipelineResult(pool, userId, validated.text);
      }

      if (!result) {
        result =
          e2eMockEnabled() && validated.text && !validated.imageDataUrl
            ? buildE2eNutritionPipelineMock(validated.text)
            : await pipelineService.process({
                text: validated.text,
                imageDataUrl: validated.imageDataUrl,
              });
      }

      if (userId != null) {
        result = await applyUserFoodPreferencesToPipeline(pool, userId, result);
      }
      result = refreshPipelineTotals(result);

      if (
        userId != null &&
        validated.text?.trim() &&
        !validated.imageDataUrl &&
        !e2eMockEnabled()
      ) {
        await setCachedPipelineResult(pool, userId, validated.text, result);
      }
      const durationMs = Date.now() - startedAt;
      await logMetric('process_ok', {
        durationMs,
        components: result.matches.length,
        fallbackCount: countFallback(result),
        inputType: result.analysis.input_type,
        userId,
        aiProvider: aiCaps.provider,
        aiConfigured: aiCaps.enabled,
      });
      res.json(result);
    } catch (error) {
      console.error('nutrition/v3/process:', error);
      await logMetric('process_fail', {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'unknown',
        userId,
        aiProvider: aiCaps.provider,
        aiConfigured: aiCaps.enabled,
      });
      try {
        const fallbackResult = await buildLegacyProcessFallback(validated, userId);
        await logMetric('process_ok', {
          durationMs: Date.now() - startedAt,
          components: fallbackResult.matches.length,
          fallbackCount: countFallback(fallbackResult),
          inputType: fallbackResult.analysis.input_type,
          userId,
          aiProvider: aiCaps.provider,
          aiConfigured: aiCaps.enabled,
          fallbackReason: 'pipeline-catch',
        });
        res.json(fallbackResult);
        return;
      } catch (fallbackError) {
        console.error('nutrition/v3/process fallback failed:', fallbackError);
      }
      sendApiError(res, 500, 'pipeline-failed', 'Analyse fehlgeschlagen.', {
        aiProvider: aiCaps.provider,
        aiConfigured: aiCaps.enabled,
        deepseekConfigured: aiCaps.deepseekConfigured,
        mistralConfigured: aiCaps.mistralConfigured,
        geminiConfigured: aiCaps.geminiConfigured,
      });
    }
  });

  app.post('/api/nutrition/v3/finalize', requireAuth, async (req: AuthRequest, res) => {
    const startedAt = Date.now();
    const userId = req.userId;
    if (userId == null) {
      sendApiError(res, 401, 'unauthorized', 'Authentifizierung erforderlich.');
      return;
    }
    const body = req.body as {
      result?: unknown;
      reviewedComponents?: Array<{
        component_id: string;
        grams: number;
        selectedRank?: number;
        user_modified?: boolean;
        displayUnit?: 'g' | 'piece';
        pieceGrams?: number | null;
      }>;
      originalInput?: string;
      date?: string;
      category?: string;
      preferenceUpdates?: Array<{
        ingredientKey: string;
        preferredOpenfoodfactsId: string;
        preferredProductName?: string | null;
        preferredGrams?: number | null;
      }>;
    };
    const reviewedComponents = Array.isArray(body.reviewedComponents) ? body.reviewedComponents : [];
    if (reviewedComponents.length === 0) {
      sendApiError(res, 400, 'missing-reviewed-components', 'Mindestens eine geprüfte Komponente ist erforderlich.');
      return;
    }
    try {
      const parsedResult = recomputePipelineFromReview(
        PipelineResultSchema.parse(body.result),
        reviewedComponents.map((c) => ({
          component_id: c.component_id,
          grams: c.grams,
          selectedRank: c.selectedRank ?? 1,
        })),
      );
      const id = await mealLogRepo.saveReviewedMeal({
        userId,
        result: parsedResult,
        reviewedComponents,
        originalInput: String(body.originalInput ?? ''),
        date: body.date,
        category: body.category,
      });
      const preferenceUpdates = Array.isArray(body.preferenceUpdates) ? body.preferenceUpdates : [];
      for (const update of preferenceUpdates) {
        if (!update?.ingredientKey || !update.preferredOpenfoodfactsId) continue;
        await mealLogRepo.upsertUserFoodPreference({
          userId,
          ingredientKey: update.ingredientKey,
          preferredOpenfoodfactsId: update.preferredOpenfoodfactsId,
          preferredProductName: update.preferredProductName ?? null,
          preferredGrams: update.preferredGrams ?? null,
        });
      }
      const originalInput = String(body.originalInput ?? '').trim();
      if (originalInput) {
        const withPrefs = await applyUserFoodPreferencesToPipeline(pool, userId, parsedResult);
        await setCachedPipelineResult(pool, userId, originalInput, refreshPipelineTotals(withPrefs));
      }
      await logMetric('finalize_ok', {
        durationMs: Date.now() - startedAt,
        components: reviewedComponents.length,
        fallbackCount: countFallback(parsedResult),
        inputType: parsedResult.analysis.input_type,
        userId,
      });
      res.json({ id, ok: true });
    } catch (error) {
      console.error('nutrition/v3/finalize:', error);
      await logMetric('finalize_fail', {
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : 'unknown',
        userId,
      });
      sendApiError(res, 500, 'finalize-failed', 'Finalize fehlgeschlagen.');
    }
  });

  app.post('/api/nutrition/v3/preferences', requireAuth, async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (userId == null) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const body = req.body as {
      updates?: Array<{
        ingredientKey: string;
        preferredOpenfoodfactsId: string;
        preferredProductName?: string | null;
        preferredGrams?: number | null;
      }>;
    };
    const updates = Array.isArray(body.updates) ? body.updates : [];
    try {
      for (const update of updates) {
        if (!update?.ingredientKey || !update.preferredOpenfoodfactsId) continue;
        await mealLogRepo.upsertUserFoodPreference({
          userId,
          ingredientKey: update.ingredientKey,
          preferredOpenfoodfactsId: update.preferredOpenfoodfactsId,
          preferredProductName: update.preferredProductName ?? null,
          preferredGrams: update.preferredGrams ?? null,
        });
      }
      res.json({ ok: true });
    } catch (error) {
      console.error('nutrition/v3/preferences:', error);
      res.status(500).json({ error: 'preferences-failed' });
    }
  });

  app.post('/api/nutrition/parse', requireAuth, async (req: AuthRequest, res) => {
    const body = req.body as { text?: string; imageDataUrl?: string };
    const text = String(body.text ?? '').trim();
    const imageDataUrl = String(body.imageDataUrl ?? '').trim();
    if (!text && !imageDataUrl) {
      res.status(400).json({ error: 'missing-text' });
      return;
    }
    try {
      const intent = imageDataUrl
        ? await parseMealPhotoToIntent(text, imageDataUrl)
        : await parseMealTextToIntent(text);
      res.json({
        intent,
        pipelineVersion: 'nutrition-v3-legacy-fallback',
      });
    } catch (err) {
      console.error('nutrition/parse:', err);
      res.status(500).json({ error: 'parse-failed' });
    }
  });

  app.post('/api/nutrition/resolve', requireAuth, async (req: AuthRequest, res) => {
    const body = req.body as { intent?: MealIntent; expertMode?: boolean };
    const intent = body.intent;
    const expertMode = body.expertMode === true;
    if (!intent?.items?.length) {
      res.status(400).json({ error: 'invalid-intent' });
      return;
    }
    try {
      const userId = req.userId;
      const lines = [];
      const foodIdsForPrefs: string[] = [];
      for (const item of intent.items) {
        for (const comp of item.components) {
          const hint = comp.foodHint || comp.rawText;
          const boosts =
            userId != null
              ? await getUserFoodChoiceBoostsForHint(pool, userId, hint)
              : new Map<string, number>();
          const line = await resolveMealComponent(pool, comp, {
            userId,
            choiceBoosts: boosts,
            expertMode,
          });
          lines.push(line);
          if (line.foodId && line.foodId !== 'generic_unknown') foodIdsForPrefs.push(line.foodId);
        }
      }
      if (userId != null && foodIdsForPrefs.length > 0) {
        const prefs = await getUserPortionPrefsForFoods(pool, userId, foodIdsForPrefs);
        for (let i = 0; i < lines.length; i++) {
          const pref = prefs.get(lines[i].foodId);
          if (!pref) continue;
          const food = await resolveCatalogFoodByIdAny(pool, lines[i].foodId);
          if (!food) continue;
          const opts = buildPortionOptions(food, pref);
          const sel = opts.find((o) => o.id === pref.portionId) ?? opts.find((o) => o.source === 'user_last');
          if (sel) {
            lines[i] = {
              ...lines[i],
              portionOptions: opts,
              selectedPortionId: sel.id,
              logUnit: sel.logUnit,
              quantity: pref.quantity,
              grams: toGrams({ ...sel, quantity: pref.quantity }),
            };
          }
        }
      }
      const ingredients = lines.map(resolvedLineToIngredient);
      const totals = ingredients.reduce(
        (acc, ing) => ({
          kcal: acc.kcal + (ing.calories ?? 0),
          protein: acc.protein + (ing.protein ?? 0),
          carbs: acc.carbs + (ing.carbs ?? 0),
          fat: acc.fat + (ing.fat ?? 0),
        }),
        { kcal: 0, protein: 0, carbs: 0, fat: 0 },
      );
      const plausibilityIssues = checkMealPlausibility(totals);
      let runId: string | null = null;
      try {
        const ins = await pool.query<{ id: string }>(
          `INSERT INTO meal_ai_runs_v2 (user_id, input_text, meal_intent, resolved_lines)
           VALUES ($1, $2, $3::jsonb, $4::jsonb)
           RETURNING id`,
          [
            req.userId ?? null,
            intent.items.map((i) => i.label).join(', '),
            JSON.stringify(intent),
            JSON.stringify(lines),
          ],
        );
        runId = ins.rows[0]?.id ?? null;
      } catch {
        /* telemetry optional */
      }
      res.json({ lines, ingredients, plausibilityIssues, runId });
    } catch (err) {
      console.error('nutrition/resolve:', err);
      res.status(500).json({ error: 'resolve-failed' });
    }
  });

  app.post('/api/nutrition/portion-prefs', requireAuth, async (req: AuthRequest, res) => {
    const userId = req.userId;
    if (userId == null) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    const body = req.body as { prefs?: UserPortionPref[] };
    const prefs = Array.isArray(body.prefs) ? body.prefs : [];
    try {
      for (const p of prefs) {
        if (!p?.foodId || !p.portionId) continue;
        await upsertUserPortionPref(pool, userId, p);
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('portion-prefs:', err);
      res.status(500).json({ error: 'save-failed' });
    }
  });

  app.post('/api/nutrition/feedback', requireAuth, async (req: AuthRequest, res) => {
    const userId = req.userId;
    const body = req.body as {
      runId?: string;
      corrections?: Array<{
        foodHint: string;
        originalFoodId: string;
        chosenFoodId: string;
      }>;
    };
    const corrections = body.corrections ?? [];
    if (!corrections.length) {
      res.json({ ok: true });
      return;
    }
    try {
      if (body.runId) {
        await pool.query(
          `UPDATE meal_ai_runs_v2 SET user_corrections = $1::jsonb WHERE id = $2 AND user_id = $3`,
          [JSON.stringify(corrections), body.runId, userId ?? null],
        );
      } else if (userId != null) {
        await pool.query(
          `INSERT INTO meal_ai_runs_v2 (user_id, user_corrections) VALUES ($1, $2::jsonb)`,
          [userId, JSON.stringify(corrections)],
        );
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('nutrition/feedback:', err);
      res.status(500).json({ error: 'feedback-failed' });
    }
  });

  app.get('/api/foods/search', requireAuth, async (req, res) => {
    const q = String(req.query.q ?? '').trim();
    if (q.length < 1) {
      res.json({ strong: [], similar: [] });
      return;
    }
    try {
      const maxStrong = 20;
      const maxSimilar = 24;
      const pageSize = q.length < 2 ? 20 : 40;
      const [{ foods: offFoods }, appFoods, generic] = await Promise.all([
        fetchOffCatalogFoods(q, pageSize),
        searchAppCustomFoods(pool, q, 16),
        Promise.resolve(searchGenericBaselines(q, 16)),
      ]);
      const merged = [...offFoods, ...appFoods, ...generic];
      const tiered = tierFoodsFromOffPool(q, merged, maxStrong, maxSimilar);
      res.json(tiered);
    } catch (err) {
      console.error('foods/search:', err);
      res.status(502).json({ error: 'search-failed' });
    }
  });

  app.get('/api/foods/:foodId', requireAuth, async (req, res) => {
    const foodId = String(req.params.foodId ?? '').trim();
    let food: Food | null = null;
    if (foodId.startsWith('generic_')) food = getGenericBaselineById(foodId);
    else if (foodId.startsWith('ucf_')) {
      const { getAppCustomFoodById } = await import('../server/appCustomFoods');
      food = await getAppCustomFoodById(pool, foodId);
    } else if (foodId.startsWith('off_')) {
      const code = foodId.slice(4).replace(/\D/g, '');
      const { fetchOpenFoodFactsByBarcode } = await import('../openFoodFactsFetch');
      food = await fetchOpenFoodFactsByBarcode(code);
      if (food) await cacheOffProduct(pool, food);
    }
    if (!food) {
      res.status(404).json({ error: 'food-not-found' });
      return;
    }
    let userPref: UserPortionPref | null = null;
    const uid = (req as AuthRequest).userId;
    if (uid != null) {
      const prefs = await getUserPortionPrefsForFoods(pool, uid, [foodId]);
      userPref = prefs.get(foodId) ?? null;
    }
    res.json({ food, portionOptions: buildPortionOptions(food, userPref) });
  });

  app.post('/api/nutrition/scan-nutrition-label', requireAuth, async (req: AuthRequest, res) => {
    const body = req.body as { imageDataUrl?: string };
    const image = String(body.imageDataUrl ?? '').trim();
    if (!image.startsWith('data:image/')) {
      res.status(400).json({ error: 'invalid-image' });
      return;
    }
    try {
      const prompt = buildNutritionLabelScanPrompt();
      const img = parseImageDataUrl(image);
      if (!img) {
        res.status(400).json({ error: 'invalid-image' });
        return;
      }
      const raw = await completeMealAnalysis(prompt, img, { responseMode: 'json_object' });
      const parsed = NutritionLabelScanSchema.parse(extractJsonObject(raw));
      const normalized = normalizeLabelToPer100g(parsed);
      res.json({ scan: parsed, nutrientsPer100g: normalized.nutrients, warnings: normalized.warnings });
    } catch (err) {
      console.error('scan-nutrition-label:', err);
      res.status(500).json({ error: 'label-scan-failed' });
    }
  });

  app.post('/api/foods/app-custom/barcode', requireAuth, async (req: AuthRequest, res) => {
    const body = req.body as {
      barcode?: string;
      name?: string;
      category?: Food['category'];
      packQuantity?: number;
      packUnit?: string;
      nutrientsPer100g?: Food['nutrients'];
      labelScanMeta?: Record<string, unknown>;
    };
    const barcode = String(body.barcode ?? '').replace(/\D/g, '');
    const name = String(body.name ?? '').trim();
    const nutrients = body.nutrientsPer100g;
    if (barcode.length < 8 || !name || !nutrients) {
      res.status(400).json({ error: 'invalid-payload' });
      return;
    }
    const packQty = Math.max(1, Number(body.packQuantity) || 100);
    const packUnit = String(body.packUnit ?? 'g').toLowerCase();
    const isMl = packUnit === 'ml';
    const servingName = isMl ? `1 Dose (${packQty} ml)` : `1 Packung (${packQty} g)`;
    try {
      const food = await insertAppCustomFoodWithBarcode(pool, {
        name,
        category: body.category ?? 'readymeal',
        nutrients,
        servings: [
          { name: '100 g', grams: 100 },
          { name: servingName, grams: packQty },
        ],
        barcode,
        source: 'barcode_label_scan',
        labelScanMeta: body.labelScanMeta,
      });
      res.json({ food, portionOptions: buildPortionOptions(food) });
    } catch (err) {
      console.error('app-custom/barcode:', err);
      res.status(500).json({ error: 'save-failed' });
    }
  });
}

export async function resolveBarcodeForApi(
  pool: Pool,
  code: string,
): Promise<{ food: Food; source: string } | null> {
  return resolveBarcode(pool, code);
}
