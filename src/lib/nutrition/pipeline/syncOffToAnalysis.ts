import {
  ensurePieceGramsForReview,
  parsePieceGramsFromServingSize,
  pieceContextFromAnalysis,
} from '../pieceUnitHelpers';
import type { ComponentMatch, MealAnalysis } from './schemas';

/** Nach OFF-Treffer: Scheibengewicht aus serving_size, Gramm zur Stückzahl anpassen. */
export function syncAnalysisAndMatchesFromOff(
  analysis: MealAnalysis,
  matches: ComponentMatch[],
): { analysis: MealAnalysis; matches: ComponentMatch[] } {
  const components = analysis.components.map((comp) => {
    const match = matches.find((m) => m.component_id === comp.id);
    const top = match?.candidates[(match.auto_selected_rank ?? 1) - 1] ?? match?.candidates[0];
    if (!top || top.data_source !== 'openfoodfacts') return comp;

    const fromServing = parsePieceGramsFromServingSize(top.serving_size);
    let next = { ...comp };
    const pieceG =
      fromServing ??
      (next.grams_per_piece && next.grams_per_piece > 0
        ? next.grams_per_piece
        : ensurePieceGramsForReview(
            pieceContextFromAnalysis(comp.name, top.serving_size, comp.estimated_grams, comp),
          ));
    if (pieceG > 0) {
      next.grams_per_piece = pieceG;
    }
    if (next.grams_per_piece && next.estimated_piece_count) {
      next.estimated_grams = Math.max(
        1,
        Math.round(next.estimated_piece_count * next.grams_per_piece),
      );
    }
    return next;
  });

  const nextMatches = matches.map((m) => {
    const comp = components.find((c) => c.id === m.component_id);
    if (!comp) return m;
    return { ...m, estimated_grams: comp.estimated_grams };
  });

  return {
    analysis: {
      ...analysis,
      components,
      total_estimated_weight_g: components.reduce((s, c) => s + c.estimated_grams, 0),
    },
    matches: nextMatches,
  };
}
