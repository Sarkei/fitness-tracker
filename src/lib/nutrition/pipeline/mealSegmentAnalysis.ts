import { z } from 'zod';
import { completeMealAnalysis } from '../../../../aiProviders';
import { lookupDefaultPortion } from '../defaultPortionLookup';
import { enrichAnalysisWithPortionCatalog } from '../enrichPortionDefaults';
import { ensurePieceGramsForReview, pieceContextFromAnalysis, resolvePieceGrams } from '../pieceUnitHelpers';
import { normalizeMealInputForCache } from './pipelineInputCache';
import type { MealAnalysis, MealComponent } from './schemas';
import { isCompositeComponentName } from './atomicMealAnalysis';
import { genericSlugFromTableKey } from '../catalog/genericFoodRegistry';
import { capitalizeFoodDisplayName, isNonFoodUtensilName } from '../foodDisplayName';
import { ensureCookingOilInSegments } from '../ensureCookingOil';
import { resolveGenericTableKey } from './GenericFallbackTable';

/** Schritt 1 — nur segmentieren (wie Chat-KI: einzelne Lebensmittel + Menge). */
export const MealSegmentResultSchema = z.object({
  meal_name: z.string().min(1),
  items: z
    .array(
      z.object({
        name: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.enum(['stk', 'scheibe', 'g', 'ml']),
        note: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

export type MealSegmentResult = z.infer<typeof MealSegmentResultSchema>;

const SEGMENT_PROMPT = `Du segmentierst eine Mahlzeit in einzelne Lebensmittel für die Datenbank Open Food Facts (OFF).

Antworte NUR mit validem JSON (kein Markdown).

Regeln:
- Nur einzelne Lebensmittel — maximal atomar segmentieren (jedes Item = ein Basis-Lebensmittel).
- Keine zusammengesetzten Gerichtnamen (verboten: Leberkässemmel, Cheeseburger, Döner als ein Item).
- Keine Marken, keine Zusatzbeschreibungen im Namen (nur: Leberkäse, Semmel, Senf — nicht „Backofen-Leberkäse Billa“).
- Bei Leberkässemmel: "Leberkäse" (nicht Fleischkäse) — warme Scheibe ca. 55 g, nicht 25 g Aufschnitt.
- quantity = Stückzahl bei stk/scheibe, bei g/ml = Gramm bzw. Milliliter.
- Gleicher Eingabetext → gleiche items (stabile Namen: Semmel bleibt Semmel).
- Jeder name beginnt mit einem Großbuchstaben (z. B. „Paprika“, nicht „paprika“).
- Kein Küchengerät als Lebensmittel (verboten: Ofenblech, Backblech, Pfanne, Backpapier).
- Keine pauschalen 100 g für alles — realistische Portionen (Gemüse am Blech oft 80–200 g pro Sorte oder 1 stk).
- Keine Kalorien, keine Marken erfinden.

FETT / BRATEN / OFEN (wichtig für realistische Kalorien):
- Wenn aus dem Text klar hervorgeht, dass gebraten, angebraten, in der Pfanne, auf dem Blech/Ofen mit Fett, frittiert, gebacken mit Öl o. Ä.:
  → zusätzlich ein Item "Olivenöl" (oder "Rapsöl" nur wenn explizit genannt) als eigene Zeile.
- Öl-Menge realistisch schätzen (nicht übertreiben):
  • leicht angebraten / wenig Gemüse in der Pfanne: ca. 5–8 g Öl (quantity in g)
  • normales Anbraten (Hähnchen, Ofengemüse-Blech): ca. 8–15 g Öl
  • deutlich fettig / frittiert / viel Öl im Text: ca. 15–25 g Öl
- Ofenblech mit Gemüse + Fleisch/Käse: PFLICHT-Zeile Olivenöl ca. 10–15 g (auch wenn „Ofenblech“ nur im Mahlzeitentitel steht).
- Kein Öl bei kochen/wallend/kalte Salate/roh, unless explicitly mentioned.
- Wenn USER_INPUT „Ofenblech“ enthält: IMMER Olivenöl als separates Item (System ergänzt sonst automatisch).
- Öl immer als separates Item, nicht in Gemüse/Fleisch „verstecken“.

Beispiel Eingabe: "2 Leberkässemmeln mit süßem Senf"
  → items: [
      {"name":"Leberkäse","quantity":2,"unit":"scheibe"},
      {"name":"Semmel","quantity":2,"unit":"stk"},
      {"name":"Süßer Senf","quantity":15,"unit":"g","note":"Beilage"}
    ]

Beispiel: "Ofenblech mit Kartoffeln, Paprika, Hähnchen"
  → zusätzlich z. B. {"name":"Olivenöl","quantity":12,"unit":"g","note":"für Ofenblech"}

JSON-Schema:
{"meal_name":string,"items":[{"name":string,"quantity":number,"unit":"stk"|"scheibe"|"g"|"ml","note":string|null}]}`;

function extractJson(raw: string): unknown {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('segment-invalid-json');
  return JSON.parse(text.slice(start, end + 1));
}

function offSearchTermsForItem(name: string): string[] {
  const trimmed = name.trim();
  const key = trimmed.toLowerCase();
  const terms = new Set<string>([trimmed]);
  if (/leberk[aä]se/.test(key) && !/fleischk[aä]se/.test(key)) {
    terms.add('Leberkäse');
    terms.add('Leberkaese');
  }
  if (/fleischk[aä]se/.test(key)) terms.add('Fleischkäse');
  if (/semmel/.test(key)) {
    terms.add('Semmel');
    terms.add('Brötchen');
  }
  if (/br[oö]tchen/.test(key) && !/semmel/.test(key)) terms.add('Brötchen');
  if (/senf/.test(key)) {
    terms.add('Senf');
    terms.add('süßer Senf');
  }
  if (/oliven|raps|sonnenblumen|pflanzen/.test(key) && /öl|ol\b/.test(key)) {
    terms.add('Olivenöl');
    terms.add('olive oil');
  }
  return [...terms];
}

function slugOffFallback(name: string): string {
  const resolved = resolveGenericTableKey(name);
  if (resolved) return genericSlugFromTableKey(resolved);
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

/** KI-korrigierte Mengen (vermeidet pauschal 100 g, normalisiert Namen). */
function normalizeSegmentItem(item: MealSegmentResult['items'][number]): MealSegmentResult['items'][number] {
  const name = capitalizeFoodDisplayName(item.name);
  let quantity = item.quantity;
  let unit = item.unit;
  const def = lookupDefaultPortion(name);

  if ((unit === 'g' || unit === 'ml') && quantity === 100 && def) {
    if (def.unit === 'g' || def.unit === 'ml') {
      quantity = def.grams;
    } else if (def.unit === 'stk' || def.unit === 'scheibe') {
      unit = def.unit;
      quantity = Math.max(0.25, quantity > 0 && quantity <= 4 ? quantity : 1);
    }
  }

  if (unit === 'g' && def && (def.unit === 'g' || def.unit === 'ml') && quantity < def.grams * 0.35) {
    quantity = def.grams;
  }

  return { ...item, name, quantity, unit };
}

function gramsForSegmentItem(item: MealSegmentResult['items'][number]): {
  grams: number;
  pieceCount: number | null;
  pieceGrams: number | null;
} {
  if (item.unit === 'g' || item.unit === 'ml') {
    const grams = Math.max(1, Math.round(item.quantity));
    const pieceGrams = ensurePieceGramsForReview(
      pieceContextFromAnalysis(item.name, null, grams, null),
    );
    return {
      grams,
      pieceCount: Math.max(0.25, Math.round((grams / pieceGrams) * 4) / 4),
      pieceGrams,
    };
  }

  const provisionalGrams =
    item.unit === 'stk'
      ? Math.max(1, Math.round(item.quantity * 60))
      : Math.max(1, Math.round(item.quantity * (/leberk[aä]se/i.test(item.name) ? 55 : 25)));
  const pieceGrams = resolvePieceGrams(
    pieceContextFromAnalysis(item.name, null, provisionalGrams, null),
  );
  const per =
    pieceGrams ??
    lookupDefaultPortion(item.name)?.grams ??
    (item.unit === 'scheibe' ? (/leberk[aä]se/i.test(item.name) ? 55 : 25) : 60);
  return {
    grams: Math.max(1, Math.round(per * item.quantity)),
    pieceCount: item.quantity,
    pieceGrams: per,
  };
}

export function mealAnalysisFromSegments(
  segments: MealSegmentResult,
  userText: string,
): MealAnalysis {
  const components: MealComponent[] = segments.items
    .map((item) => normalizeSegmentItem(item))
    .filter((item) => !isCompositeComponentName(item.name) && !isNonFoodUtensilName(item.name))
    .map((item, idx) => {
      const { grams, pieceCount, pieceGrams } = gramsForSegmentItem(item);
      const qtyLabel =
        item.unit === 'g' || item.unit === 'ml'
          ? `${item.quantity} ${item.unit}`
          : `${item.quantity}× ${item.unit}`;
      return {
        id: `c${idx + 1}`,
        name: item.name.trim(),
        role: 'ingredient',
        estimated_grams: grams,
        estimated_piece_count: pieceCount,
        grams_per_piece: pieceGrams,
        gram_confidence: 'high' as const,
        gram_reasoning: `Segmentierung: ${qtyLabel}${item.note ? ` (${item.note})` : ''}`,
        is_cooked: true,
        cooking_method: null,
        search_strategy: {
          primary: offSearchTermsForItem(item.name),
          secondary: [],
          generic_fallback: [item.name.trim()],
          off_database_fallback: slugOffFallback(item.name) || 'white_bread_generic',
          openfoodfacts_categories: [],
        },
      };
    });

  if (components.length === 0) {
    throw new Error('segment-no-atomic-items');
  }

  const total = components.reduce((s, c) => s + c.estimated_grams, 0);
  return {
    input_type: 'text',
    input_language: 'de',
    meal_name: capitalizeFoodDisplayName(segments.meal_name).slice(0, 200),
    meal_category: 'mixed',
    cuisine: 'german',
    total_estimated_weight_g: total,
    portion_context: 'segment-then-off-v2-strict',
    confidence_overall: 'high',
    is_chain_restaurant: false,
    chain_name: null,
    components,
    notes: userText.trim() ? `Eingabe: ${userText.trim().slice(0, 500)}` : null,
    image_analysis: null,
  };
}

/** Schritt 1: KI segmentiert — danach OFF + Mengen im bestehenden Pipeline-Code. */
export async function segmentMealWithAi(
  userText: string,
  image?: { mimeType: string; data: string },
): Promise<MealAnalysis> {
  const normalized = normalizeMealInputForCache(userText);
  const prompt = `${SEGMENT_PROMPT}\n\nNORMALIZED_INPUT:\n${normalized}\n\nUSER_INPUT:\n${userText}`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const hint =
        attempt === 0 ? '' : '\n\nNur gültiges JSON. Nur einzelne Lebensmittel mit Menge.';
      const raw = await completeMealAnalysis(`${prompt}${hint}`, image, {
        temperature: 0,
        responseMode: 'json_object',
      });
      const segments = MealSegmentResultSchema.parse(extractJson(raw));
      const withOil = ensureCookingOilInSegments(segments, userText);
      const analysis = mealAnalysisFromSegments(withOil, userText);
      return enrichAnalysisWithPortionCatalog(analysis);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`segment-failed:${lastError instanceof Error ? lastError.message : String(lastError)}`);
}
