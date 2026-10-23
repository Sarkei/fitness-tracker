import { useState } from 'react';
import { motion } from 'motion/react';
import { X, Brain, Loader2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { MealCategory, type Ingredient } from '@/src/types';
import { analyzeMeal } from '@/src/services/aiNutritionService';
import { ingredientFromProposedDbFood, mergeSessionIngredients } from '@/src/lib/mealAiShared';
import {
  finalizeNutritionPipelineV3,
  processNutritionPipelineV3,
} from '@/src/services/nutritionLogService';
import { recomputePipelineFromReview } from '@/src/lib/nutrition/pipeline/legacyAdapter';
import { useAiCapabilities } from '@/src/lib/AiCapabilitiesContext';
import { useI18n } from '@/src/lib/i18n';
import { getMealTypeForCurrentTime } from '@/src/lib/mealTime';
import {
  mobileSheetOverlayClass,
  overlayPortal,
  useMobileOverlaySheet,
} from '@/src/lib/mobileViewport';

interface QuickLogNutritionModalProps {
  onClose: () => void;
  onLogged: () => void | Promise<void>;
  onFallbackLog?: (data: {
    meal: string;
    mealType: MealCategory;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    ingredients?: Ingredient[];
  }) => void | Promise<void>;
}

export default function QuickLogNutritionModal({
  onClose,
  onLogged,
  onFallbackLog,
}: QuickLogNutritionModalProps) {
  const aiCaps = useAiCapabilities();
  const { t } = useI18n();
  useMobileOverlaySheet(true);
  const [text, setText] = useState('');
  const [mealType, setMealType] = useState<MealCategory>(getMealTypeForCurrentTime());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const logPlain = () => {
    return onFallbackLog?.({
      meal: text.trim(),
      mealType,
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
    });
  };

  const handleSubmit = async () => {
    if (!text.trim()) return;
    setSubmitError(null);
    if (!aiCaps.enabled) {
      await logPlain();
      await onLogged();
      return;
    }
    setIsAnalyzing(true);
    try {
      const v3 = await processNutritionPipelineV3({ text: text.trim() });
      const reviewed = v3.matches.map((m) => ({
        component_id: m.component_id,
        grams: Math.round(m.estimated_grams),
        selectedRank: m.auto_selected_rank ?? 1,
        user_modified: false,
      }));
      const recomputed = recomputePipelineFromReview(v3, reviewed);
      await finalizeNutritionPipelineV3({
        result: recomputed,
        reviewedComponents: reviewed,
        originalInput: text.trim(),
        category: mealType,
        date: new Date().toISOString().split('T')[0],
      });
      await onLogged();
      return;
    } catch {
      // Fallback: bestehender AI-Flow ohne V3-Finalize
    }
    try {
      const result = await analyzeMeal(text);
      const lines = [
        ...result.ingredients,
        ...result.proposedDbFoods.map(ingredientFromProposedDbFood),
      ];
      if (lines.length === 0) {
        await logPlain();
        await onLogged();
        return;
      }
      const merged = mergeSessionIngredients(lines);
      await onFallbackLog?.({
        meal: merged.meal,
        mealType,
        calories: merged.calories,
        protein: merged.protein,
        carbs: merged.carbs,
        fat: merged.fat,
        ingredients: merged.ingredients,
      });
      await onLogged();
    } catch (error) {
      console.error('Failed to analyze meal:', error);
      setSubmitError(t('nut.quick.aiFailed'));
    } finally {
      setIsAnalyzing(false);
    }
  };

  return overlayPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={mobileSheetOverlayClass()}
      style={{ paddingTop: 'max(0px, env(safe-area-inset-top))' }}
    >
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        role="presentation"
        aria-hidden
      />
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="relative z-10 flex h-[100dvh] max-h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[2rem] border border-[var(--border-muted)] bg-[var(--card-bg)] shadow-2xl lg:h-auto lg:max-h-[min(92dvh,720px)] lg:rounded-[2rem]"
        style={{ paddingBottom: 'max(0px, env(safe-area-inset-bottom))' }}
      >
        <div className="shrink-0 border-b border-[var(--border-muted)] px-5 pb-3 pt-[max(1rem,env(safe-area-inset-top))] md:px-7 md:pb-4 md:pt-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-widest text-brand">{t('nut.quick.badge')}</p>
              <h3 className="mt-0.5 text-xl font-black uppercase italic tracking-tighter text-[var(--text-primary)] md:text-2xl">
                {t('nut.quick.title')}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl p-2 text-[var(--text-muted)] touch-manipulation hover:bg-[var(--background)]"
              aria-label={t('nut.foodLog.cancel')}
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div
          className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-y-contain px-5 py-4 md:px-7 [-webkit-overflow-scrolling:touch]"
        >
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {t('nut.quick.mealType')}
            </label>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {(['breakfast', 'lunch', 'dinner', 'snack'] as MealCategory[]).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setMealType(cat)}
                  className={cn(
                    'min-h-[48px] rounded-xl px-3 py-3 text-[9px] font-black uppercase tracking-widest transition-all touch-manipulation active:opacity-90',
                    mealType === cat
                      ? 'ui-mark-selected'
                      : 'border border-[var(--border-muted)] bg-[var(--background)] text-[var(--text-muted)] hover:border-brand',
                  )}
                >
                  {t(`nut.cat.${cat}` as 'nut.cat.breakfast')}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="mb-2 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              {t('nut.quick.whatEat')}
            </label>
            <textarea
              data-testid="quicklog-textarea"
              value={text}
              onChange={e => {
                setText(e.target.value);
                setSubmitError(null);
              }}
              placeholder={t('nut.quick.placeholder')}
              rows={5}
              className="w-full min-h-[8rem] resize-y rounded-xl border border-[var(--border-muted)] bg-[var(--background)] p-4 text-base font-medium text-[var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-brand"
            />
            {submitError ? (
              <p className="mt-2 text-[11px] font-medium leading-snug text-[var(--text-primary)]" role="alert">
                {submitError}
              </p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 space-y-2 border-t border-[var(--border-muted)] bg-[var(--card-bg)] px-5 py-4 md:px-7">
          {submitError && aiCaps.enabled ? (
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleSubmit()}
                disabled={isAnalyzing || !text.trim()}
                className="flex min-h-[52px] flex-1 touch-manipulation items-center justify-center gap-2 ui-btn-brand py-3 text-[10px] disabled:opacity-50 sm:min-h-[48px] active:opacity-90"
              >
                {isAnalyzing ? <Loader2 className="animate-spin" size={14} /> : <Brain size={14} />}
                {isAnalyzing ? t('nut.quick.analyzing') : t('nut.common.retry')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSubmitError(null);
                  logPlain();
                }}
                disabled={isAnalyzing || !text.trim()}
                className="flex min-h-[52px] flex-1 touch-manipulation items-center justify-center rounded-xl border border-[var(--border-muted)] bg-[var(--background)] py-3 text-[10px] font-black uppercase tracking-widest text-[var(--text-primary)] disabled:opacity-50 sm:min-h-[48px] active:opacity-90"
              >
                {t('nut.quick.savePlain')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="quicklog-submit"
              title={!aiCaps.loading && !aiCaps.enabled ? t('nut.quick.aiHint') : undefined}
              onClick={() => void handleSubmit()}
              disabled={isAnalyzing || !text.trim()}
              className="flex min-h-[52px] w-full touch-manipulation items-center justify-center gap-2 ui-btn-brand py-3 text-[10px] disabled:opacity-50 sm:min-h-[48px] active:opacity-90"
            >
              {isAnalyzing ? <Loader2 className="animate-spin" size={14} /> : <Brain size={14} />}
              {isAnalyzing
                ? t('nut.quick.analyzing')
                : aiCaps.enabled
                  ? t('nut.quick.logAi')
                  : t('nut.quick.savePlain')}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>,
  );
}