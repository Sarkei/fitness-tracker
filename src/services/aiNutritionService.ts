/**
 * Mahlzeiten-Analyse: Parse (KI-Struktur) + Resolve (Katalog/OFF) über /api/nutrition/*.
 */

import type { MealAnalyzePhase } from '@/src/lib/mealAnalyzeProgress';
import type { MealIntent, ResolvedFoodLine } from '@/src/lib/nutrition/schemas';
import type { CustomFoodDraft, Ingredient, ProposedDbFood } from '@/src/types';
import { api } from '@/src/lib/api';
import { processNutritionPipelineV3 } from '@/src/services/nutritionLogService';

export interface DecomposeSanitizedFlags {
  dedupeMerged: boolean;
  stripParsedRemoved: number;
  stripResolvedRemoved: number;
  emptyStrippedGroups: number;
}

export interface AnalyzeMealResult {
  ingredients: Ingredient[];
  mealItemGroups?: { label: string; ingredients: Ingredient[] }[];
  proposedDbFoods: ProposedDbFood[];
  researchNote: string | null;
  offUnmatched?: string[];
  autoPersistedAppFoods?: string[];
  offCatalogEmpty?: boolean;
  decomposeSanitized: DecomposeSanitizedFlags | null;
  runId?: string | null;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const err = new Error('Aborted');
    err.name = 'AbortError';
    throw err;
  }
}

function formatAnalyzeMealFetchError(err: unknown): Error {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return err;
    const m = err.message.toLowerCase();
    if (
      m.includes('network error') ||
      m.includes('failed to fetch') ||
      m.includes('load failed') ||
      m.includes('networkrequestfailed') ||
      err.name === 'TypeError'
    ) {
      return new Error(
        'ANALYZE_TIMEOUT: Die Analyse hat zu lange gedauert oder die Verbindung wurde abgebrochen. Bitte erneut versuchen.',
      );
    }
  }
  return err instanceof Error ? err : new Error('Meal analysis failed');
}

function buildMealItemGroups(
  intent: MealIntent,
  ingredients: Ingredient[],
): { label: string; ingredients: Ingredient[] }[] | undefined {
  if (intent.items.length <= 1) return undefined;
  const groups: { label: string; ingredients: Ingredient[] }[] = [];
  let idx = 0;
  for (const item of intent.items) {
    const n = item.components.length;
    const slice = ingredients.slice(idx, idx + n);
    idx += n;
    if (slice.length > 0) groups.push({ label: item.label, ingredients: slice });
  }
  return groups.length > 0 ? groups : undefined;
}

function collectOffUnmatched(lines: ResolvedFoodLine[], intent: MealIntent): string[] {
  const out: string[] = [];
  let i = 0;
  for (const item of intent.items) {
    for (const comp of item.components) {
      const line = lines[i];
      i += 1;
      if (!line) continue;
      const weak =
        line.foodId === 'generic_unknown' ||
        line.requiresCandidatePick === true ||
        line.matchUncertainty === 'high' ||
        line.matchUncertainty === 'blocked';
      if (weak) out.push((comp.foodHint || comp.rawText || item.label).trim());
    }
  }
  return [...new Set(out.filter(Boolean))];
}

function collectAutoPersisted(lines: ResolvedFoodLine[]): string[] {
  return [
    ...new Set(
      lines.filter(l => l.source === 'app').map(l => l.displayName.trim()).filter(Boolean),
    ),
  ];
}

export async function analyzeMeal(
  input: string,
  imageDataUrl?: string | null,
  opts?: { decomposeDish?: boolean; signal?: AbortSignal },
): Promise<AnalyzeMealResult> {
  return analyzeMealWithProgress(input, imageDataUrl, {
    decomposeDish: opts?.decomposeDish,
    signal: opts?.signal,
  });
}

export async function analyzeMealWithProgress(
  input: string,
  imageDataUrl?: string | null,
  opts?: {
    decomposeDish?: boolean;
    signal?: AbortSignal;
    onProgress?: (phase: MealAnalyzePhase, progress: number) => void;
  },
): Promise<AnalyzeMealResult> {
  const text = input.trim();
  const image = imageDataUrl?.trim() || null;
  if (!text && !image) throw new Error('missing-input');

  const emit = (phase: MealAnalyzePhase, progress: number) => {
    opts?.onProgress?.(phase, progress);
  };

  try {
    emit('interpret', 12);
    throwIfAborted(opts?.signal);
    const result = await processNutritionPipelineV3({
      text,
      imageDataUrl: image ?? undefined,
    });
    emit('off_search', 42);
    emit('match', result.user_review_required ? 72 : 85);
    emit('alternatives', result.user_review_required ? 88 : 90);
    throwIfAborted(opts?.signal);

    const ingredients: Ingredient[] = result.components.map((component) => {
      const match = result.matches.find((m) => m.component_id === component.component_id);
      const candidate = match?.candidates[0];
      return {
        id: candidate?.openfoodfacts_id ? `off_${candidate.openfoodfacts_id}` : undefined,
        name: component.component_name,
        amount: component.grams,
        unit: 'g',
        calories: component.kcal,
        protein: component.protein,
        carbs: component.carbs,
        fat: component.fat,
        fiber: component.fiber ?? undefined,
        nutrientSource: component.data_source === 'openfoodfacts' ? 'database' : 'model_estimate',
        matchScore: component.confidence_score / 100,
        matchSource: component.data_source,
      };
    });
    const offUnmatched = result.matches
      .filter((m) => m.requires_user_review)
      .map((m) => m.component_name);
    const autoPersisted: string[] = [];
    const offCatalogEmpty =
      result.components.length > 0 && result.components.every((c) => c.data_source === 'estimated_fallback');

    emit('finalize', 100);

    return {
      ingredients,
      mealItemGroups: undefined,
      proposedDbFoods: [],
      researchNote: null,
      offUnmatched: offUnmatched.length > 0 ? offUnmatched : undefined,
      autoPersistedAppFoods: autoPersisted.length > 0 ? autoPersisted : undefined,
      offCatalogEmpty,
      decomposeSanitized: null,
      runId: null,
    };
  } catch (err) {
    throw formatAnalyzeMealFetchError(err);
  }
}

export async function suggestCustomFoodDraft(query: string): Promise<CustomFoodDraft> {
  const data = await api<{ draft: CustomFoodDraft }>('/api/ai/suggest-custom-food-draft', {
    method: 'POST',
    body: JSON.stringify({ query }),
  });
  const d = data.draft;
  if (!d || typeof d !== 'object' || !(d.name && d.nutrientsPer100g)) {
    throw new Error('INVALID_DRAFT');
  }
  return d;
}
