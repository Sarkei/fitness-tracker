import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import type { ComponentMatch, ComponentNutrition } from '@/src/lib/nutrition/pipeline/schemas';
import {
  ensurePieceGramsForReview,
  gramsFromPieceQuantity,
  isSliceCountedFood,
  pieceContextFromAnalysis,
  pieceQuantityFromGrams,
} from '@/src/lib/nutrition/pieceUnitHelpers';
import { useI18n } from '@/src/lib/i18n';
import type { PortionDisplayUnit } from './MealReviewScreen';

type Props = {
  match: ComponentMatch;
  current: ComponentNutrition | null;
  grams: number;
  displayUnit: PortionDisplayUnit;
  pieceGrams: number | null;
  estimatedGrams?: number;
  gramConfidence?: 'high' | 'medium' | 'low';
  gramReasoning?: string;
  estimatedPieceCount?: number | null;
  aiGramsPerPiece?: number | null;
  isPhotoReview?: boolean;
  selectedRank?: number;
  onSelectedRankChange?: (rank: number) => void;
  onGramsChange: (grams: number) => void;
  onDisplayUnitChange?: (unit: PortionDisplayUnit, pieceGrams: number | null) => void;
  onRemove?: () => void;
};

function confidenceBadgeClass(level: 'high' | 'medium' | 'low'): string {
  if (level === 'high') return 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10';
  if (level === 'medium') return 'border-amber-500/40 text-amber-200 bg-amber-500/10';
  return 'border-red-500/40 text-red-200 bg-red-500/10';
}

