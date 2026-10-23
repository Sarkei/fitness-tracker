import { lookupDefaultPortion } from './defaultPortionLookup';
import { ensurePieceGramsForReview, isGramOnlyFood, pieceContextFromAnalysis } from './pieceUnitHelpers';
import type { MealAnalysis, MealComponent } from './pipeline/schemas';

function enrichComponent(component: MealComponent): MealComponent {
  const next = { ...component };
  if (next.grams_per_piece != null && next.grams_per_piece > 0) {
    const perPiece = next.grams_per_piece;
    if (
      (next.estimated_piece_count == null || next.estimated_piece_count <= 0) &&
      next.estimated_grams > 0 &&
      perPiece > 0
    ) {
      next.estimated_piece_count = Math.max(0.25, Math.round((next.estimated_grams / perPiece) * 4) / 4);
    }
    return next;
  }

  const def = lookupDefaultPortion(component.name);
  const pieceG = ensurePieceGramsForReview(
    pieceContextFromAnalysis(component.name, null, component.estimated_grams, component),
  );
  next.grams_per_piece = def && (def.unit === 'stk' || def.unit === 'scheibe') ? def.grams : pieceG;

  const perPiece = next.grams_per_piece ?? pieceG;
  if (
    !isGramOnlyFood(component.name) &&
    (next.estimated_piece_count == null || next.estimated_piece_count <= 0) &&
    next.estimated_grams > 0 &&
    perPiece > 0
  ) {
    next.estimated_piece_count = Math.max(0.25, Math.round((next.estimated_grams / perPiece) * 4) / 4);
  }

  return next;
}

/** Ergänzt KI-Komponenten mit Stück/Scheibe aus defaultPortions.de.json, wenn die KI nichts lieferte. */
export function enrichAnalysisWithPortionCatalog(analysis: MealAnalysis): MealAnalysis {
  return {
    ...analysis,
    components: analysis.components.map(enrichComponent),
  };
}
