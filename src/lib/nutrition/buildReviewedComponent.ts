import type { Ingredient } from '@/src/types';
import type { PortionDisplayUnit, ReviewedComponent } from '@/src/components/nutrition/MealReviewScreen';
import type { ComponentMatch, MealComponent } from '@/src/lib/nutrition/pipeline/schemas';
import {
  ensurePieceGramsForReview,
  gramsFromPieceQuantity,
  pieceContextFromAnalysis,
  pieceQuantityFromGrams,
} from '@/src/lib/nutrition/pieceUnitHelpers';

function findSavedIngredient(ingredients: Ingredient[] | undefined, componentName: string): Ingredient | undefined {
  if (!ingredients?.length) return undefined;
  const key = componentName.trim().toLowerCase();
  return ingredients.find((i) => i.name.trim().toLowerCase() === key);
}

/** Baut Review-Zeile mit stabiler Einheit (gleich beim ersten Track und beim Bearbeiten). */
export function buildReviewedComponent(
  match: ComponentMatch,
  options?: { gramsOverride?: number; savedIngredients?: Ingredient[]; analysisComponent?: MealComponent },
): ReviewedComponent {
  const selected = match.candidates[(match.auto_selected_rank ?? 1) - 1] ?? match.candidates[0];
  const grams = Math.max(1, Math.round(options?.gramsOverride ?? match.estimated_grams));
  const pieceCtx = pieceContextFromAnalysis(
    match.component_name,
    selected?.serving_size,
    grams,
    options?.analysisComponent,
  );
  const candidatePieceGrams = ensurePieceGramsForReview(pieceCtx);
  const saved = findSavedIngredient(options?.savedIngredients, match.component_name);

  if (saved?.unit === 'stk') {
    const pieceG =
      saved.amount != null && saved.amount > 0
        ? Math.max(8, Math.round(grams / saved.amount))
        : candidatePieceGrams;
    const qty =
      saved.amount != null && saved.amount > 0
        ? saved.amount
        : pieceQuantityFromGrams(grams, pieceG);
    const storedGrams =
      options?.gramsOverride != null
        ? Math.max(1, Math.round(options.gramsOverride))
        : gramsFromPieceQuantity(qty, pieceG);
    return {
      component_id: match.component_id,
      grams: storedGrams,
      selectedRank: match.auto_selected_rank ?? 1,
      user_modified: false,
      displayUnit: 'piece',
      pieceGrams: pieceG,
    };
  }

  if (saved?.unit === 'g') {
    return {
      component_id: match.component_id,
      grams: Math.max(1, Math.round(saved.amount ?? grams)),
      selectedRank: match.auto_selected_rank ?? 1,
      user_modified: false,
      displayUnit: 'piece',
      pieceGrams: candidatePieceGrams,
    };
  }

  return {
    component_id: match.component_id,
    grams,
    selectedRank: match.auto_selected_rank ?? 1,
    user_modified: false,
    displayUnit: 'piece',
    pieceGrams: candidatePieceGrams,
  };
}
