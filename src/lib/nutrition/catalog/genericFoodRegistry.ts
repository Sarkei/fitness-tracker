/**
 * Einheitlicher Katalog für geschätzte Basis-Lebensmittel (ohne `_generic`-Suffix in IDs).
 * Quellen: GenericFallbackTable + genericFoodBaselines.de.json
 */

import type { Food } from '../../foodDatabase';
import {
  GENERIC_NUTRITION_TABLE,
  getGenericFallback,
  resolveGenericTableKey,
  type GenericNutrients,
} from '../pipeline/GenericFallbackTable';
import baselines from '../genericFoodBaselines.de.json';
import { capitalizeFoodDisplayName } from '../foodDisplayName';
import { normalizeFoodHint } from '../foodSynonyms.de';

export const GENERIC_FOOD_ID_PREFIX = 'generic_';

type BaselineRow = {
  id: string;
  name: string;
  category: Food['category'];
  nutrients: { calories: number; protein: number; carbs: number; fat: number };
};

/** Tabellen-Key → Slug ohne `_generic` (z. B. `paprika_generic` → `paprika`). */
export function genericSlugFromTableKey(tableKey: string): string {
  return tableKey.replace(/_generic$/, '');
}

export function genericFoodIdFromSlug(slug: string): string {
  return `${GENERIC_FOOD_ID_PREFIX}${genericSlugFromTableKey(slug)}`;
}

function nutrientsFromGeneric(n: GenericNutrients): Food['nutrients'] {
  return {
    calories: Math.round(n.kcal_100g),
    protein: Math.round(n.protein_100g * 10) / 10,
    carbs: Math.round(n.carbs_100g * 10) / 10,
    fat: Math.round(n.fat_100g * 10) / 10,
  };
}

function foodFromTableKey(tableKey: keyof typeof GENERIC_NUTRITION_TABLE, displayName?: string): Food {
  const slug = genericSlugFromTableKey(tableKey);
  const nutrients = GENERIC_NUTRITION_TABLE[tableKey];
  return {
    id: genericFoodIdFromSlug(slug),
    name: capitalizeFoodDisplayName(displayName?.trim() || slug.replace(/_/g, ' ')),
    category: 'readymeal',
    nutrients: nutrientsFromGeneric(nutrients),
    servings: [{ name: '100 g', grams: 100 }],
    catalogSource: 'app',
  };
}

function foodFromBaseline(row: BaselineRow): Food {
  return {
    id: genericFoodIdFromSlug(row.id),
    name: capitalizeFoodDisplayName(row.name),
    category: row.category,
    nutrients: { ...row.nutrients },
    servings: [{ name: '100 g', grams: 100 }],
    catalogSource: 'app',
  };
}

const STATIC_FOODS: Food[] = (() => {
  const byId = new Map<string, Food>();
  for (const key of Object.keys(GENERIC_NUTRITION_TABLE) as Array<keyof typeof GENERIC_NUTRITION_TABLE>) {
    const food = foodFromTableKey(key);
    byId.set(food.id, food);
  }
  for (const row of baselines as BaselineRow[]) {
    const food = foodFromBaseline(row);
    if (!byId.has(food.id)) byId.set(food.id, food);
  }
  return [...byId.values()];
})();

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

export function lookupGenericFood(nameOrKey: string): Food | null {
  const trimmed = nameOrKey.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith(GENERIC_FOOD_ID_PREFIX)) {
    return STATIC_FOODS.find((f) => f.id === trimmed) ?? null;
  }

  const tableKey = resolveGenericTableKey(trimmed);
  if (tableKey) {
    const slug = genericSlugFromTableKey(tableKey);
    const id = genericFoodIdFromSlug(slug);
    const hit = STATIC_FOODS.find((f) => f.id === id);
    if (hit) return hit;
    const nutrients = getGenericFallback(trimmed);
    if (nutrients) {
      return {
        id,
        name: trimmed,
        category: 'readymeal',
        nutrients: nutrientsFromGeneric(nutrients),
        servings: [{ name: '100 g', grams: 100 }],
        catalogSource: 'app',
      };
    }
  }

  const norm = normalizeFoodHint(trimmed).toLowerCase();
  return (
    STATIC_FOODS.find(
      (f) =>
        normalizeFoodHint(f.name).toLowerCase() === norm ||
        f.id === genericFoodIdFromSlug(norm.replace(/\s+/g, '_')),
    ) ?? null
  );
}

export function searchGenericFoods(query: string, limit = 12): Food[] {
  const q = normalizeFoodHint(query).toLowerCase();
  if (q.length < 1) return [];
  const qTokens = tokenize(q);
  const scored = STATIC_FOODS.map((f) => {
    const n = f.name.toLowerCase();
    const slug = f.id.slice(GENERIC_FOOD_ID_PREFIX.length).replace(/_/g, ' ');
    let score = 0;
    if (n === q || slug === q) score += 4;
    if (n.includes(q) || q.includes(n) || slug.includes(q)) score += 2;
    for (const t of qTokens) {
      if (n.includes(t) || slug.includes(t)) score += 1;
    }
    return { food: f, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.food.name.localeCompare(b.food.name, 'de'))
    .slice(0, limit);
  return scored.map((x) => x.food);
}

export function getGenericFoodById(foodId: string): Food | null {
  const id = String(foodId ?? '').trim();
  if (!id.startsWith(GENERIC_FOOD_ID_PREFIX)) return null;
  return STATIC_FOODS.find((f) => f.id === id) ?? lookupGenericFood(id);
}

export function isGenericFoodId(foodId: string): boolean {
  return String(foodId ?? '').startsWith(GENERIC_FOOD_ID_PREFIX);
}
