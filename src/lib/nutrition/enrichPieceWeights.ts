import { completeMealAnalysis } from '../../../aiProviders';
import {
  ensurePieceGramsForReview,
  parsePieceGramsFromServingSize,
  pieceContextFromAnalysis,
} from './pieceUnitHelpers';
import type { ComponentMatch, MealAnalysis, MealComponent } from './pipeline/schemas';

function extractJson(raw: string): unknown {
  const text = raw.trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('invalid-json');
  return JSON.parse(text.slice(start, end + 1));
}

function withDerivedPieceCount(comp: MealComponent, pieceG: number): MealComponent {
  const next: MealComponent = { ...comp, grams_per_piece: pieceG };
  if (
    (next.estimated_piece_count == null || next.estimated_piece_count <= 0) &&
    next.estimated_grams > 0 &&
    pieceG > 0
  ) {
    next.estimated_piece_count = Math.max(0.25, Math.round((next.estimated_grams / pieceG) * 4) / 4);
  }
  return next;
}

/** Setzt grams_per_piece für alle Komponenten (Katalog, Heuristik, Kontext). */
export function ensurePieceWeightsOnAnalysis(
  analysis: MealAnalysis,
  matches?: ComponentMatch[],
): MealAnalysis {
  const components = analysis.components.map((comp) => {
    if (comp.grams_per_piece != null && comp.grams_per_piece > 0) {
      return withDerivedPieceCount(comp, Math.round(comp.grams_per_piece));
    }
    const match = matches?.find((m) => m.component_id === comp.id);
    const top = match?.candidates[(match?.auto_selected_rank ?? 1) - 1] ?? match?.candidates[0];
    const fromServing = parsePieceGramsFromServingSize(top?.serving_size);
    const ctx = pieceContextFromAnalysis(comp.name, top?.serving_size ?? null, comp.estimated_grams, comp);
    const pieceG = fromServing ?? ensurePieceGramsForReview(ctx);
    return withDerivedPieceCount(comp, pieceG);
  });
  return { ...analysis, components };
}

function needsOffAiPieceEstimate(match: ComponentMatch | undefined): boolean {
  const top = match?.candidates[(match?.auto_selected_rank ?? 1) - 1] ?? match?.candidates[0];
  if (!top || top.data_source !== 'openfoodfacts') return false;
  return !parsePieceGramsFromServingSize(top.serving_size);
}

/** KI-Schätzung für OFF-Produkte ohne Stückangabe in serving_size. */
export async function enrichOffPieceWeightsWithAi(
  analysis: MealAnalysis,
  matches: ComponentMatch[],
): Promise<MealAnalysis> {
  const pending = analysis.components
    .map((comp) => {
      const match = matches.find((m) => m.component_id === comp.id);
      if (!needsOffAiPieceEstimate(match)) return null;
      const top = match?.candidates[(match?.auto_selected_rank ?? 1) - 1] ?? match?.candidates[0];
      return { comp, productLabel: top?.product_name ?? comp.name };
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x));

  if (pending.length === 0) return analysis;

  const list = pending
    .map((p, i) => `${i + 1}. "${p.comp.name}"${p.productLabel !== p.comp.name ? ` (Produkt: ${p.productLabel})` : ''}`)
    .join('\n');

  const prompt = `Schätze für jedes Lebensmittel das typische Gewicht EINES Stücks in Gramm (8–600).
Nur rohes JSON, kein Markdown.

Lebensmittel:
${list}

Antwortformat:
{"items":[{"name":"<exakt wie oben>","grams_per_piece":<number>}]}`;

  try {
    const raw = await completeMealAnalysis(prompt, undefined, {
      temperature: 0.2,
      responseMode: 'json_object',
    });
    const parsed = extractJson(raw) as {
      items?: Array<{ name?: string; grams_per_piece?: number }>;
    };
    const byName = new Map<string, number>();
    for (const row of parsed.items ?? []) {
      const name = String(row.name ?? '')
        .trim()
        .toLowerCase();
      const g = Number(row.grams_per_piece);
      if (name && Number.isFinite(g) && g >= 8 && g <= 600) {
        byName.set(name, Math.round(g));
      }
    }

    const components = analysis.components.map((comp) => {
      const key = comp.name.trim().toLowerCase();
      const aiG = byName.get(key);
      if (aiG == null) return comp;
      return withDerivedPieceCount(comp, aiG);
    });
    return { ...analysis, components };
  } catch (err) {
    console.warn('enrichOffPieceWeightsWithAi: skip', err);
    return analysis;
  }
}
