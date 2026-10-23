/**
 * App-weite Lebensmittel-Datenbank (PostgreSQL `user_custom_foods`) — ergänzt Open Food Facts.
 */

import type { Pool } from 'pg';
import type { Food, Serving } from '../foodDatabase';
import type { CustomFoodDraft } from '../../types';
import { coerceFoodCategory, compositeIngredientsJsonToLines } from '../mealAiShared';

export const UCF_ID_PREFIX = 'ucf_';

export function ucfIdFromRowId(rowId: string): string {
  return `${UCF_ID_PREFIX}${String(rowId).trim()}`;
}

export function rowIdFromUcfFoodId(foodId: string): string | null {
  const id = String(foodId ?? '').trim();
  if (!id.startsWith(UCF_ID_PREFIX)) return null;
  const raw = id.slice(UCF_ID_PREFIX.length).trim();
  return raw.length >= 8 ? raw : null;
}

function parseJsonCol<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
  return raw as T;
}

export function rowToFood(row: Record<string, unknown>): Food {
  const nutrients = parseJsonCol(row.nutrients, {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  });
  let servings = parseJsonCol<Serving[]>(row.servings, []);
  if (!Array.isArray(servings) || servings.length === 0) {
    servings = [{ name: '100 g', grams: 100 }];
  }
  const compositeRaw = row.composite_ingredients;
  const compositeLines = compositeIngredientsJsonToLines(compositeRaw);
  const food: Food = {
    id: ucfIdFromRowId(String(row.id)),
    name: String(row.name ?? '').trim(),
    category: coerceFoodCategory(String(row.category ?? 'readymeal')),
    nutrients: {
      calories: Math.round(Number(nutrients.calories) || 0),
      protein: Math.round((Number(nutrients.protein) || 0) * 10) / 10,
      carbs: Math.round((Number(nutrients.carbs) || 0) * 10) / 10,
      fat: Math.round((Number(nutrients.fat) || 0) * 10) / 10,
    },
    servings,
    catalogSource: 'app',
  };
  if (compositeLines.length > 0) {
    food.compositeIngredients = compositeLines.map((line) => ({
      id: line.id,
      name: line.name,
      amount: line.amount,
      unit: line.unit,
      servingName: line.servingName,
      calories: line.calories,
      protein: line.protein,
      carbs: line.carbs,
      fat: line.fat,
      nutrientSource: line.nutrientSource,
    }));
  }
  return food;
}

export async function searchAppCustomFoods(
  pool: Pool,
  query: string,
  limit = 24,
): Promise<Food[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const { rows } = await pool.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at
     FROM user_custom_foods
     WHERE name ILIKE $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [`%${q}%`, Math.min(40, Math.max(1, limit))],
  );
  return rows.map((row) => rowToFood(row as Record<string, unknown>));
}

export async function getAppCustomFoodById(pool: Pool, foodId: string): Promise<Food | null> {
  const rowId = rowIdFromUcfFoodId(foodId);
  if (!rowId) return null;
  const { rows } = await pool.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at
     FROM user_custom_foods WHERE id = $1::uuid LIMIT 1`,
    [rowId],
  );
  if (!rows[0]) return null;
  return rowToFood(rows[0] as Record<string, unknown>);
}

export async function findAppCustomFoodByExactName(pool: Pool, name: string): Promise<Food | null> {
  const n = name.trim();
  if (!n) return null;
  const { rows } = await pool.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at
     FROM user_custom_foods WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) LIMIT 1`,
    [n],
  );
  if (!rows[0]) return null;
  return rowToFood(rows[0] as Record<string, unknown>);
}

export async function insertAppCustomFoodFromDraft(
  pool: Pool,
  draft: CustomFoodDraft,
  source = 'user_confirmed_ai',
): Promise<Food> {
  const name = draft.name.trim().slice(0, 320);
  const existing = await findAppCustomFoodByExactName(pool, name);
  if (existing) return existing;

  const servings =
    draft.servings.length > 0 ? draft.servings : [{ name: '100 g', grams: 100 }];

  const { rows } = await pool.query(
    `INSERT INTO user_custom_foods (user_id, name, category, nutrients, servings, source)
     VALUES (NULL, $1, $2, $3::jsonb, $4::jsonb, $5)
     RETURNING id, name, category, nutrients, servings, composite_ingredients, source, created_at`,
    [
      name,
      coerceFoodCategory(draft.category),
      JSON.stringify(draft.nutrientsPer100g),
      JSON.stringify(servings),
      source,
    ],
  );
  return rowToFood(rows[0] as Record<string, unknown>);
}

export async function insertAppCustomFoodFromFood(
  pool: Pool,
  food: Food,
  source = 'user_manual',
): Promise<Food> {
  const existing = await findAppCustomFoodByExactName(pool, food.name);
  if (existing) return existing;

  const draft: CustomFoodDraft = {
    name: food.name,
    category: food.category,
    nutrientsPer100g: { ...food.nutrients },
    servings: food.servings?.length ? food.servings : [{ name: '100 g', grams: 100 }],
    defaultAmount: 100,
    defaultUnit: 'g',
  };
  return insertAppCustomFoodFromDraft(pool, draft, source);
}
