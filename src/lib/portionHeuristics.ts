/**
 * Heuristiken für KI-geschätzte Portionen & „Stück“-Gewichte ohne Food-DB-Zeile.
 * Ziel: Stückzahlen ≠ Grammzahlen trennen; typische Massen/Würstchen plausibel halten.
 */

export interface ParsedFoodPortionInput {
  name: string;
  amount: number;
  unit: string;
}

const DEFAULT_STK_GRAMS_UNKNOWN = 85;

/** Ganze Rauch-/Brühwürste etc. (nicht dünn geschnittener Aufschnitt). */
export function isLikelyWholePieceSmokedOrCookedSausageName(name: string): boolean {
  const n = name.toLowerCase();
  if (/\b(scheibe|aufschnitt|gekocht\s*schinken|roher\s*schinken|geschnitten)\b/i.test(n)) return false;
  return /\b(debreziner|debrecziner|debreceni|knackwurst|bockwurst|wiener|frankfurter|bratwurst|currywurst|würstchen|wurstchen|merguez|landjäger|bierwurst|schenkenwurst|rauchwurst|extrawurst|serdelki|sremska)\b/i.test(
    n,
  );
}

/**
 * Typische Masse eines „Stückes“ für gängige Produkte (DE/AT Retail).
 * Nur verwenden, wenn kein exakter DB-Serving vorliegt.
 */
export function typicalGramsPerPieceFromProductName(name: string): number | null {
  const n = name.toLowerCase();

  if (/\bei(er)?\b|\begg\b/i.test(n) && !/eiernudeln|eierschwammerl|eierlikör|eierkuchen/i.test(n))
    return 58;
  if (/\bapfel\b|\bapple\b/i.test(n)) return 130;
  if (/\bbanane\b/i.test(n)) return 120;
  if (/\bbirne\b/i.test(n)) return 150;
  if (/\borange\b|\bclementine\b/i.test(n)) return 140;

  if (/\bdebreziner\b|debrecziner|debreceni|ungarische\s*rauchwurst/i.test(n)) return 55;
  if (/\bwiener\b|frankfurter\b/i.test(n)) return 50;
  if (/\bknackwurst\b/i.test(n)) return 55;
  if (/\bbockwurst\b/i.test(n)) return 90;
  if (/\bmerguez\b/i.test(n)) return 55;
  if (/\bbratwurst\b(?!en\b)/i.test(n)) return 100;
  if (/\bcurrywurst\b(?!sauce)(?!\s*mit)/i.test(n)) return 180;

  if (/\bcervelat\b|lyoner\b|fleischwurst\b|gelbwurst\b|bierschinken\b/i.test(n)) return 20;

  if (isLikelyWholePieceSmokedOrCookedSausageName(name)) return 55;

  if (/\bflügel|\bflugel|\bwing|chicken\s*wing|hähnchenflügel/i.test(n)) return 45;
  if (/\bkroketten\b/i.test(n)) return 35;
  if (/\bnugget/i.test(n)) return 18;

  return null;
}

/** Typische Abendessen-Portion in Gramm, wenn der Nutzer keine Menge nennt. */
export function estimateTypicalMealGramsForPhrase(phrase: string): number {
  const n = phrase.trim().toLowerCase();
  if (!n) return 150;
  if (/\bflügel|\bflugel|\bwing|chicken\s*wing|hähnchenflügel/i.test(n)) return 180;
  if (/\bkroketten\b/i.test(n)) return 150;
  if (/\bpommes|frites|kartoffel(sticks|chips)?\b/i.test(n)) return 160;
  if (/\bnugget|schnitzel|cord\s*bleu/i.test(n)) return 200;
  if (/\bsteak|braten|filet|lachs|fischfilet/i.test(n)) return 180;
  if (/\bcurrywurst\b/i.test(n)) return 200;
  if (/\bpizza\b/i.test(n)) return 280;
  if (/\bburger\b/i.test(n)) return 220;
  if (/\bsalat\b/i.test(n) && !/\bhähnchen|chicken|thunfisch/i.test(n)) return 120;
  return 150;
}

/** KI-Fallback: geschätzte Gesamt-Gramm aus Menge + Einheit + Produktname. */
export function estimateProposalTotalGrams(amount: number, unitRaw: string, productName: string): number {
  if (!Number.isFinite(amount) || amount <= 0) return 1;
  const u = (unitRaw || 'g').toLowerCase();

  if (u.includes('stk') || u.includes('stück') || u.includes('stueck') || u.includes('piece')) {
    const per = typicalGramsPerPieceFromProductName(productName);
    const perUse =
      per ?? (isLikelyWholePieceSmokedOrCookedSausageName(productName) ? 55 : DEFAULT_STK_GRAMS_UNKNOWN);
    return Math.max(1, Math.round(amount * perUse));
  }
  if (/\bdose\b|\bdosen\b/.test(u)) return Math.max(1, Math.round(amount * 400));
  if (u.includes('glas') || u.includes('gläser')) return Math.max(1, Math.round(amount * 200));
  if (u.includes('flasche')) return Math.max(1, Math.round(amount * 500));
  if (u.includes('el') || u.includes('tbsp')) return Math.max(1, Math.round(amount * 15));
  if (u.includes('tl') || u.includes('tsp')) return Math.max(1, Math.round(amount * 5));

  if (u.includes('kg')) return Math.max(1, Math.round(amount * 1000));
  if (u.includes('oz')) return Math.max(1, Math.round(amount * 28.35));
  if (u.includes('ml')) return Math.max(1, Math.round(amount));
  if (u === 'l' || /\b\d*\.?\d*\s*l\b/.test(u)) return Math.max(1, Math.round(amount * 1000));

  return Math.max(1, Math.round(amount));
}

/**
 * Häufiger Modellfehler: bei Würstchen `unit: stk`, aber `amount` ist eine Grammzahl (z. B. 150).
 * Dann auf Gramm normalisieren; echte Stückzahlen >25 in einer Zeile sind untypisch.
 */
export function normalizeAiParsedFoodPortion<T extends ParsedFoodPortionInput>(item: T): T {
  const uRaw = (item.unit || 'g').trim().toLowerCase().replace(/\./g, '');
  const isStk =
    uRaw === 'stk' ||
    uRaw.includes('stück') ||
    uRaw.includes('stueck') ||
    uRaw === 'piece' ||
    uRaw === 'pcs' ||
    uRaw === 'x';
  const { amount, name } = item;
  if (!isStk || !Number.isFinite(amount)) return item;

  if (isLikelyWholePieceSmokedOrCookedSausageName(name) && amount > 25) {
    return { ...item, amount, unit: 'g' };
  }

  return item;
}