export default function IngredientRow({
  match,
  current,
  grams,
  displayUnit,
  pieceGrams: pieceGramsProp,
  estimatedGrams,
  gramConfidence,
  gramReasoning,
  estimatedPieceCount,
  aiGramsPerPiece,
  isPhotoReview = false,
  selectedRank = 1,
  onSelectedRankChange,
  onGramsChange,
  onDisplayUnitChange,
  onRemove,
}: Props) {
  const { t } = useI18n();
  const selected =
    match.candidates[Math.max(0, (selectedRank || 1) - 1)] ?? match.candidates[0];
  const candidatePieceGrams = useMemo(
    () =>
      ensurePieceGramsForReview(
        pieceContextFromAnalysis(match.component_name, selected?.serving_size, grams, {
          gram_reasoning: gramReasoning,
          estimated_piece_count: estimatedPieceCount,
          grams_per_piece: aiGramsPerPiece,
        }),
      ),
    [
      selected?.serving_size,
      match.component_name,
      grams,
      gramReasoning,
      estimatedPieceCount,
      aiGramsPerPiece,
    ],
  );
  const effectivePieceGrams = pieceGramsProp ?? candidatePieceGrams;
  const allowPieceOption = true;
  const unitMode = displayUnit === 'piece' ? 'piece' : 'g';
  const pieceQty =
    unitMode === 'piece' && effectivePieceGrams
      ? pieceQuantityFromGrams(grams, effectivePieceGrams)
      : null;
  const pieceUnitLabel = isSliceCountedFood(match.component_name)
    ? t('nut.ingredient.unit.slice')
    : t('nut.ingredient.unit.piece');

  const sourceLabel = (source: string): string => {
    if (source === 'openfoodfacts') return t('nut.ingredient.source.off');
    if (source === 'chain_menu_data') return t('nut.ingredient.source.chain');
    return t('nut.ingredient.source.generic');
  };

  const confidenceLabel = (level: 'high' | 'medium' | 'low'): string => {
    if (level === 'high') return t('nut.ingredient.conf.high');
    if (level === 'medium') return t('nut.ingredient.conf.medium');
    return t('nut.ingredient.conf.low');
  };

  const photoRange = useMemo(() => {
    const base = Math.max(1, Math.round(estimatedGrams ?? grams));
    const min = Math.max(1, Math.round(base * 0.2));
    const max = Math.max(min + 5, Math.round(base * 3));
    return { min, max, base };
  }, [estimatedGrams, grams]);

  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">{match.component_name}</p>
          <p className="text-[11px] text-white/60 truncate">
            {selected
              ? selected.data_source === 'estimated_fallback'
                ? `${selected.product_name} · ${t('nut.ingredient.average')}`
                : selected.product_name
              : match.candidates.length === 0
                ? t('nut.ingredient.noHit')
                : '—'}
          </p>
          {match.candidates.length > 1 && onSelectedRankChange ? (
            <label className="mt-1.5 block">
              <span className="sr-only">{t('nut.ingredient.pickFood')}</span>
              <select
                className="mt-0.5 w-full max-w-full rounded-lg border border-white/15 bg-black/40 px-2 py-1.5 text-[11px] text-white/90"
                value={String(Math.min(selectedRank || 1, match.candidates.length))}
                onChange={(e) => onSelectedRankChange(Math.max(1, Number(e.target.value) || 1))}
              >
                {match.candidates.map((c, i) => (
                  <option key={`${c.openfoodfacts_id ?? c.product_name}-${i}`} value={i + 1}>
                    {c.product_name}
                    {c.brand ? ` · ${c.brand}` : ''}
                    {c.data_source === 'estimated_fallback'
                      ? ` · ${t('nut.ingredient.source.generic')}`
                      : ` · ${sourceLabel(c.data_source)}`}
                    {` (${Math.round(c.score)})`}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="flex items-center gap-1 shrink-0 flex-wrap justify-end">
          {selected ? (
            <span className="shrink-0 rounded border border-white/20 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/80">
              {sourceLabel(selected.data_source)}
            </span>
          ) : null}
          {isPhotoReview && gramConfidence ? (
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full border ${confidenceBadgeClass(gramConfidence)}`}
              title={gramReasoning || undefined}
            >
              {confidenceLabel(gramConfidence)}
            </span>
          ) : null}
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="p-1 text-white/50 hover:text-red-400"
              aria-label={t('nut.ingredient.remove')}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        {isPhotoReview ? (
          <div className="rounded-lg border border-white/10 bg-black/30 px-2 py-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] text-white/60">{t('nut.ingredient.photoPortion')}</label>
              <span className="text-[11px] text-white/55">
                {t('nut.ingredient.aiGrams', { g: photoRange.base })}
              </span>
            </div>
            <input
              type="range"
              min={photoRange.min}
              max={photoRange.max}
              step={5}
              value={Math.max(photoRange.min, Math.min(photoRange.max, grams))}
              onChange={(e) => onGramsChange(Math.max(1, Number(e.target.value) || photoRange.base))}
              className="mt-2 w-full"
              aria-label={t('nut.ingredient.photoAria')}
            />
            {gramReasoning ? (
              <p className="mt-2 text-[10px] text-white/55 leading-snug">{gramReasoning}</p>
            ) : null}
          </div>
        ) : null}
        <div className="space-y-2">
          <label className="text-xs text-white/60">
            {unitMode === 'piece'
              ? t('nut.ingredient.amountUnit', { unit: pieceUnitLabel })
              : t('nut.ingredient.grams')}
          </label>
          {allowPieceOption ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onDisplayUnitChange?.('g', null)}
                className={`px-2 py-0.5 rounded border text-[10px] ${unitMode === 'g' ? 'border-brand/60 bg-brand/15 text-brand' : 'border-white/15 text-white/65'}`}
              >
                {t('nut.ingredient.grams')}
              </button>
              <button
                type="button"
                onClick={() => onDisplayUnitChange?.('piece', effectivePieceGrams)}
                className={`px-2 py-0.5 rounded border text-[10px] ${unitMode === 'piece' ? 'border-brand/60 bg-brand/15 text-brand' : 'border-white/15 text-white/65'}`}
              >
                {t('nut.ingredient.pieceWithG', {
                  unit: pieceUnitLabel,
                  g: Math.round(effectivePieceGrams),
                })}
              </button>
            </div>
          ) : null}
          <div className="rounded-lg border border-white/10 bg-black/25 px-2.5 py-2.5 space-y-2">
            <p className="text-[11px] text-white/60">
              {unitMode === 'piece'
                ? t('nut.ingredient.amountUnit', { unit: pieceUnitLabel })
                : t('nut.ingredient.amountG')}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="w-9 h-9 rounded-lg border border-white/15 text-lg"
                onClick={() => {
                  if (unitMode === 'piece' && effectivePieceGrams && pieceQty != null) {
                    onGramsChange(gramsFromPieceQuantity(pieceQty - 0.25, effectivePieceGrams));
                    return;
                  }
                  onGramsChange(Math.max(1, grams - 10));
                }}
              >
                −
              </button>
              <input
                type="number"
                min={unitMode === 'piece' ? 0.25 : 1}
                step={unitMode === 'piece' ? 0.25 : 10}
                value={unitMode === 'piece' && pieceQty != null ? pieceQty : grams}
                onChange={(e) => {
                  const raw = Number(e.target.value) || (unitMode === 'piece' ? 0.25 : 1);
                  if (unitMode === 'piece' && effectivePieceGrams) {
                    onGramsChange(gramsFromPieceQuantity(raw, effectivePieceGrams));
                    return;
                  }
                  onGramsChange(Math.max(1, Math.round(raw)));
                }}
                className="w-24 rounded-lg bg-black/40 border border-white/15 px-2 py-1.5 text-sm text-center tabular-nums"
              />
              <button
                type="button"
                className="w-9 h-9 rounded-lg border border-white/15 text-lg"
                onClick={() => {
                  if (unitMode === 'piece' && effectivePieceGrams && pieceQty != null) {
                    onGramsChange(gramsFromPieceQuantity(pieceQty + 0.25, effectivePieceGrams));
                    return;
                  }
                  onGramsChange(grams + 10);
                }}
              >
                +
              </button>
              <span className="ml-auto text-xs text-white/70 whitespace-nowrap">
                {unitMode === 'piece' && pieceQty != null
                  ? `${Math.round(grams)} g · ${current ? `${current.kcal} kcal` : '—'}`
                  : current
                    ? `${current.kcal} kcal`
                    : '—'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
