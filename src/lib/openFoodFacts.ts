/**
 * Open Food Facts → App-Food-Mapping (Nährwerte pro 100 g).
 * @see https://openfoodfacts.github.io/openfoodfacts-server/api/
 */

import type { Food, NutrientLevelGrade, OffNutritionGrades, Serving } from './foodDatabase';

/** OFF verlangt einen aussagekräftigen User-Agent (App + Kontakt), kein API-Key. */
export const OFF_USER_AGENT =
  'VRTX-FitnessTracker/1.0 (nutrition; contact: reuse@openfoodfacts.org)';

/**
 * search-a-licious liefert bei Umlauten (z. B. „Hähnchen“) oft Müll-Treffer (Einzelbuchstabe „h“).
 * Für API-Anfragen daher ASCII-Faltung — Anzeige/Ranking nutzt weiter den Original-Query.
 */
export function normalizeOffSearchQuery(query: string): string {
  return query
    .trim()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/Ä/g, 'Ae')
    .replace(/Ö/g, 'Oe')
    .replace(/Ü/g, 'Ue')
    .replace(/ß/g, 'ss');
}

type OffNutriments = Record<string, number | string | undefined>;

export type OffNutrientLevelsPayload = {
  fat?: string;
  'saturated-fat'?: string;
  sugars?: string;
  salt?: string;
};

export type OffProductPayload = {
  code?: string;
  product_name?: string;
  product_name_de?: string;
  /** API v2: Komma-String; search-a-licious: oft string[]. */
  brands?: string | string[];
  quantity?: string;
  serving_size?: string;
  serving_quantity?: number | string;
  serving_quantity_unit?: string;
  product_quantity?: string;
  nutriments?: OffNutriments;
  nutrient_levels?: OffNutrientLevelsPayload;
  nutriscore_grade?: string;
  nova_group?: number | string;
};

function brandsLabel(raw: OffProductPayload['brands']): string {
  if (Array.isArray(raw)) {
    return raw.map((b) => String(b).trim()).filter(Boolean).join(', ');
  }
  return String(raw ?? '').trim();
}

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function kcalPer100g(n: OffNutriments): number | null {
  const kcal = num(n['energy-kcal_100g']) ?? num(n.energy_kcal_100g);
  if (kcal != null) return Math.max(0, kcal);
  const kj = num(n['energy-kj_100g']) ?? num(n.energy_100g);
  if (kj != null) return Math.max(0, Math.round(kj / 4.184));
  return null;
}

function labelText(value: unknown): string {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean).join(', ');
  }
  return String(value).trim();
}

function parseMassMlFromText(text: string): { grams: number; isMl: boolean } | null {
  const t = text.trim().toLowerCase();
  const m = t.match(/(\d+(?:[.,]\d+)?)\s*(kg|kilogramm|g|gramm|ml|milliliter|l|liter|cl|cl\.)/i);
  if (!m) return null;
  let n = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  const u = m[2].toLowerCase();
  if (u === 'kg' || u === 'kilogramm') return { grams: Math.round(n * 1000), isMl: false };
  if (u === 'l' || u === 'liter') return { grams: Math.round(n * 1000), isMl: true };
  if (u === 'cl' || u === 'cl.') return { grams: Math.round(n * 10), isMl: true };
  if (u === 'ml' || u === 'milliliter') return { grams: Math.round(n), isMl: true };
  return { grams: Math.round(n), isMl: false };
}

function mapLevel(raw: unknown): NutrientLevelGrade | undefined {
  const s = String(raw ?? '').trim().toLowerCase();
  if (s === 'low' || s === 'moderate' || s === 'high') return s;
  return undefined;
}

export function mapOffNutritionGrades(product: OffProductPayload): OffNutritionGrades | undefined {
  const levelsRaw = product.nutrient_levels;
  const levels = levelsRaw
    ? {
        fat: mapLevel(levelsRaw.fat),
        saturatedFat: mapLevel(levelsRaw['saturated-fat']),
        sugars: mapLevel(levelsRaw.sugars),
        salt: mapLevel(levelsRaw.salt),
      }
    : undefined;
  const ns = String(product.nutriscore_grade ?? '')
    .trim()
    .toLowerCase();
  const nutriScore =
    ns === 'a' || ns === 'b' || ns === 'c' || ns === 'd' || ns === 'e' ? ns : undefined;
  const nova = num(product.nova_group);
  const hasLevels = levels && Object.values(levels).some(Boolean);
  if (!nutriScore && !hasLevels && nova == null) return undefined;
  return {
    ...(nutriScore ? { nutriScore } : {}),
    ...(nova != null ? { novaGroup: Math.round(nova) } : {}),
    ...(hasLevels ? { levels } : {}),
  };
}

