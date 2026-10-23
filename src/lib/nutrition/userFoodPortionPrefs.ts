import type { Pool } from 'pg';
import type { PortionOption } from './schemas';

export type UserPortionPref = {
  foodId: string;
  portionId: string;
  logUnit: string;
  quantity: number;
};

export async function ensureUserFoodPortionPrefsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS user_food_portion_prefs (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      food_id VARCHAR(64) NOT NULL,
      portion_id VARCHAR(64) NOT NULL,
      log_unit VARCHAR(32) NOT NULL,
      quantity NUMERIC NOT NULL DEFAULT 1,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (user_id, food_id)
    )
  `);
}

export async function getUserPortionPrefsForFoods(
  pool: Pool,
  userId: number,
  foodIds: string[],
): Promise<Map<string, UserPortionPref>> {
  const map = new Map<string, UserPortionPref>();
  const ids = [...new Set(foodIds.filter(Boolean))];
  if (ids.length === 0) return map;
  try {
    const res = await pool.query<{
      food_id: string;
      portion_id: string;
      log_unit: string;
      quantity: string;
    }>(
      `SELECT food_id, portion_id, log_unit, quantity
       FROM user_food_portion_prefs
       WHERE user_id = $1 AND food_id = ANY($2::varchar[])`,
      [userId, ids],
    );
    for (const row of res.rows) {
      map.set(row.food_id, {
        foodId: row.food_id,
        portionId: row.portion_id,
        logUnit: row.log_unit,
        quantity: Number(row.quantity) || 1,
      });
    }
  } catch {
    /* table may not exist yet */
  }
  return map;
}

export async function upsertUserPortionPref(
  pool: Pool,
  userId: number,
  pref: UserPortionPref,
): Promise<void> {
  await pool.query(
    `INSERT INTO user_food_portion_prefs (user_id, food_id, portion_id, log_unit, quantity, updated_at)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (user_id, food_id) DO UPDATE SET
       portion_id = EXCLUDED.portion_id,
       log_unit = EXCLUDED.log_unit,
       quantity = EXCLUDED.quantity,
       updated_at = NOW()`,
    [userId, pref.foodId, pref.portionId, pref.logUnit, pref.quantity],
  );
}

export function portionOptionFromUserPref(pref: UserPortionPref, foodGramsFallback = 100): PortionOption {
  const grams =
    pref.logUnit === 'g' || pref.logUnit === 'ml'
      ? pref.quantity
      : foodGramsFallback * Math.max(0.01, pref.quantity);
  return {
    id: pref.portionId,
    label: `${pref.quantity} ${pref.logUnit}`,
    logUnit: pref.logUnit,
    quantity: pref.quantity,
    grams,
    source: 'user_last',
    isDefault: true,
  };
}

/** Boost für foodIds, die der Nutzer bei diesem Hint oft manuell gewählt hat. */
export async function getUserFoodChoiceBoostsForHint(
  pool: Pool,
  userId: number,
  foodHint: string,
): Promise<Map<string, number>> {
  const boosts = new Map<string, number>();
  const hint = foodHint.trim().toLowerCase();
  if (!hint) return boosts;
  try {
    const res = await pool.query<{ chosen_food_id: string; cnt: string }>(
      `SELECT c->>'chosenFoodId' AS chosen_food_id, COUNT(*)::text AS cnt
       FROM meal_ai_runs_v2,
            jsonb_array_elements(COALESCE(user_corrections, '[]'::jsonb)) AS c
       WHERE user_id = $1
         AND LOWER(TRIM(c->>'foodHint')) = $2
         AND (c->>'chosenFoodId') IS NOT NULL
       GROUP BY c->>'chosenFoodId'
       HAVING COUNT(*) >= 1`,
      [userId, hint],
    );
    for (const row of res.rows) {
      const cnt = Number(row.cnt) || 0;
      boosts.set(row.chosen_food_id, Math.min(0.15, 0.05 + cnt * 0.03));
    }
  } catch {
    /* optional */
  }
  return boosts;
}
