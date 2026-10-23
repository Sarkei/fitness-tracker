import { api } from '@/src/lib/api';
import type { MealIntent, ResolvedFoodLine } from '@/src/lib/nutrition/schemas';
import type { Food } from '@/src/lib/foodDatabase';
import type { PortionOption } from '@/src/lib/nutrition/schemas';
import type { Ingredient } from '@/src/types';
import type { PipelineResult } from '@/src/lib/nutrition/pipeline/schemas';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function parseMealText(text: string): Promise<MealIntent> {
  const data = await api<{ intent: MealIntent }>('/api/nutrition/parse', {
    method: 'POST',
    body: JSON.stringify({ text }),
  });
  return data.intent;
}

export async function parseMealPhoto(
  imageDataUrl: string,
  text = '',
): Promise<MealIntent> {
  const data = await api<{ intent: MealIntent }>('/api/nutrition/parse', {
    method: 'POST',
    body: JSON.stringify({ text, imageDataUrl }),
  });
  return data.intent;
}

export type PlausibilityIssue = {
  code: string;
  severity: 'warning' | 'error';
  message: string;
};

export async function resolveMealIntent(
  intent: MealIntent,
  options?: { expertMode?: boolean },
): Promise<{
  lines: ResolvedFoodLine[];
  ingredients: Ingredient[];
  plausibilityIssues?: PlausibilityIssue[];
  runId?: string | null;
}> {
  const data = await api<{
    lines: ResolvedFoodLine[];
    ingredients: Ingredient[];
    plausibilityIssues?: PlausibilityIssue[];
    runId?: string | null;
  }>('/api/nutrition/resolve', {
    method: 'POST',
    body: JSON.stringify({ intent, expertMode: options?.expertMode === true }),
  });
  return data;
}

export async function savePortionPrefs(
  prefs: Array<{ foodId: string; portionId: string; logUnit: string; quantity: number }>,
): Promise<void> {
  if (prefs.length === 0) return;
  await api('/api/nutrition/portion-prefs', {
    method: 'POST',
    body: JSON.stringify({ prefs }),
  });
}

