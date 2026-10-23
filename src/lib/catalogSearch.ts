/**
 * Gemeinsame Katalog-Suche (OFF-Pool → gestufte Treffer). Läuft auf dem Server;
 * der Client ruft nur noch /api/foods/catalog-search auf.
 */

import type { Food } from './foodDatabase';
import { normalizeOffSearchQuery } from './openFoodFacts';
import { mergeCatalogFoodPool, rankFoodsForMealDescription } from './mealAiShared';
import { searchStaticFoodsTiered } from './foodSearch';

export type TieredCatalogSearchResult = {
  strong: Food[];
  similar: Food[];
  /** OFF lieferte Roh-Treffer, aber keins konnte gemappt werden (API-Format). */
  offMappingDroppedAll?: boolean;
};

export function tierFoodsFromOffPool(
  query: string,
  offFoods: Food[],
  maxStrong = 20,
  maxSimilar = 32,
): TieredCatalogSearchResult {
  const q = query.trim();
  if (q.length < 1) {
    return { strong: [], similar: [] };
  }

  const pool = mergeCatalogFoodPool(offFoods);
  const tiered = searchStaticFoodsTiered(q, pool, maxStrong, maxSimilar);
  if (tiered.strong.length > 0 || tiered.similar.length > 0 || pool.length === 0) {
    return tiered;
  }

  const qFold = normalizeOffSearchQuery(q);
  const ranked = rankFoodsForMealDescription(qFold, maxStrong + maxSimilar, pool);
  if (ranked.length > 0) {
    return {
      strong: ranked.slice(0, maxStrong),
      similar: ranked.slice(maxStrong, maxStrong + maxSimilar),
    };
  }

  return {
    strong: pool.slice(0, maxStrong),
    similar: pool.slice(maxStrong, maxStrong + maxSimilar),
  };
}
