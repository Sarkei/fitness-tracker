/**
 * Portion presets & „Stück“-Gewicht aus der Food-DB (Servings), inkl. Fallback.
 */

import type { Food, Serving } from './foodDatabase';
import { typicalGramsPerPieceFromProductName } from './portionHeuristics';

/** Letzter Fallback nur wenn die DB keinerlei Serving-Zeile hat (Vermeidung Division durch 0). */
export const DEFAULT_STUECK_GRAMS_FALLBACK = 100;

/** Referenz-Serving „100 g“ / „100 ml“ — kein echtes Stückgewicht. */
export function isReferenceServingName(name: string): boolean {
  return /^100\s*(g|ml)$/i.test(String(name ?? '').trim());
}

function isPortionOrPackagingServingName(name: string): boolean {
  const low = name.trim().toLowerCase();
  return /\b(portion|portionen|menü|menu|paket|packung|pack\b|gebinde|beutel|tüte|tube|teller|ration|komplett|family|familien|pers\.|personen|kg|kilogramm)\b/i.test(
    low,
  );
}

/** Gibt es ein echtes Stück-/Scheiben-Serving (nicht nur die 100-g-Referenz)? */
export function hasMeaningfulStueckServing(food: Food): boolean {
  for (const s of food.servings ?? []) {
    if (!s.grams || s.grams <= 0) continue;
    const n = s.name.trim();
    if (isReferenceServingName(n)) continue;
    if (/stk\.?|stück|stueck|\bpiece\b/i.test(n)) return true;
    if (/scheibe/i.test(n)) return true;
    if (/riegel|waffel|brötchen|semmel|roll\b|bar\b/i.test(n) && !isPortionOrPackagingServingName(n)) {
      return true;
    }
    if (/^\s*1\s+/i.test(n) && !isPortionOrPackagingServingName(n)) return true;
  }
  return false;
}

/**
 * Anzahl Stück/Scheiben/Eier am Anfang („3 Stk. …“, „2 Scheiben …“); sonst null.
 * Reine Gewichtsangaben wie „150g“ liefern null (then Divisor 1).
 */