export async function submitMealFeedback(payload: {
  runId?: string | null;
  corrections: Array<{ foodHint: string; originalFoodId: string; chosenFoodId: string }>;
}): Promise<void> {
  if (payload.corrections.length === 0) return;
  await api('/api/nutrition/feedback', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function searchFoodsV2(query: string): Promise<{ strong: Food[]; similar: Food[] }> {
  return api<{ strong: Food[]; similar: Food[] }>(
    `/api/foods/search?q=${encodeURIComponent(query)}`,
  );
}

export async function fetchFoodV2(foodId: string): Promise<{ food: Food; portionOptions: PortionOption[] }> {
  return api<{ food: Food; portionOptions: PortionOption[] }>(
    `/api/foods/${encodeURIComponent(foodId)}`,
  );
}

export async function scanNutritionLabel(imageDataUrl: string): Promise<{
  nutrientsPer100g: { calories: number; protein: number; carbs: number; fat: number };
  warnings: string[];
}> {
  return api<{
    nutrientsPer100g: { calories: number; protein: number; carbs: number; fat: number };
    warnings: string[];
  }>('/api/nutrition/scan-nutrition-label', {
    method: 'POST',
    body: JSON.stringify({ imageDataUrl }),
  });
}

export async function saveBarcodeCustomFood(payload: {
  barcode: string;
  name: string;
  category?: Food['category'];
  packQuantity: number;
  packUnit: string;
  nutrientsPer100g: Food['nutrients'];
  labelScanMeta?: Record<string, unknown>;
}): Promise<{ food: Food; portionOptions: PortionOption[] }> {
  return api<{ food: Food; portionOptions: PortionOption[] }>('/api/foods/app-custom/barcode', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function fetchFoodByBarcodeV2(
  code: string,
): Promise<{ food: Food; source: string } | { notFound: true; barcode: string }> {
  try {
    return await api<{ food: Food; source: string }>(
      `/api/foods/barcode/${encodeURIComponent(code)}`,
    );
  } catch (e) {
    if (e instanceof Error && e.message === 'product-not-found') {
      return { notFound: true, barcode: code.replace(/\D/g, '') };
    }
    throw e;
  }
}

export async function processNutritionPipelineV3(payload: {
  text?: string;
  imageDataUrl?: string;
  retries?: number;
}): Promise<PipelineResult> {
  const retries = Math.max(0, Math.min(3, Number(payload.retries ?? 1)));
  let attempt = 0;
  while (attempt <= retries) {
    try {
      return await api<PipelineResult>('/api/nutrition/v3/process', {
        method: 'POST',
        body: JSON.stringify({ text: payload.text, imageDataUrl: payload.imageDataUrl }),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      const retryable = msg === 'rate-limit' || msg === 'pipeline-failed';
      if (!retryable || attempt >= retries) throw error;
      await sleep(300 * (attempt + 1));
      attempt += 1;
    }
  }
  throw new Error('pipeline-failed');
}

export async function trackNutritionV3UxEvent(payload: {
  eventName: string;
  inputType?: 'text' | 'image' | 'mixed';
  source?: string;
  success?: boolean;
  durationMs?: number;
  componentsCount?: number;
  correctionsCount?: number;
  traceId?: string;
}): Promise<void> {
  await api('/api/nutrition/v3/ux-events', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type NutritionReprocessDelta = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
};

export async function reprocessNutritionPipelineV3(payload: {
  nutritionId: string;
  text?: string;
  imageDataUrl?: string;
}): Promise<{
  result: PipelineResult;
  previousTotals: NutritionReprocessDelta;
  newTotals: NutritionReprocessDelta;
  delta: NutritionReprocessDelta;
}> {
  return api(`/api/nutrition/v3/${encodeURIComponent(payload.nutritionId)}/reprocess`, {
    method: 'POST',
    body: JSON.stringify({
      text: payload.text,
      imageDataUrl: payload.imageDataUrl,
    }),
  });
}

export async function updateNutritionPipelineV3(payload: {
  nutritionId: string;
  result: PipelineResult;
  reviewedComponents: Array<{
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
}): Promise<{ id: string; ok: true }> {
  return api<{ id: string; ok: true }>(
    `/api/nutrition/v3/${encodeURIComponent(payload.nutritionId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(payload),
    },
  );
}

export async function fetchNutritionV3Stats(): Promise<{
  counters: Record<string, number | string | null>;
  successRate: number | null;
  avgDurationMs: number | null;
  avgComponentsPerMeal: number | null;
  fallbackRate: number | null;
}> {
  return api('/api/nutrition/v3/stats');
}

export async function finalizeNutritionPipelineV3(payload: {
  result: PipelineResult;
  reviewedComponents: Array<{
    component_id: string;
    grams: number;
    selectedRank?: number;
    user_modified?: boolean;
    displayUnit?: 'g' | 'piece';
    pieceGrams?: number | null;
  }>;
  originalInput: string;
  date?: string;
  category?: string;
  preferenceUpdates?: Array<{
    ingredientKey: string;
    preferredOpenfoodfactsId: string;
    preferredProductName?: string | null;
    preferredGrams?: number | null;
  }>;
}): Promise<{ id: string; ok: true }> {
  return api<{ id: string; ok: true }>('/api/nutrition/v3/finalize', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function saveNutritionPreferencesV3(payload: {
  updates: Array<{
    ingredientKey: string;
    preferredOpenfoodfactsId: string;
    preferredProductName?: string | null;
    preferredGrams?: number | null;
  }>;
}): Promise<void> {
  if (payload.updates.length === 0) return;
  await api('/api/nutrition/v3/preferences', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type NutritionLogComponentRow = {
  component_id: string | null;
  food_name: string;
  openfoodfacts_id: string | null;
  product_name: string;
  brand: string | null;
  grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number | null;
  data_source: string;
  confidence_score: number;
  user_modified: boolean;
  created_at?: string;
};

export async function fetchNutritionLogComponents(nutritionId: string): Promise<NutritionLogComponentRow[]> {
  const data = await api<{ components: NutritionLogComponentRow[] }>(
    `/api/nutrition/${encodeURIComponent(nutritionId)}/components`,
  );
  return Array.isArray(data.components) ? data.components : [];
}
