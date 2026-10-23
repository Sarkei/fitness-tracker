import defaultPortions from './defaultPortions.de.json';

export type DefaultPortionEntry = { grams: number; unit: string };

const portionMap = defaultPortions as Record<string, DefaultPortionEntry>;

/** Längster passender Schlüssel (key.includes(hint)), vermeidet z. B. „reis“ in „reibekäse“. */
export function lookupDefaultPortion(foodName: string): DefaultPortionEntry | null {
  const key = foodName.trim().toLowerCase();
  if (!key) return null;
  let bestHint: string | null = null;
  let best: DefaultPortionEntry | null = null;
  for (const [hint, value] of Object.entries(portionMap)) {
    if (!hint || !key.includes(hint)) continue;
    if (!bestHint || hint.length > bestHint.length) {
      bestHint = hint;
      best = value;
    }
  }
  return best;
}

export function allDefaultPortionHints(): string[] {
  return Object.keys(portionMap);
}
