/**
 * Persistiert OFF-unmatched Mahlzeit-Zeilen in `user_custom_foods` (KI-Schätzung).
 */

import type { Pool } from 'pg';
import type { Food } from '../foodDatabase';
import type { CustomFoodDraft, Ingredient } from '../../types';
import { buildSuggestCustomFoodDraftPrompt } from '../aiPrompts/buildMealPrompts';
import {
  assignIngredientsToDecomposedMealGroups,
  collapseDuplicateIngredients,
  filterOffOnlyIngredients,
  findBestFoodMatch,
  ingredientFromParsedItem,
  isAppCatalogFood,
  normalizeName,
  parseCustomFoodDraftFromAi,
  type ParsedDecomposedMealItem,
  type ParsedFoodItem,
} from '../mealAiShared';
import {
  findAppCustomFoodByExactName,
  insertAppCustomFoodFromDraft,
} from './appCustomFoods';

export const MEAL_AUTO_PERSIST_MAX = 5;

export type MealAnalyzeAiComplete = (
  prompt: string,
  image?: { mimeType: string; data: string },
  options?: { temperature?: number; responseMode?: string },
) => Promise<string>;

function applyMealPortionToDraft(draft: CustomFoodDraft, row: ParsedFoodItem): CustomFoodDraft {
  const unitRaw = (row.unit || 'g').trim().toLowerCase();
  const allowed = new Set(['g', 'ml', 'stk', 'dose', 'glas', 'flasche', 'tl', 'el']);
  let unit = unitRaw;
  if (unit.includes('stk') || unit.includes('stück') || unit.includes('stueck') || unit === 'piece') {
    unit = 'stk';
  }
  if (!allowed.has(unit)) return draft;
  const amount = Number.isFinite(row.amount) && row.amount > 0 ? row.amount : unit === 'g' || unit === 'ml' ? 100 : 1;
  return { ...draft, defaultAmount: amount, defaultUnit: unit };
}

async function draftForUnmatchedRow(
  row: ParsedFoodItem,
  completeMealAnalysis: MealAnalyzeAiComplete,
): Promise<CustomFoodDraft> {
  const query = row.name.trim().slice(0, 240);
  const prompt = buildSuggestCustomFoodDraftPrompt(query);
  const raw = await completeMealAnalysis(prompt, undefined, {
    temperature: 0.25,
    responseMode: 'json_object',
  });
  const draft = parseCustomFoodDraftFromAi(raw, query);
  return applyMealPortionToDraft(draft, row);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

/** Legt fehlende Zeilen in der App-DB an (Dedup per Name, max. MEAL_AUTO_PERSIST_MAX). */
export async function persistMealUnmatchedToAppDb(
  pool: Pool,
  unmatched: ParsedFoodItem[],
  completeMealAnalysis: MealAnalyzeAiComplete,
): Promise<Food[]> {
  const seen = new Set<string>();
  const rows: ParsedFoodItem[] = [];
  for (const row of unmatched) {
    const name = row.name.trim();
    if (!name) continue;
    const key = normalizeName(name);
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(row);
    if (rows.length >= MEAL_AUTO_PERSIST_MAX) break;
  }
  if (rows.length === 0) return [];

  const persisted = await mapWithConcurrency(rows, 2, async (row) => {
    const name = row.name.trim();
    const existing = await findAppCustomFoodByExactName(pool, name);
    if (existing) return existing;
    try {
      const draft = await draftForUnmatchedRow(row, completeMealAnalysis);
      return await insertAppCustomFoodFromDraft(pool, draft, 'meal_analyze_auto');
    } catch (err) {
      console.warn('persistMealUnmatched: skip', name, err);
      return null;
    }
  });

  return persisted.filter((f): f is Food => f != null);
}

function findCatalogFoodForRow(row: ParsedFoodItem, pool: Food[]): Food | null {
  const exact = pool.find((f) => normalizeName(f.name) === normalizeName(row.name));
  if (exact && isAppCatalogFood(exact)) return exact;
  const best = findBestFoodMatch(row.name, pool);
  return best && isAppCatalogFood(best) ? best : null;
}

export interface FinalizeMealAnalyzePersistInput {
  pool: Pool;
  outUnmatched: ParsedFoodItem[];
  outIngredients: Ingredient[];
  mealItemGroups: { label: string; ingredients: Ingredient[] }[];
  mergedPool: Food[];
  groups: ParsedDecomposedMealItem[];
  completeMealAnalysis: MealAnalyzeAiComplete;
}

export interface FinalizeMealAnalyzePersistResult {
  outUnmatched: ParsedFoodItem[];
  outIngredients: Ingredient[];
  mealItemGroups: { label: string; ingredients: Ingredient[] }[];
  mergedPool: Food[];
  autoPersistedNames: string[];
}

/** Nach OFF-Matching: unmatched in App-DB speichern und als Katalog-Zutaten übernehmen. */
export async function finalizeMealAnalyzeWithAutoPersist(
  input: FinalizeMealAnalyzePersistInput,
): Promise<FinalizeMealAnalyzePersistResult> {
  let {
    outUnmatched,
    outIngredients,
    mealItemGroups,
    mergedPool,
  } = input;

  if (outUnmatched.length === 0) {
    return {
      outUnmatched,
      outIngredients,
      mealItemGroups,
      mergedPool,
      autoPersistedNames: [],
    };
  }

  const persisted = await persistMealUnmatchedToAppDb(
    input.pool,
    outUnmatched,
    input.completeMealAnalysis,
  );
  if (persisted.length === 0) {
    return {
      outUnmatched,
      outIngredients,
      mealItemGroups,
      mergedPool,
      autoPersistedNames: [],
    };
  }

  mergedPool = [...mergedPool, ...persisted.filter((f) => !mergedPool.some((p) => p.id === f.id))];

  const recovered: Ingredient[] = [];
  const matchedRowKeys = new Set<string>();
  for (const row of outUnmatched) {
    const food = findCatalogFoodForRow(row, persisted) ?? findCatalogFoodForRow(row, mergedPool);
    if (!food) continue;
    recovered.push(ingredientFromParsedItem(row, food));
    matchedRowKeys.add(`${normalizeName(row.name)}|${(row.unit || 'g').toLowerCase()}`);
  }

  if (recovered.length > 0) {
    outIngredients = collapseDuplicateIngredients([...outIngredients, ...recovered]);
    const regroup = assignIngredientsToDecomposedMealGroups(input.groups, outIngredients, mergedPool);
    if (regroup.mealItemGroups.length > 0) {
      mealItemGroups = regroup.mealItemGroups;
    }
    outUnmatched = outUnmatched.filter((row) => {
      const k = `${normalizeName(row.name)}|${(row.unit || 'g').toLowerCase()}`;
      return !matchedRowKeys.has(k);
    });
  }

  outIngredients = filterOffOnlyIngredients(outIngredients, mergedPool);
  mealItemGroups = mealItemGroups
    .map((g) => ({
      ...g,
      ingredients: filterOffOnlyIngredients(g.ingredients, mergedPool),
    }))
    .filter((g) => g.ingredients.length > 0);

  return {
    outUnmatched,
    outIngredients,
    mealItemGroups,
    mergedPool,
    autoPersistedNames: persisted.map((f) => f.name.trim()).filter(Boolean),
  };
}
