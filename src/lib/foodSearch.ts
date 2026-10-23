/**
 * Client-side food search: aliases, folded umlauts, ranking via meal text heuristics.
 */

import type { Food } from './foodDatabase';
import { nameMatchesNumericToken, rankFoodsForMealDescription } from './mealAiShared';

/** Extra substrings / stems to match when the user types regional or informal names */
const QUERY_EXPANSIONS: { test: RegExp; insertTerms: string[] }[] = [
  { test: /leberkas|leberkäse|leberkaas/i, insertTerms: ['fleischkäse', 'leberkaas', 'leberkäse'] },
  { test: /wei(ß|ss|s)wurst/i, insertTerms: ['weißwurst', 'weisswurst'] },
  { test: /obatzda|obatzter|obazda/i, insertTerms: ['obatzda', 'käseaufstrich'] },
  { test: /brezn|brezel/i, insertTerms: ['brezel'] },
  { test: /radi\b/i, insertTerms: ['rettich'] },
];

const STRONG_TERMS_STOPWORDS = new Set([
  'und', 'oder', 'mit', 'ohne', 'aus', 'auf', 'als', 'wie', 'von', 'zum', 'zur', 'vom',
  'ein', 'eine', 'einen', 'der', 'die', 'das', 'den', 'dem', 'des', 'im', 'in', 'an',
  'ca', 'circa', 'etwas', 'bitte',
]);

function foldForSearch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

function asciiFoldDe(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

function collectSearchTerms(raw: string): Set<string> {
  const t = raw.trim();
  const out = new Set<string>();
  if (!t) return out;
  const lower = t.toLowerCase();
  out.add(lower);
  out.add(foldForSearch(lower));
  out.add(asciiFoldDe(lower));

  const tokens = lower.split(/\s+/).filter(Boolean);
  for (const tok of tokens) {
    out.add(tok);
    out.add(asciiFoldDe(tok));
  }

  for (const { test, insertTerms } of QUERY_EXPANSIONS) {
    if (test.test(t)) {
      for (const x of insertTerms) out.add(x);
    }
  }
  return out;
}

function foodMatchesAnyTerm(food: Food, terms: Set<string>): boolean {
  const hay = foldForSearch(food.name);
  const hayBare = asciiFoldDe(food.name);
  for (const term of terms) {
    if (!term || term.length < 2) continue;
    const a = foldForSearch(term);
    const b = asciiFoldDe(term);
    if (hay.includes(a) || hay.includes(term.toLowerCase()) || hayBare.includes(b)) return true;
  }
  return false;
}

function dedupeById(foods: Food[]): Food[] {
  const seen = new Set<string>();
  const out: Food[] = [];
  for (const f of foods) {
    if (seen.has(f.id)) continue;
    seen.add(f.id);
    out.push(f);
  }
  return out;
}

export interface TieredFoodSearchResult {
  /** Treffer, deren Name alle signifikanten Suchteile enthält (z. B. „Sahne“ + „7“ bei „Sahne 7 %“). */
  strong: Food[];
  /** Übrige semantisch ähnliche Treffer (ohne die strong-Liste). */
  similar: Food[];
}

/** Zerlegt die Anfrage in Teile, die alle im Lebensmittelnamen vorkommen müssen („strong“). */
export function collectStrongMatchParts(raw: string): string[] {
  const t = raw.trim().toLowerCase();
  if (!t) return [];
  const parts: string[] = [];
  const words = t.split(/\s+/).map(w => w.replace(/[,;.]+$/g, '')).filter(Boolean);
  for (const w of words) {
    if (STRONG_TERMS_STOPWORDS.has(w)) continue;
    if (/^\d+([.,]\d+)?$/.test(w)) {
      parts.push(w.replace(',', '.'));
      continue;
    }
    if (/^\d+([.,]\d+)?%$/.test(w)) {
      parts.push(w.replace('%', '').replace(',', '.'));
      continue;
    }
    if (w.length >= 2) parts.push(w);
  }
  return [...new Set(parts)];
}

function foodMatchesAllStrongParts(food: Food, parts: string[]): boolean {
  if (parts.length === 0) return false;
  const hay = foldForSearch(food.name);
  const hayBare = asciiFoldDe(food.name);
  for (const p of parts) {
    if (/^\d+(\.\d+)?$/.test(p)) {
      if (!nameMatchesNumericToken(food.name, p)) return false;
      continue;
    }
    const a = foldForSearch(p);
    const b = asciiFoldDe(p);
    if (
      !hay.includes(a) &&
      !hayBare.includes(b) &&
      !hayBare.includes(a) &&
      !hay.includes(b) &&
      !hay.includes(p.toLowerCase())
    ) {
      return false;
    }
  }
  return true;
}

/**
 * „Strenge“ Treffer oben (alle Suchteile im Namen), darunter ähnliche Einträge ohne die strong-Menge.
 */
export function searchStaticFoodsTiered(
  query: string,
  pool: Food[] = [],
  maxStrong = 24,
  maxSimilar = 40,
): TieredFoodSearchResult {
  const q = query.trim();
  if (!q) return { strong: [], similar: pool.slice(0, Math.min(maxSimilar, 50)) };

  const parts = collectStrongMatchParts(q);
  const strongBase =
    parts.length > 0 ? pool.filter(f => foodMatchesAllStrongParts(f, parts)) : [];
  const strong = dedupeById(rankFoodsForMealDescription(q, 120, strongBase)).slice(0, maxStrong);

  const similarRanked = searchStaticFoods(q, pool, maxSimilar + strong.length + 8);
  const strongIds = new Set(strong.map(f => f.id));
  const similar = similarRanked.filter(f => !strongIds.has(f.id)).slice(0, maxSimilar);

  return { strong, similar };
}

/**
 * Ranked food search for static DB (+ optional merged pool). Uses substring / alias expansion,
 * then `rankFoodsForMealDescription` for ordering.
 */
export function searchStaticFoods(
  query: string,
  pool: Food[] = [],
  maxResults = 80,
): Food[] {
  const q = query.trim();
  if (!q) return pool.slice(0, Math.min(maxResults, 50));

  const terms = collectSearchTerms(q);
  const direct = pool.filter(f => {
    const fn = f.name.toLowerCase();
    return fn.includes(q.toLowerCase()) || foodMatchesAnyTerm(f, terms);
  });

  const poolForRank = direct.length > 0 ? direct : pool.filter(f => foodMatchesAnyTerm(f, terms));
  const ranked = rankFoodsForMealDescription(q, 400, poolForRank.length > 0 ? poolForRank : pool);
  return dedupeById(ranked).slice(0, maxResults);
}