function parseGroupedPieceCount(name: string): number | null {
  const t = name.trim();
  const m = t.match(/^(\d+)\s*(?:stk\.?|stück|stueck|scheiben|scheibe\b|eier\b)/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Gramm pro Stück aus expliziten Stück-/Scheiben-/Eier-Zeilen (inkl. Aufteilen bei Mehrfach-Packungen). */
function gramsPerPieceFromExplicitServing(s: Serving): number | null {
  if (!s.grams || s.grams <= 0) return null;
  const t = s.name.trim();
  const isPieceOrSlice =
    /stk\.?|stück|stueck|\bpiece\b/i.test(t) || /scheibe/i.test(t) || /\beier\b/i.test(t);
  if (!isPieceOrSlice) return null;
  const grouped = parseGroupedPieceCount(t);
  const divisor = grouped ?? 1;
  return Math.max(1, Math.round(s.grams / divisor));
}

/**
 * Schätzt Gramm pro „Stück“ für Anzeige & Umrechnung – nur aus echten Stück-/Portionszeilen.
 * „100 g“ allein ist keine Stückangabe.
 */
export function inferStueckGramsFromFood(food: Food): number {
  const servings = food.servings ?? [];

  for (const s of servings) {
    const g = gramsPerPieceFromExplicitServing(s);
    if (g != null) return g;
  }

  const onePrefixed = servings.find(s => {
    if (!s.grams || s.grams <= 0) return false;
    const n = s.name.trim();
    if (!/^\s*1\s+/i.test(n)) return false;
    if (isPortionOrPackagingServingName(n)) return false;
    if (isReferenceServingName(n)) return false;
    return true;
  });
  if (onePrefixed) return Math.round(onePrefixed.grams);

  const nonReference = servings.find(s => {
    if (!s.grams || s.grams <= 0) return false;
    if (isReferenceServingName(s.name)) return false;
    const sn = s.name.trim().toLowerCase();
    if (/vorschlag|schätz|schätzung|geschätzt|gesamtportion|korrigier/i.test(sn)) return false;
    if (isPortionOrPackagingServingName(s.name)) return false;
    const grp = parseGroupedPieceCount(s.name);
    if (grp != null && grp > 1) return false;
    return true;
  });
  if (nonReference) return Math.round(nonReference.grams);

  const typical = typicalGramsPerPieceFromProductName(food.name);
  if (typical != null) return typical;

  return DEFAULT_STUECK_GRAMS_FALLBACK;
}

/** Quick-Select: eindeutige Gramm-Mengen in DB-Reihenfolge, max. N Einträge. */
export function getPortionQuickSelectPresets(food: Food, max = 8): Serving[] {
  const seen = new Set<number>();
  const out: Serving[] = [];
  for (const s of food.servings) {
    const g = Math.round(s.grams);
    if (g <= 0 || seen.has(g)) continue;
    seen.add(g);
    out.push(s);
    if (out.length >= max) break;
  }
  return out;
}

/** Kleine Gebinde / würzen / „Streichen“ — kein Trink-Glas als Default (z. B. Essig, Öl, Senf). */
export function isCondimentLikePourFood(food: Food): boolean {
  const n = food.name.toLowerCase();
  if (/\b(essig|balsamico|apfelessig|weißweinessig|branntweinessig|essenz)\b/i.test(n)) return true;
  if (/\b(öls?|öl\b|pflanzenöl|olivenöl|sesamöl|distelöl|sonnenblumenöl|rapsöl)\b/i.test(n)) return true;
  if (/\b(senf|ketchup|mayo|mayonnaise|worcester|tabasco|sriracha|harissa)\b/i.test(n)) return true;
  if (/\b(soße|soss|dressing|würzsauce|fischsauce|oyster|sojasauce|pesto)\b/i.test(n)) return true;
  if (/\b(kapern|paste|currypaste|wasabi|relish)\b/i.test(n)) return true;
  if (/\b(sirup|honig|ahornsirup|melasse|marmelade|nutella|konfit)\b/i.test(n)) return true;
  return false;
}

function parseLeadingCountFromName(name: string): number {
  const m = name.trim().match(/^(\d+)/);
  if (!m) return 1;
  const n = parseInt(m[1], 10);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** Gramm pro Scheibe aus einer Serving-Zeile mit „Scheibe(n)“. */
export function inferScheibeGramsFromFood(food: Food): number | null {
  const s = food.servings?.find(x => /scheibe/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}

/** „4 x 35g“, „4×35 g“ → Gramm pro Einheit (35). */
export function parseGramsPerUnitFromPackNotation(text: string): number | null {
  const m =
    text.match(/\b(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*g\b/i) ??
    text.match(/(?:^|[·\s])(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
  if (!m) return null;
  const per = parseFloat(m[2].replace(',', '.'));
  return Number.isFinite(per) && per > 0 ? Math.round(per) : null;
}

/** Gramm (bzw. ml≈g) pro Portion aus einer „…Portion…“-Serving-Zeile oder Packungsangabe. */
export function inferPortionGramsFromFood(food: Food): number | null {
  const s = food.servings?.find(x => /\bportion/i.test(x.name) && x.grams > 0);
  if (s) {
    const k = parseLeadingCountFromName(s.name);
    return Math.max(1, Math.round(s.grams / k));
  }
  for (const source of [food.name, ...(food.servings ?? []).map(x => x.name)]) {
    const per = parseGramsPerUnitFromPackNotation(source);
    if (per != null) return per;
  }
  for (const s of food.servings ?? []) {
    if (!s.grams || s.grams <= 0) continue;
    const pack = s.name.match(/\b(\d+)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*g\b/i);
    if (!pack) continue;
    const count = parseInt(pack[1], 10);
    const perPiece = parseFloat(pack[2].replace(',', '.'));
    if (Number.isFinite(perPiece) && perPiece > 0) return Math.round(perPiece);
    if (Number.isFinite(count) && count > 0) return Math.max(1, Math.round(s.grams / count));
  }
  return null;
}

export type LogUnitEquivalent = { value: number; measure: 'g' | 'ml' };

/** Gramm/ml pro Log-Einheit (z. B. 1 Portion = 35 g) — für Hinweistext im UI. */
export function getLogUnitEquivalentAmount(food: Food, unit: string): LogUnitEquivalent | null {
  const u = unit.toLowerCase();
  if (u === 'portion') {
    const g = inferPortionGramsFromFood(food);
    return g != null ? { value: g, measure: 'g' } : null;
  }
  if (u === 'stk') return { value: inferStueckGramsFromFood(food), measure: 'g' };
  if (u === 'scheibe') {
    const g = inferScheibeGramsFromFood(food);
    return g != null ? { value: g, measure: 'g' } : null;
  }
  if (u === 'dose') {
    const g = inferDoseGramsFromFood(food);
    return g != null ? { value: g, measure: 'g' } : null;
  }
  if (u === 'glas') {
    const ml = inferGlasMlFromFood(food);
    return ml != null ? { value: ml, measure: 'ml' } : null;
  }
  if (u === 'flasche') {
    const ml = inferFlascheGramsFromFood(food);
    return ml != null ? { value: ml, measure: 'ml' } : null;
  }
  return null;
}

/** Gramm (bzw. ml≈g) pro Dose aus einer „…Dose…“-Serving-Zeile. */
export function inferDoseGramsFromFood(food: Food): number | null {
  const s = food.servings?.find(x => /dose/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}

/** ml pro Flasche (nur Getränke, nicht Condiment-Pour). */
export function inferFlascheGramsFromFood(food: Food): number | null {
  if (food.category !== 'drink' || isCondimentLikePourFood(food)) return null;
  const s = food.servings?.find(x => /flasche/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}

/** ml pro Glas/Becher — nur wenn die DB eine Glas-/Becher-Zeile hat. */
export function inferGlasMlFromFood(food: Food): number | null {
  if (food.category !== 'drink' || isCondimentLikePourFood(food)) return null;
  if (/\bshot\b/i.test(food.name)) return null;
  const s = food.servings?.find(x => /(glas|gläser|becher)/i.test(x.name) && x.grams > 0);
  if (!s) return null;
  const k = parseLeadingCountFromName(s.name);
  return Math.max(1, Math.round(s.grams / k));
}

export type DefaultLogPortion = { unit: string; quantity: number };

/**
 * Sinnvolle Start-Einheit nach Lebensmittel / Kategorie / Servings.
 * Getränke eher Glas oder Flasche; Konserven mit Dosen-Zeile → Dose; Würzmittel → ml — nicht „Stück“.
 */
export function inferDefaultLogPortionForFood(food: Food): DefaultLogPortion {
  const fn = food.name.toLowerCase();
  if (/\b(5|10)\s*kg\b|\bgrossgebinde\b|\bbulk\b|\bcatering\b/i.test(fn)) {
    return { unit: 'g', quantity: 200 };
  }

  if (isCondimentLikePourFood(food)) {
    return { unit: 'ml', quantity: 100 };
  }
  if (food.category === 'spice') {
    return { unit: 'g', quantity: 100 };
  }
  if (food.category === 'sauce') {
    return { unit: 'ml', quantity: 100 };
  }

  const doseG = inferDoseGramsFromFood(food);
  const mentionsDose = /\bdose\b/i.test(food.name) || (food.servings ?? []).some(s => /dose/i.test(s.name));
  if (doseG && mentionsDose && (food.category === 'canned' || /\bdose\b/i.test(food.name))) {
    return { unit: 'dose', quantity: 1 };
  }

  if (food.category === 'drink') {
    if (/\bshot\b/i.test(food.name)) {
      const s = food.servings?.find(x => x.grams > 0);
      return { unit: 'ml', quantity: s ? Math.max(1, Math.round(s.grams)) : 30 };
    }
    for (const s of food.servings ?? []) {
      const sn = s.name.toLowerCase();
      if (/flasche/.test(sn) && s.grams > 0) return { unit: 'flasche', quantity: 1 };
    }
    for (const s of food.servings ?? []) {
      const sn = s.name.toLowerCase();
      if (/(glas|gläser|becher)/.test(sn) && s.grams > 0) return { unit: 'glas', quantity: 1 };
    }
    if (inferFlascheGramsFromFood(food)) return { unit: 'flasche', quantity: 1 };
    if (inferGlasMlFromFood(food)) return { unit: 'glas', quantity: 1 };
    const mlServing = (food.servings ?? []).find(s => s.grams > 0);
    return { unit: 'ml', quantity: mlServing ? Math.max(1, Math.round(mlServing.grams)) : 100 };
  }

  if (doseG && mentionsDose) {
    return { unit: 'dose', quantity: 1 };
  }

  const scheibeG = inferScheibeGramsFromFood(food);
  if (scheibeG && /\b(brot|toast|vollkorn|schwarz|weißbrot|baguette)\b/i.test(food.name)) {
    return { unit: 'scheibe', quantity: 1 };
  }

  if (inferPortionGramsFromFood(food)) {
    return { unit: 'portion', quantity: 1 };
  }

  if (hasMeaningfulStueckServing(food)) {
    return { unit: 'stk', quantity: 1 };
  }

  return { unit: 'g', quantity: 100 };
}

/** Im Log-UI anbietbare Mengen-Einheiten (Reihenfolge = Dropdown-Reihenfolge). */
export type LogUnitValue =
  | 'g'
  | 'ml'
  | 'stk'
  | 'scheibe'
  | 'portion'
  | 'dose'
  | 'glas'
  | 'flasche'
  | 'tl'
  | 'el';

const LOG_UNIT_ENUM: LogUnitValue[] = [
  'g',
  'ml',
  'stk',
  'scheibe',
  'portion',
  'dose',
  'glas',
  'flasche',
  'tl',
  'el',
];

function isLogUnitValue(u: string): u is LogUnitValue {
  return LOG_UNIT_ENUM.includes(u as LogUnitValue);
}

/** Relevante Einheiten für dieses Lebensmittel (keine feste Superliste). */
export function collectLogUnitChoicesForFood(food: Food): LogUnitValue[] {
  const out: LogUnitValue[] = [];
  const add = (u: LogUnitValue) => {
    if (!out.includes(u)) out.push(u);
  };

  if (isCondimentLikePourFood(food)) {
    add('ml');
    add('tl');
    add('el');
    add('g');
    return out;
  }

  if (food.category === 'spice') {
    add('g');
    add('tl');
    add('el');
    add('ml');
    return out;
  }

  if (food.category === 'sauce') {
    add('ml');
    add('g');
    add('tl');
    add('el');
    return out;
  }

  if (food.category === 'drink') {
    add('ml');
    if (inferGlasMlFromFood(food)) add('glas');
    if (inferFlascheGramsFromFood(food)) add('flasche');
    if (inferDoseGramsFromFood(food)) add('dose');
    add('g');
    return out;
  }

  add('g');
  if (hasMeaningfulStueckServing(food)) add('stk');
  if (inferScheibeGramsFromFood(food)) add('scheibe');
  if (inferPortionGramsFromFood(food)) add('portion');
  if (inferDoseGramsFromFood(food)) add('dose');
  add('ml');
  add('tl');
  add('el');

  return out;
}

/** Wie {@link collectLogUnitChoicesForFood}, aber abweichend gespeicherte Einheit bleibt auswählbar. */
export function logUnitChoicesForFoodWithFallback(food: Food, currentUnit: string | undefined): LogUnitValue[] {
  const base = collectLogUnitChoicesForFood(food);
  const raw = (currentUnit || '').toLowerCase().replace(/\./g, '').trim();
  const mapped =
    raw === 'stück' || raw === 'stueck' || raw === 'piece' || raw === 'pc' ? 'stk' : raw === 'slice' ? 'scheibe' : raw;
  if (mapped && isLogUnitValue(mapped) && !base.includes(mapped)) return [...base, mapped];
  return base;
}

export type LogPortionQuickAction = {
  unit: string;
  quantity: number;
  /** Anzeige (Serving-Name aus OFF) */
  label: string;
};

/**
 * Leitet aus einer Serving-Zeile die passende Log-Einheit + Menge ab (keine festen UI-Magic-Numbers).
 */
export function servingToLogPortion(food: Food, serving: Serving): LogPortionQuickAction | null {
  if (!serving.grams || serving.grams <= 0) return null;
  const sn = serving.name.trim();
  const low = sn.toLowerCase();

  if (/stk\.?|stück|stueck|\bpiece\b/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: 'stk', quantity: k, label: sn };
  }
  if (/scheibe/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: 'scheibe', quantity: k, label: sn };
  }
  if (/dose/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: 'dose', quantity: k, label: sn };
  }
  if (/(glas|gläser|becher)/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: 'glas', quantity: k, label: sn };
  }
  if (/flasche/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: 'flasche', quantity: k, label: sn };
  }
  if (/\bportion/i.test(low)) {
    const k = parseLeadingCountFromName(sn);
    return { unit: 'portion', quantity: k, label: sn };
  }
  if (/^100\s*g$/i.test(sn)) {
    return { unit: 'g', quantity: 100, label: sn };
  }
  if (/\bml\b/i.test(sn) || (food.category === 'drink' && !/g\b/i.test(sn))) {
    return { unit: 'ml', quantity: Math.max(1, Math.round(serving.grams)), label: sn };
  }
  return { unit: 'g', quantity: Math.max(1, Math.round(serving.grams)), label: sn };
}

/** Quick-Select: Servings + dedizierte Einheiten nur wenn in der DB belegt. */
export function getLogPortionQuickActions(food: Food, maxPresets = 8): LogPortionQuickAction[] {
  const out: LogPortionQuickAction[] = [];
  const seen = new Set<string>();
  const glasMl = inferGlasMlFromFood(food);
  const doseG = inferDoseGramsFromFood(food);
  const flascheMl = inferFlascheGramsFromFood(food);

  const add = (a: LogPortionQuickAction) => {
    const k = `${a.unit}|${a.quantity}|${Math.round(a.quantity * 1000)}`;
    if (seen.has(k)) return;
    seen.add(k);
    out.push(a);
  };

  for (const s of getPortionQuickSelectPresets(food, maxPresets)) {
    if (
      shouldSkipServingForDedicatedUnitButtons(s, glasMl, doseG, flascheMl)
    ) {
      continue;
    }
    const p = servingToLogPortion(food, s);
    if (p) add(p);
  }

  if (food.category !== 'drink' && hasMeaningfulStueckServing(food)) {
    const stkServing = (food.servings ?? []).find(
      (s) => s.grams > 0 && /stk\.?|stück|stueck|\bpiece\b/i.test(s.name),
    );
    const label = stkServing?.name.trim() || `1 stk (${inferStueckGramsFromFood(food)} g)`;
    add({ unit: 'stk', quantity: 1, label });
  }
  const scheibeG = inferScheibeGramsFromFood(food);
  if (scheibeG != null && food.category !== 'drink') {
    add({ unit: 'scheibe', quantity: 1, label: `1 scheibe (${scheibeG} g)` });
  }
  const portionG = inferPortionGramsFromFood(food);
  if (portionG != null) {
    add({ unit: 'portion', quantity: 1, label: `1 portion (${portionG} g)` });
  }
  if (doseG != null) {
    add({ unit: 'dose', quantity: 1, label: `1 dose (${doseG} g)` });
  }
  if (glasMl != null) {
    add({ unit: 'glas', quantity: 1, label: `1 glas (${glasMl} ml)` });
  }
  if (flascheMl != null) {
    add({ unit: 'flasche', quantity: 1, label: `1 flasche (${flascheMl} ml)` });
  }

  return out;
}

function shouldSkipServingForDedicatedUnitButtons(
  s: Serving,
  glasMl: number | null,
  doseGrams: number | null,
  flascheMl: number | null,
): boolean {
  const g = Math.round(s.grams);
  const n = s.name;
  if (glasMl != null && g === glasMl && /(glas|gläser|becher|tasse|\bglass\b)/i.test(n)) return true;
  if (doseGrams != null && g === doseGrams && /dose|dosen/i.test(n)) return true;
  if (flascheMl != null && g === flascheMl && /flasche|flaschen|\bbottle\b/i.test(n)) return true;
  return false;
}

/** Standard-Menge beim Wechsel der Einheit im Dropdown (aus DB-Servings). */
export function defaultQuantityForLogUnit(food: Food, unit: string): number {
  const def = inferDefaultLogPortionForFood(food);
  if (def.unit === unit) return def.quantity;
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'ml') {
    const s100 = food.servings?.find(x => /^100\s*(g|ml)$/i.test(x.name.trim()));
    if (s100) return Math.max(1, Math.round(s100.grams));
    const first = food.servings?.find(x => x.grams > 0);
    if (first && (u === 'ml' ? food.category === 'drink' : true)) {
      return Math.max(1, Math.round(first.grams));
    }
    return 100;
  }
  return 1;
}
