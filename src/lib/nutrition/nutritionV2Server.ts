import type { Express, Request, Response } from 'express';
import type { Pool } from 'pg';

type AuthRequest = Request & { userId?: number };

function parseImageDataUrl(url: string): { mimeType: string; data: string } | null {
  const m = url.match(/^data:([^;]+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}
import { completeMealAnalysis } from '../../../aiProviders';
import type { Food } from '../foodDatabase';
import { fetchOffCatalogFoods } from '../openFoodFactsFetch';
import { searchAppCustomFoods } from '../server/appCustomFoods';
import { tierFoodsFromOffPool } from '../catalogSearch';
import { parseMealPhotoToIntent, parseMealTextToIntent } from './parseMealText';
import type { MealIntent } from './schemas';
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
import { checkMealPlausibility } from './plausibilityCheck';
import {
  ensureUserFoodPortionPrefsTable,
  getUserPortionPrefsForFoods,
  upsertUserPortionPref,
  type UserPortionPref,
} from './userFoodPortionPrefs';
import { getUserFoodChoiceBoostsForHint } from './userFoodPortionPrefs';

export function isNutritionLogV2Enabled(): boolean {
  const v = process.env.NUTRITION_LOG_V2?.trim().toLowerCase();
  if (v === 'false' || v === '0') return false;
  return true;
}

function extractJsonObject(raw: string): unknown {
  const t = raw.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no-json');
  return JSON.parse(t.slice(start, end + 1));
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

export async function ensureNutritionV2Schema(pool: Pool): Promise<void> {
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
  await ensureUserFoodPortionPrefsTable(pool);
}

export function registerNutritionV2Routes(
  app: Express,
  pool: Pool,
  requireAuth: (req: AuthRequest, res: Response, next: () => void) => void,
): void {
  app.post('/api/nutrition/v2/parse', requireAuth, async (req: AuthRequest, res) => {
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
      res.json({ intent });
    } catch (err) {
      console.error('nutrition/v2/parse:', err);
      res.status(500).json({ error: 'parse-failed' });
    }
  });

  app.post('/api/nutrition/v2/resolve', requireAuth, async (req: AuthRequest, res) => {
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
              grams: sel.grams * Math.max(0.01, pref.quantity),
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
      console.error('nutrition/v2/resolve:', err);
      res.status(500).json({ error: 'resolve-failed' });
    }
  });

  app.post('/api/nutrition/v2/portion-prefs', requireAuth, async (req: AuthRequest, res) => {
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

  app.post('/api/nutrition/v2/feedback', requireAuth, async (req: AuthRequest, res) => {
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
      console.error('nutrition/v2/feedback:', err);
      res.status(500).json({ error: 'feedback-failed' });
    }
  });

  app.get('/api/foods/v2/search', requireAuth, async (req, res) => {
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
        Promise.resolve(searchGenericBaselines(q, 12)),
      ]);
      const merged = [...offFoods, ...appFoods, ...generic];
      const tiered = tierFoodsFromOffPool(q, merged, maxStrong, maxSimilar);
      res.json(tiered);
    } catch (err) {
      console.error('foods/v2/search:', err);
      res.status(502).json({ error: 'search-failed' });
    }
  });

  app.get('/api/foods/v2/:foodId', requireAuth, async (req, res) => {
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

  app.post('/api/nutrition/v2/scan-nutrition-label', requireAuth, async (req: AuthRequest, res) => {
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
