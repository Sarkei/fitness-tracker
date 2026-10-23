import type { Food } from '../foodDatabase';
import { normalizeFoodHint } from './foodSynonyms.de';
import { MATCH_AUTO_HIGH, pickThresholdAuto } from './matchThresholds';

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9äöüß\s]/gi, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function overlapScore(query: string, food: Food): number {
  const qTokens = new Set(tokenize(normalizeFoodHint(query)));
  const fTokens = tokenize(food.name);
  if (qTokens.size === 0 || fTokens.length === 0) return 0;
  let hit = 0;
  for (const t of fTokens) {
    if (qTokens.has(t)) hit++;
    for (const q of qTokens) {
      if (t.includes(q) || q.includes(t)) hit += 0.5;
    }
  }
  return Math.min(1, hit / (qTokens.size + 1));
}

function penalizePackagedMismatch(query: string, food: Food): number {
  const q = query.toLowerCase();
  const name = food.name.toLowerCase();
  const genericTerms = ['brust', 'filet', 'roh', 'gekocht', 'reis', 'apfel', 'tomate'];
  const packagedTerms = ['nuggets', 'tk', 'tiefkühl', 'pizza', 'snack', 'chips', 'riegel'];
  const qGeneric = genericTerms.some((t) => q.includes(t));
  const fPackaged = packagedTerms.some((t) => name.includes(t));
  if (qGeneric && fPackaged) return 0.35;
  return 0;
}

export type RankedFood = { food: Food; score: number; reason: string };

export function rankFoodCandidates(query: string, candidates: Food[], limit = 5): RankedFood[] {
  const q = normalizeFoodHint(query);
  const ranked = candidates
    .map((food) => {
      let score = overlapScore(q, food);
      score -= penalizePackagedMismatch(q, food);
      if (food.catalogSource === 'app') score += 0.05;
      const nutrientsOk =
        food.nutrients.calories > 0 || food.nutrients.protein > 0 || food.nutrients.carbs > 0;
      if (!nutrientsOk) score -= 0.2;
      const reason =
        score >= MATCH_AUTO_HIGH ? 'off_name_strong' : score >= 0.55 ? 'off_name' : 'off_name_weak';
      return { food, score: Math.max(0, Math.min(1, score)), reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
  return ranked;
}

export function pickAutoMatch(ranked: RankedFood[], expertMode = false): RankedFood | null {
  const top = ranked[0];
  const threshold = pickThresholdAuto(expertMode);
  if (top && top.score >= threshold) return top;
  return null;
}

/** Mittleres Vertrauen: Kandidat vorschlagen, Nutzer soll bestätigen. */
export function pickMediumMatch(ranked: RankedFood[]): RankedFood | null {
  const top = ranked[0];
  if (top && top.score >= 0.7 && top.score < MATCH_AUTO_HIGH) return top;
  return null;
}
