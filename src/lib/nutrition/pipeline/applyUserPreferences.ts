import type { Pool } from 'pg';
import type { ComponentMatch, PipelineResult } from './schemas';

type PrefRow = {
  ingredient_key: string;
  preferred_openfoodfacts_id: string;
  preferred_product_name: string | null;
  preferred_grams: number | null;
};

export async function applyUserFoodPreferencesToPipeline(
  pool: Pool,
  userId: number,
  result: PipelineResult,
): Promise<PipelineResult> {
  if (result.matches.length === 0) return result;

  const keys = result.matches.map((m) => m.component_name.toLowerCase().trim());
  let rows: PrefRow[] = [];
  try {
    const q = await pool.query<PrefRow>(
      `SELECT ingredient_key, preferred_openfoodfacts_id, preferred_product_name, preferred_grams
       FROM user_food_preferences
       WHERE user_id = $1 AND ingredient_key = ANY($2::text[])`,
      [userId, keys],
    );
    rows = q.rows;
  } catch {
    return result;
  }

  const prefMap = new Map(rows.map((r) => [r.ingredient_key, r]));
  const matches: ComponentMatch[] = result.matches.map((match) => {
    const pref = prefMap.get(match.component_name.toLowerCase().trim());
    if (!pref) return match;

    let idx = match.candidates.findIndex(
      (c) => c.openfoodfacts_id === pref.preferred_openfoodfacts_id,
    );
    if (idx < 0 && pref.preferred_product_name) {
      const preferredName = pref.preferred_product_name.toLowerCase().trim();
      idx = match.candidates.findIndex((c) => c.product_name.toLowerCase().trim() === preferredName);
      if (idx < 0) {
        idx = match.candidates.findIndex((c) => c.product_name.toLowerCase().includes(preferredName));
      }
    }
    if (idx <= 0) {
      const next = { ...match };
      if (pref.preferred_grams != null && Number.isFinite(Number(pref.preferred_grams))) {
        next.estimated_grams = Number(pref.preferred_grams);
      }
      if (idx === 0) {
        next.requires_user_review = false;
        next.review_reasons = [];
      }
      return next;
    }

    const reordered = [...match.candidates];
    const [picked] = reordered.splice(idx, 1);
    reordered.unshift(picked);

    return {
      ...match,
      candidates: reordered.map((c, i) => ({ ...c, rank: (i + 1) as 1 | 2 | 3 })),
      auto_selected_rank: 1,
      estimated_grams:
        pref.preferred_grams != null && Number.isFinite(Number(pref.preferred_grams))
          ? Number(pref.preferred_grams)
          : match.estimated_grams,
      requires_user_review: false,
      review_reasons: [],
    };
  });

  return { ...result, matches };
}
