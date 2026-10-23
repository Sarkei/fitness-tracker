import { completeCoachNutritionJson, resolveAiCapabilities } from '../../../aiProviders';
import type { Food } from '../foodDatabase';
import type { RankedFood } from './matchRanker';

function extractJsonObject(raw: string): unknown {
  const t = raw.trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('no-json');
  return JSON.parse(t.slice(start, end + 1));
}

/**
 * KI wählt nur aus der Kandidatenliste (keine freien Nährwerte).
 * Nur bei mittlerem Match-Score; bei Fehler/kein AI → null.
 */
export async function rerankCandidatesWithAi(
  query: string,
  ranked: RankedFood[],
): Promise<RankedFood | null> {
  const caps = resolveAiCapabilities();
  if (!caps.enabled || ranked.length < 2) return null;

  const top = ranked[0]?.score ?? 0;
  if (top >= 0.85) return null;

  const slice = ranked.slice(0, 8);
  const list = slice
    .map((r, i) => `${i}: ${r.food.name} [${r.food.id}] (score ${r.score.toFixed(2)})`)
    .join('\n');

  const prompt = `Du hilfst bei der Lebensmittel-Zuordnung für Ernährungstracking (Deutschland).
Der Nutzer meinte: "${query}"

Kandidaten aus Datenbank:
${list}

Wähle den EINEN Index (0-${slice.length - 1}), der am besten zur Beschreibung passt — kein verpacktes Snack-Produkt wenn rohe Zutat gemeint ist.
Antworte NUR mit JSON: {"index": number}`;

  try {
    const raw = await completeCoachNutritionJson([{ role: 'user', content: prompt }]);
    const parsed = extractJsonObject(raw) as { index?: number };
    const idx = Number(parsed.index);
    if (!Number.isFinite(idx) || idx < 0 || idx >= slice.length) return null;
    const picked = slice[idx];
    return {
      ...picked,
      score: Math.min(0.92, Math.max(picked.score, top + 0.08)),
      reason: 'ai_rerank',
    };
  } catch {
    return null;
  }
}

export function applyUserFoodBoost(
  ranked: RankedFood[],
  boosts: Map<string, number>,
): RankedFood[] {
  if (boosts.size === 0) return ranked;
  return [...ranked]
    .map((r) => {
      const boost = boosts.get(r.food.id) ?? 0;
      if (boost <= 0) return r;
      return {
        ...r,
        score: Math.min(1, r.score + boost),
        reason: boost > 0.05 ? 'user_history' : r.reason,
      };
    })
    .sort((a, B) => B.score - a.score);
}
