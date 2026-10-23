/**
 * Häufig geloggte Einzellebensmittel aus der Ernährungshistorie (für Schnellwahl im Food-Log).
 */

import type { Ingredient, Nutrition } from '@/src/types';

export interface FrequentTrackedFood {
  key: string;
  foodId?: string;
  name: string;
  logCount: number;
  lastLoggedAt: string;
  lastAmount: number;
  lastUnit: string;
  lastCalories: number;
  lastProtein: number;
  lastCarbs: number;
  lastFat: number;
}

type Acc = {
  foodId?: string;
  name: string;
  logCount: number;
  lastLoggedAt: string;
  lastIngredient: Ingredient;
};

function parseEntryTime(dateIso: string): number {
  const t = new Date(dateIso).getTime();
  return Number.isFinite(t) ? t : 0;
}

function ingestIngredient(
  map: Map<string, Acc>,
  ing: Ingredient,
  dateIso: string,
  cutoffMs: number,
): void {
  const name = ing.name?.trim();
  if (!name || name.length < 2) return;

  const t = parseEntryTime(dateIso);
  if (!t || t < cutoffMs) return;

  const idStr = ing.id != null ? String(ing.id).trim() : '';
  const key =
    idStr && !idStr.startsWith('est_') ? `id:${idStr}` : `name:${name.toLowerCase()}`;

  const prev = map.get(key);
  if (!prev) {
    map.set(key, {
      foodId: idStr && !idStr.startsWith('est_') ? idStr : undefined,
      name,
      logCount: 1,
      lastLoggedAt: dateIso,
      lastIngredient: ing,
    });
    return;
  }

  const isNewer = t >= parseEntryTime(prev.lastLoggedAt);
  map.set(key, {
    foodId: prev.foodId ?? (idStr && !idStr.startsWith('est_') ? idStr : undefined),
    name: isNewer ? name : prev.name,
    logCount: prev.logCount + 1,
    lastLoggedAt: isNewer ? dateIso : prev.lastLoggedAt,
    lastIngredient: isNewer ? ing : prev.lastIngredient,
  });
}

/**
 * @param entries Alle Nutrition-Einträge des Nutzers
 * @param opts.maxItems Max. Chips in der UI (Standard 14)
 * @param opts.lookbackDays Nur Einträge in diesem Zeitraum (Standard 120)
 */
export function buildFrequentTrackedFoods(
  entries: Nutrition[],
  opts?: { maxItems?: number; lookbackDays?: number },
): FrequentTrackedFood[] {
  const maxItems = opts?.maxItems ?? 14;
  const lookbackDays = opts?.lookbackDays ?? 120;
  const cutoffMs = Date.now() - lookbackDays * 86_400_000;
  const map = new Map<string, Acc>();

  for (const entry of entries) {
    const date = entry.date;
    const ings = entry.ingredients;
    if (ings && ings.length > 0) {
      for (const ing of ings) {
        ingestIngredient(map, ing, date, cutoffMs);
      }
      continue;
    }

    const name = entry.meal?.trim();
    if (!name) continue;
    ingestIngredient(
      map,
      {
        id: entry.foodId,
        name,
        amount: entry.quantity ?? 100,
        unit: entry.unit ?? 'g',
        calories: entry.calories ?? 0,
        protein: entry.protein ?? 0,
        carbs: entry.carbs ?? 0,
        fat: entry.fat ?? 0,
      },
      date,
      cutoffMs,
    );
  }

  const now = Date.now();
  const scored = [...map.values()].map((acc) => {
    const daysAgo = (now - parseEntryTime(acc.lastLoggedAt)) / 86_400_000;
    const recency = Math.max(0, 28 - daysAgo);
    const score = acc.logCount * 10 + recency;
    const ing = acc.lastIngredient;
    return {
      item: {
        key: acc.foodId ?? acc.name.toLowerCase(),
        foodId: acc.foodId,
        name: acc.name,
        logCount: acc.logCount,
        lastLoggedAt: acc.lastLoggedAt,
        lastAmount: ing.amount,
        lastUnit: ing.unit,
        lastCalories: ing.calories,
        lastProtein: ing.protein,
        lastCarbs: ing.carbs,
        lastFat: ing.fat,
      } satisfies FrequentTrackedFood,
      score,
    };
  });

  return scored
    .filter((row) => row.item.logCount >= 2 || row.score >= 18)
    .sort((a, b) => b.score - a.score || b.item.logCount - a.item.logCount)
    .slice(0, maxItems)
    .map((row) => row.item);
}

export function frequentFoodToIngredient(item: FrequentTrackedFood): Ingredient {
  return {
    id: item.foodId,
    name: item.name,
    amount: item.lastAmount,
    unit: item.lastUnit,
    calories: item.lastCalories,
    protein: item.lastProtein,
    carbs: item.lastCarbs,
    fat: item.lastFat,
  };
}
