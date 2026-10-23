import type { Pool } from 'pg';
import type { Food } from '../../foodDatabase';
import { rowToFood } from '../../server/appCustomFoods';

export async function getAppCustomFoodByBarcode(pool: Pool, barcode: string): Promise<Food | null> {
  const code = String(barcode).replace(/\D/g, '');
  if (code.length < 8) return null;
  const { rows } = await pool.query(
    `SELECT id, name, category, nutrients, servings, composite_ingredients, source, created_at, barcode
     FROM user_custom_foods
     WHERE barcode = $1
     LIMIT 1`,
    [code],
  );
  if (!rows[0]) return null;
  return rowToFood(rows[0] as Record<string, unknown>);
}

export async function insertAppCustomFoodWithBarcode(
  pool: Pool,
  opts: {
    name: string;
    category: Food['category'];
    nutrients: Food['nutrients'];
    servings: Food['servings'];
    barcode: string;
    source?: string;
    labelScanMeta?: Record<string, unknown>;
  },
): Promise<Food> {
  const code = opts.barcode.replace(/\D/g, '');
  const existing = await getAppCustomFoodByBarcode(pool, code);
  if (existing) return existing;

  const { rows } = await pool.query(
    `INSERT INTO user_custom_foods (user_id, name, category, nutrients, servings, source, barcode, label_scan_meta)
     VALUES (NULL, $1, $2, $3::jsonb, $4::jsonb, $5, $6, $7::jsonb)
     RETURNING id, name, category, nutrients, servings, composite_ingredients, source, created_at, barcode`,
    [
      opts.name.trim().slice(0, 320),
      opts.category,
      JSON.stringify(opts.nutrients),
      JSON.stringify(opts.servings.length ? opts.servings : [{ name: '100 g', grams: 100 }]),
      opts.source ?? 'barcode_label_scan',
      code,
      opts.labelScanMeta ? JSON.stringify(opts.labelScanMeta) : null,
    ],
  );
  return rowToFood(rows[0] as Record<string, unknown>);
}
