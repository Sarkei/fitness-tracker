import { useMemo } from 'react';
import type { PipelineResult } from '@/src/lib/nutrition/pipeline/schemas';
import { macrosForCandidate } from '@/src/lib/nutrition/pipeline/nutritionFromCandidate';
import { ensurePieceGramsForReview, pieceContextFromAnalysis } from '@/src/lib/nutrition/pieceUnitHelpers';
import IngredientRow from './IngredientRow';

export type PortionDisplayUnit = 'g' | 'piece';

export type ReviewedComponent = {
  component_id: string;
  grams: number;
  selectedRank: number;
  user_modified: boolean;
  /** Welche Einheit beim Speichern genutzt wurde – gleiche UI beim erneuten Öffnen. */
  displayUnit: PortionDisplayUnit;
  pieceGrams: number | null;
};

type Props = {
  result: PipelineResult;
  reviewed: ReviewedComponent[];
  onReviewedChange: (next: ReviewedComponent[]) => void;
  onAddIngredient?: () => void;
  onRemoveComponent?: (componentId: string) => void;
  isPhotoReview?: boolean;
};

export default function MealReviewScreen({
  result,
  reviewed,
  onReviewedChange,
  onAddIngredient,
  onRemoveComponent,
  isPhotoReview = false,
}: Props) {
  const nutritionById = useMemo(() => {
    const map = new Map<string, { kcal: number; protein: number; carbs: number; fat: number; fiber: number | null }>();
    for (const r of reviewed) {
      const match = result.matches.find((m) => m.component_id === r.component_id);
      const candidate = match?.candidates[(r.selectedRank || 1) - 1] ?? match?.candidates[0];
      if (!candidate) continue;
      const macros = macrosForCandidate(candidate, r.grams);
      map.set(r.component_id, macros);
    }
    return map;
  }, [result.matches, reviewed]);

  const updateRow = (componentId: string, patch: Partial<ReviewedComponent>) => {
    onReviewedChange(
      reviewed.map((r) =>
        r.component_id === componentId
          ? { ...r, ...patch, user_modified: true }
          : r,
      ),
    );
  };

  return (
    <div className="space-y-3">
      {result.matches.map((match) => {
        const row = reviewed.find((r) => r.component_id === match.component_id);
        const local = nutritionById.get(match.component_id);
        const analysisComponent = result.analysis.components.find((c) => c.id === match.component_id);
        if (!row) return null;
        const gramReasoning = analysisComponent?.gram_reasoning;
        return (
          <IngredientRow
            key={match.component_id}
            match={match}
            gramConfidence={analysisComponent?.gram_confidence}
            gramReasoning={gramReasoning}
            current={
              local
                ? {
                    component_id: match.component_id,
                    component_name: match.component_name,
                    grams: row.grams,
                    data_source: (match.candidates[row.selectedRank - 1] ?? match.candidates[0])?.data_source ?? 'estimated_fallback',
                    confidence_score: (match.candidates[row.selectedRank - 1] ?? match.candidates[0])?.score ?? 0,
                    kcal: local.kcal,
                    protein: local.protein,
                    carbs: local.carbs,
                    fat: local.fat,
                    fiber: local.fiber,
                  }
                : null
            }
            grams={row.grams}
            estimatedGrams={Math.max(1, Math.round(match.estimated_grams))}
            isPhotoReview={isPhotoReview}
            displayUnit={row.displayUnit}
            pieceGrams={row.pieceGrams}
            estimatedPieceCount={analysisComponent?.estimated_piece_count}
            aiGramsPerPiece={analysisComponent?.grams_per_piece}
            selectedRank={row.selectedRank || 1}
            onSelectedRankChange={(selectedRank) => updateRow(match.component_id, { selectedRank })}
            onGramsChange={(grams) => updateRow(match.component_id, { grams })}
            onDisplayUnitChange={(displayUnit, pieceGramsFromUi) => {
              const candidate = match.candidates[(row.selectedRank || 1) - 1] ?? match.candidates[0];
              const pg =
                displayUnit === 'piece'
                  ? (pieceGramsFromUi ??
                    ensurePieceGramsForReview(
                      pieceContextFromAnalysis(
                        match.component_name,
                        candidate?.serving_size,
                        row.grams,
                        analysisComponent,
                      ),
                    ))
                  : null;
              updateRow(match.component_id, {
                displayUnit,
                pieceGrams: pg,
              });
            }}
            onRemove={onRemoveComponent ? () => onRemoveComponent(match.component_id) : undefined}
          />
        );
      })}
      {onAddIngredient ? (
        <button
          type="button"
          onClick={onAddIngredient}
          className="w-full py-2.5 rounded-lg border border-dashed border-white/25 text-xs text-white/70"
        >
          + Zutat manuell hinzufügen
        </button>
      ) : null}
    </div>
  );
}