/** Servings aus OFF-Menge / serving_size (Packung, Flasche, …). */
export function buildServingsFromOffProduct(product: OffProductPayload): Serving[] {
  const out: Serving[] = [{ name: '100 g', grams: 100 }];
  const seen = new Set<number>([100]);

  const add = (name: string, grams: number) => {
    const g = Math.max(1, Math.round(grams));
    if (seen.has(g) && /100\s*g/i.test(name)) return;
    if (seen.has(g) && out.some((s) => s.grams === g && s.name === name)) return;
    seen.add(g);
    out.push({ name: name.slice(0, 80), grams: g });
  };

  const sq = num(product.serving_quantity);
  const sqUnit = labelText(product.serving_quantity_unit).toLowerCase();
  if (sq != null && sq > 0) {
    if (sqUnit === 'kg') add(`1 Portion (${sq} kg)`, Math.round(sq * 1000));
    else if (sqUnit === 'l' || sqUnit === 'liter') add(`1 Portion (${sq} l)`, Math.round(sq * 1000));
    else if (sqUnit === 'ml') add(`1 Portion (${sq} ml)`, Math.round(sq));
    else add(`1 Portion (${sq} g)`, Math.round(sq));
  }

  const qty = labelText(product.quantity || product.product_quantity);
  const pack = qty ? parseMassMlFromText(qty) : null;
  if (pack) {
    const isBulk = pack.grams >= 1500;
    if (pack.isMl) {
      const canSize = pack.grams <= 600;
      if (canSize) {
        add(`1 Dose (${qty})`, pack.grams);
      } else {
        add(`1 Flasche (${qty})`, pack.grams);
      }
      if (!isBulk && pack.grams > 600) {
        add(`1 Glas (${qty})`, Math.min(pack.grams, Math.max(150, Math.round(pack.grams / 4))));
      }
    } else {
      add(`1 Packung (${qty})`, pack.grams);
      if (!isBulk) {
        add(`1 Stück (${qty})`, pack.grams);
      }
    }
  }

  const ss = labelText(product.serving_size);
  if (ss) {
    const serving = parseMassMlFromText(ss);
    if (serving) {
      const label = serving.isMl ? `1 Portion (${ss})` : `1 Portion (${ss})`;
      add(label, serving.grams);
      if (!serving.isMl && serving.grams >= 15 && serving.grams <= 600) {
        add(`1 Stück (${ss})`, serving.grams);
      }
    }
  }

  return out;
}

function buildDisplayName(product: OffProductPayload, barcode: string): string {
  const base =
    (product.product_name_de || product.product_name || '').trim() ||
    `Produkt ${barcode}`;
  const brand = brandsLabel(product.brands).split(',')[0]?.trim();
  const qty = labelText(product.quantity);
  const parts = [base];
  if (brand && !base.toLowerCase().includes(brand.toLowerCase())) parts.push(brand);
  if (qty) parts.push(qty);
  return parts.join(' · ').slice(0, 200);
}

/** Mappt ein OFF-Produkt auf {@link Food}; `null` wenn keine verwertbaren Nährwerte. */
export function mapOpenFoodFactsProduct(product: OffProductPayload, barcode: string): Food | null {
  const code = String(barcode).replace(/\D/g, '');
  if (!code) return null;
  const n = product.nutriments ?? {};
  const calories = kcalPer100g(n);
  const protein = num(n.proteins_100g);
  const carbs = num(n.carbohydrates_100g);
  const fat = num(n.fat_100g);
  const hasName = Boolean((product.product_name_de || product.product_name || '').trim());
  if (!hasName && calories == null && protein == null && carbs == null && fat == null) return null;

  const offGrades = mapOffNutritionGrades(product);

  return {
    id: `off_${code}`,
    name: buildDisplayName(product, code),
    category: 'readymeal',
    nutrients: {
      calories: Math.round(calories ?? 0),
      protein: Math.round((protein ?? 0) * 10) / 10,
      carbs: Math.round((carbs ?? 0) * 10) / 10,
      fat: Math.round((fat ?? 0) * 10) / 10,
    },
    servings: buildServingsFromOffProduct(product),
    ...(offGrades ? { offGrades } : {}),
    catalogSource: 'openfoodfacts',
  };
}

export function mapOpenFoodFactsSearchHit(hit: OffProductPayload): Food | null {
  const code = String(hit.code ?? '').replace(/\D/g, '');
  if (!code) return null;
  return mapOpenFoodFactsProduct(hit, code);
}
