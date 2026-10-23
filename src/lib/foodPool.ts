/**
 * Zentrale Lebensmittel-Quelle: nur Open Food Facts (keine Statik-DB, keine Postgres-Kombis im Pool).
 */

import type { Food } from './foodDatabase';
import { api } from '@/src/lib/api';
import { mergeCatalogFoodPool, rankFoodsForMealDescription } from './mealAiShared';
import { searchOpenFoodFacts } from '@/src/services/openFoodFactsService';

/** Eingebettete foodDatabase.ts ist deaktiviert. */
export const USE_LOCAL_FOOD_DATABASE = false;

export function catalogFoodsForPool(catalogFoods: Food[] = []): Food[] {
  return mergeCatalogFoodPool(catalogFoods);
}

/** Nur OFF-Katalog-Treffer (Parameter userFoods wird ignoriert). */
export function mergeAppFoodPool(_userFoods: Food[] = [], catalogFoods: Food[] = []): Food[] {
  return mergeCatalogFoodPool(catalogFoods);
}

export async function searchFoodsTieredFromCatalog(
  query: string,
  _userFoods: Food[] = [],
  maxStrong = 20,
  maxSimilar = 32,
): Promise<{ strong: Food[]; similar: Food[] }> {
  const q = query.trim();
  if (q.length < 2) {
    return { strong: [], similar: [] };
  }
  const params = new URLSearchParams({
    q,
    max_strong: String(maxStrong),
    max_similar: String(maxSimilar),
  });
  const data = await api<{
    strong: Food[];
    similar: Food[];
    offMappingDroppedAll?: boolean;
  }>(`/api/foods/catalog-search?${params.toString()}`);

  if (data.offMappingDroppedAll) {
    throw new Error('off-fetch-failed');
  }

  return {
    strong: data.strong ?? [],
    similar: data.similar ?? [],
  };
}

/** Kandidaten für Client-Hilfen (nur OFF). */
export async function fetchCatalogCandidatesForAi(
  query: string,
  _userFoods: Food[] = [],
  max = 44,
): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const off = await searchOpenFoodFacts(q, max);
  const pool = mergeCatalogFoodPool(off);
  return rankFoodsForMealDescription(q, max, pool);
}
