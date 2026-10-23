import { capitalizeFoodDisplayName } from './foodDisplayName';
import { genericSlugFromTableKey } from './catalog/genericFoodRegistry';
import { resolveGenericTableKey } from './pipeline/GenericFallbackTable';
import type { MealAnalysis, MealComponent } from './pipeline/schemas';

export type MealSegmentForOil = {
  meal_name: string;
  items: Array<{
    name: string;
    quantity: number;
    unit: 'stk' | 'scheibe' | 'g' | 'ml';
    note?: string | null;
  }>;
};

/** Brat-/Ofen-/Blech-Kontext — Öl typischerweise dabei. */
const COOKING_FAT_CONTEXT_RE =
  /ofenblech|backblech|auf\s+dem\s+blech|vom\s+blech|im\s+ofen|ofen\s*gemüse|ofengemüse|blech\s+mit|backblech\s+mit|sheet\s*pan|gebraten|angebraten|in\s+der\s+pfanne|bratpfanne|frittiert|pfannenkartoffeln|bratkartoffeln|brat[aä]sieren|röst[aä]|grill[aä]|überbacken|überbackenes/i;

const NO_COOKING_OIL_RE =
  /\b(ohne\s+(öl|fett|butter)|kein\s+(öl|fett)|nur\s+gekocht|nur\s+d[aä]mpf|ged[aä]mpft|im\s+wasser\s+gekocht|roh\b|rohes\s+|kalter\s+salat)\b/i;

const COOKING_FAT_NAME_RE =
  /\b(olivenöl|olivenoel|rapsöl|rapsoel|sonnenblumenöl|pflanzenöl|speiseöl|butterschmalz|butter|margarine|öl\b)\b/i;

export function textImpliesCookingFat(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (NO_COOKING_OIL_RE.test(t)) return false;
  return COOKING_FAT_CONTEXT_RE.test(t);
}

export function namesIncludeCookingFat(names: string[]): boolean {
  return names.some((n) => COOKING_FAT_NAME_RE.test(n.trim()));
}

export function estimateCookingOilGrams(text: string): number {
  const t = text.toLowerCase();
  if (/frittiert|frittier|viel\s+öl|sehr\s+fett/i.test(t)) return 20;
  if (/leicht|wenig\s+öl|sparsam/i.test(t)) return 6;
  if (/ofenblech|backblech|blech\s+mit|ofengemüse|im\s+ofen/i.test(t)) return 12;
  if (/pfanne|gebraten|angebraten|bratkartoffeln/i.test(t)) return 10;
  return 12;
}

function preferredOilName(text: string): string {
  return /\brapsöl|rapsoel\b/i.test(text) ? 'Rapsöl' : 'Olivenöl';
}

/** Nach KI-Segmentierung: Olivenöl ergänzen, wenn Brat-/Ofen-Kontext aber kein Fett in items. */
export function ensureCookingOilInSegments(
  segments: MealSegmentForOil,
  userText: string,
): MealSegmentForOil {
  const combined = `${userText}\n${segments.meal_name}\n${segments.items.map((i) => i.name).join('\n')}`;
  if (!textImpliesCookingFat(combined)) return segments;
  if (namesIncludeCookingFat(segments.items.map((i) => i.name))) return segments;

  const grams = estimateCookingOilGrams(combined);
  return {
    ...segments,
    items: [
      ...segments.items,
      {
        name: preferredOilName(combined),
        quantity: grams,
        unit: 'g',
        note: 'automatisch für Brat-/Ofen-Zubereitung',
      },
    ],
  };
}

function buildOilComponent(name: string, grams: number): MealComponent {
  const trimmed = capitalizeFoodDisplayName(name);
  const tableKey = resolveGenericTableKey(trimmed);
  return {
    id: 'c_oil_auto',
    name: trimmed,
    role: 'ingredient',
    estimated_grams: grams,
    estimated_piece_count: null,
    grams_per_piece: 15,
    gram_confidence: 'medium',
    gram_reasoning: 'Automatisch ergänzt: Brat-/Ofen-/Pfannen-Zubereitung (geschätztes Öl)',
    is_cooked: false,
    cooking_method: null,
    search_strategy: {
      primary: [trimmed, 'Olivenöl', 'olive oil'],
      secondary: [],
      generic_fallback: [trimmed],
      off_database_fallback: tableKey ? genericSlugFromTableKey(tableKey) : 'olive_oil_generic',
      openfoodfacts_categories: [],
    },
  };
}

/** Vollanalyse / Foto-Fallback: gleiche Regel auf MealAnalysis. */
export function ensureCookingOilInAnalysis(analysis: MealAnalysis, userText: string): MealAnalysis {
  const names = analysis.components.map((c) => c.name);
  const combined = `${userText}\n${analysis.meal_name}\n${analysis.notes ?? ''}\n${names.join('\n')}`;
  if (!textImpliesCookingFat(combined)) return analysis;
  if (namesIncludeCookingFat(names)) return analysis;

  const grams = estimateCookingOilGrams(combined);
  const oil = buildOilComponent(preferredOilName(combined), grams);
  const components = [...analysis.components, oil].map((c, i) => ({ ...c, id: `c${i + 1}` }));
  const total = components.reduce((s, c) => s + c.estimated_grams, 0);
  return { ...analysis, components, total_estimated_weight_g: total };
}
