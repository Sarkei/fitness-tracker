import type { Food } from '../../foodDatabase';
import {
  getGenericFoodById,
  isGenericFoodId,
  lookupGenericFood,
  searchGenericFoods,
} from './genericFoodRegistry';

/** @deprecated Nutze `genericFoodRegistry` — bleibt für bestehende Imports. */
export const GENERIC_PREFIX = 'generic_';

export function baselineToFood(row: {
  id: string;
  name: string;
  category: Food['category'];
  nutrients: { calories: number; protein: number; carbs: number; fat: number };
}): Food {
  return lookupGenericFood(row.name) ?? {
    id: `${GENERIC_PREFIX}${row.id}`,
    name: row.name,
    category: row.category,
    nutrients: { ...row.nutrients },
    servings: [{ name: '100 g', grams: 100 }],
    catalogSource: 'app',
  };
}

export function searchGenericBaselines(query: string, limit = 5): Food[] {
  return searchGenericFoods(query, limit);
}

export function getGenericBaselineById(foodId: string): Food | null {
  return getGenericFoodById(foodId);
}

export { isGenericFoodId };
